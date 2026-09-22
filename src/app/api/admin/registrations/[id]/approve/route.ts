import { z } from 'zod'
import { dispatchSms } from '@/lib/sms-dispatch'
import {
  NextRequest,
  NextResponse,
} from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string
    }>
  }
) {
  const { id } = await params

  const supabase =
    await createClient()

  const {
    data: { user },
  } =
    await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      {
        error: 'Not signed in',
      },
      {
        status: 401,
      }
    )
  }

  const { data: admin } =
    await supabase
      .from('admins')
      .select('id, role')
      .eq(
        'auth_user_id',
        user.id
      )
      .single()

  if (
    !admin ||
    ![
      'admin',
      'super_admin',
    ].includes(admin.role)
  ) {
    return NextResponse.json(
      {
        error: 'Not authorized',
      },
      {
        status: 403,
      }
    )
  }

  const service =
    createServiceClient()

  const { data: reg } =
    await service
      .from(
        'registration_requests'
      )
      .select('*')
      .eq('id', id)
      .single()

  if (!reg) {
    return NextResponse.json(
      {
        error:
          'Registration request not found',
      },
      {
        status: 404,
      }
    )
  }

  if (reg.status !== 'pending') {
    return NextResponse.json(
      {
        error:
          'This request has already been reviewed',
      },
      {
        status: 400,
      }
    )
  }

  const input = z
    .object({
      move_in_date:
        z.iso.date().optional(),

      property_allocation_date:
        z.iso.date().optional(),
    })
    .strict()
    .safeParse(
      await req
        .json()
        .catch(() => ({}))
    )

  if (!input.success) {
    return NextResponse.json(
      {
        error:
          'Enter valid move-in and property allocation dates.',
      },
      {
        status: 400,
      }
    )
  }

  const dates = z
    .object({
      move_in_date:
        z.iso.date(),

      property_allocation_date:
        z.iso.date(),
    })
    .safeParse({
      move_in_date:
        input.data
          .move_in_date ??
        reg.move_in_date,

      property_allocation_date:
        input.data
          .property_allocation_date ??
        reg.property_allocation_date,
    })

  if (!dates.success) {
    return NextResponse.json(
      {
        error:
          'Enter valid move-in and property allocation dates before approval.',
      },
      {
        status: 400,
      }
    )
  }

  if (!reg.street_id) {
    return NextResponse.json(
      {
        error:
          'This registration does not have a valid street. Correct the address before approval.',
      },
      {
        status: 400,
      }
    )
  }

  const email = String(
    reg.email ?? ''
  )
    .trim()
    .toLowerCase()

  const {
    data: duplicateResident,
    error: duplicateError,
  } = await service
    .from('residents')
    .select('id')
    .eq('is_active', true)
    .ilike('email', email)
    .limit(1)
    .maybeSingle()

  if (duplicateError) {
    return NextResponse.json(
      {
        error:
          'Could not verify whether this resident already exists.',
      },
      {
        status: 500,
      }
    )
  }

  if (duplicateResident) {
    return NextResponse.json(
      {
        error:
          'An active resident already uses this email address.',
      },
      {
        status: 409,
      }
    )
  }

  // Resolve the property instead of
  // blindly creating another house.
  //
  // If the same street + house/block/
  // flat already exists, we reuse the
  // existing house_id.
  const {
    data: houseId,
    error: houseError,
  } = await service.rpc(
    'resolve_registration_house',
    {
      p_street_id:
        reg.street_id,

      p_house_number:
        reg.house_number,

      p_house_type:
        reg.house_type,
    }
  )

  if (
    houseError ||
    typeof houseId !== 'string'
  ) {
    return NextResponse.json(
      {
        error:
          houseError?.message ??
          'Could not resolve the property',
      },
      {
        status: 400,
      }
    )
  }

  // There can only be one active
  // Home Owner for a household.
  if (
    reg.relationship === 'owner'
  ) {
    const {
      data: existingOwner,
      error: ownerError,
    } = await service
      .from('residents')
      .select(
        'id, full_name'
      )
      .eq(
        'house_id',
        houseId
      )
      .eq(
        'relationship',
        'owner'
      )
      .eq(
        'is_active',
        true
      )
      .limit(1)
      .maybeSingle()

    if (ownerError) {
      return NextResponse.json(
        {
          error:
            'Could not verify the household owner.',
        },
        {
          status: 500,
        }
      )
    }

    if (existingOwner) {
      return NextResponse.json(
        {
          error:
            `This property already has an active Home Owner: ${existingOwner.full_name}. Change this registration to Tenant or Family Member if appropriate.`,
        },
        {
          status: 409,
        }
      )
    }
  }

  const fullName = [
    reg.first_name,
    reg.other_names,
    reg.surname,
  ]
    .map((value) =>
      String(value ?? '').trim()
    )
    .filter(Boolean)
    .join(' ')

  const qrValue =
    `RES-${crypto.randomUUID()}`

  const {
    data: resident,
    error: residentError,
  } = await service
    .from('residents')
    .insert({
      house_id: houseId,
      full_name: fullName,
      phone: reg.phone,
      email,
      relationship:
        reg.relationship,
      ...dates.data,
      qr_code_value:
        qrValue,
    })
    .select()
    .single()

  if (
    residentError ||
    !resident
  ) {
    return NextResponse.json(
      {
        error:
          residentError?.code ===
          '23505'
            ? 'This resident or household relationship conflicts with an existing record.'
            : residentError?.message ??
              'Could not create resident',
      },
      {
        status:
          residentError?.code ===
          '23505'
            ? 409
            : 500,
      }
    )
  }

  // Create portal login.
  const {
    data: invited,
    error: inviteError,
  } =
    await service.auth.admin
      .inviteUserByEmail(
        email,
        {
          redirectTo:
            `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
        }
      )

  if (
    inviteError ||
    !invited.user
  ) {
    // Do not leave a duplicate resident
    // record if Auth creation failed.
    await service
      .from('residents')
      .delete()
      .eq(
        'id',
        resident.id
      )

    return NextResponse.json(
      {
        error:
          inviteError?.message ??
          'Could not send invite',
      },
      {
        status: 500,
      }
    )
  }

  const { error: linkError } =
    await service
      .from('residents')
      .update({
        auth_user_id:
          invited.user.id,
      })
      .eq(
        'id',
        resident.id
      )

  if (linkError) {
    return NextResponse.json(
      {
        error:
          'The invitation was sent, but linking the resident account failed. Please contact the administrator before retrying.',
      },
      {
        status: 500,
      }
    )
  }

  const {
    error: approvalError,
  } = await service
    .from(
      'registration_requests'
    )
    .update({
      status: 'approved',

      ...dates.data,

      reviewed_by:
        admin.id,

      reviewed_at:
        new Date().toISOString(),

      created_resident_id:
        resident.id,
    })
    .eq('id', id)

  if (approvalError) {
    return NextResponse.json(
      {
        error:
          'The resident account was created, but saving approval failed. Please contact the administrator before retrying.',
      },
      {
        status: 500,
      }
    )
  }

  const sms =
    await dispatchSms(
      `registration:${id}`,
      'registration',
      reg.phone ?? '',
      'Verdant: Your estate registration is approved. Check your email, including spam, for the invitation to set your password and access the resident portal.'
    )

  return NextResponse.json({
    email,
    residentName:
      fullName,
    houseId,
    sms,
  })
}