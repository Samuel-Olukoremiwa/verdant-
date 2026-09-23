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
  const { id } =
    await params

  const supabase =
    await createClient()

  const {
    data: { user },
  } =
    await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      {
        error:
          'Not signed in',
      },
      {
        status: 401,
      }
    )
  }

  const {
    data: admin,
  } =
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
        error:
          'Not authorized',
      },
      {
        status: 403,
      }
    )
  }

  const service =
    createServiceClient()

  const {
    data: reg,
    error:
      registrationError,
  } =
    await service
      .from(
        'registration_requests'
      )
      .select('*')
      .eq('id', id)
      .single()

  if (
    registrationError ||
    !reg
  ) {
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

  if (
    reg.status !==
    'pending'
  ) {
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

  const input =
    z
      .object({
        move_in_date:
          z.iso
            .date()
            .optional(),

        property_allocation_date:
          z.iso
            .date()
            .optional(),
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

  const dates =
    z
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
          reg
            .property_allocation_date,
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
          'This registration does not have a valid street.',
      },
      {
        status: 400,
      }
    )
  }

  const email =
    String(
      reg.email ?? ''
    )
      .trim()
      .toLowerCase()

  if (!email) {
    return NextResponse.json(
      {
        error:
          'This registration does not have a valid email address.',
      },
      {
        status: 400,
      }
    )
  }

  /*
   * Prevent approving another active
   * resident record with the same email.
   */
  const {
    data:
      duplicateResident,
    error:
      duplicateLookupError,
  } =
    await service
      .from('residents')
      .select(
        'id, full_name, auth_user_id'
      )
      .eq(
        'is_active',
        true
      )
      .ilike(
        'email',
        email
      )
      .limit(1)
      .maybeSingle()

  if (duplicateLookupError) {
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
          `An active resident already uses this email address${
            duplicateResident.full_name
              ? `: ${duplicateResident.full_name}`
              : ''
          }.`,
      },
      {
        status: 409,
      }
    )
  }

  /*
   * Resolve the physical house.
   *
   * If the same street + canonical
   * house number already exists, the
   * registration is attached to that
   * existing house rather than creating
   * duplicate billing.
   */
  const {
    data: houseId,
    error:
      houseError,
  } =
    await service.rpc(
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
    typeof houseId !==
      'string'
  ) {
    const rawMessage =
      houseError?.message ??
      ''

    if (
      rawMessage.includes(
        'resolve_registration_house'
      ) ||
      rawMessage.includes(
        'schema cache'
      )
    ) {
      return NextResponse.json(
        {
          error:
            'The registration database migration has not been applied yet. Run the database migrations in Supabase, then try again.',
        },
        {
          status: 503,
        }
      )
    }

    return NextResponse.json(
      {
        error:
          rawMessage ||
          'Could not resolve the property',
      },
      {
        status: 400,
      }
    )
  }

  /*
   * There may only be one active owner
   * for a physical house.
   */
  if (
    reg.relationship ===
    'owner'
  ) {
    const {
      data:
        existingOwner,
      error:
        ownerLookupError,
    } =
      await service
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

    if (ownerLookupError) {
      return NextResponse.json(
        {
          error:
            'Could not verify the existing Home Owner for this property.',
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
            `House ${reg.house_number} already has an active Home Owner: ${existingOwner.full_name}. Change this applicant to Tenant or Family Member if appropriate.`,
        },
        {
          status: 409,
        }
      )
    }
  }

  const fullName =
    [
      reg.first_name,
      reg.other_names,
      reg.surname,
    ]
      .map((value) =>
        String(
          value ?? ''
        ).trim()
      )
      .filter(Boolean)
      .join(' ')

  if (!fullName) {
    return NextResponse.json(
      {
        error:
          'This registration does not contain a valid resident name.',
      },
      {
        status: 400,
      }
    )
  }

  const qrValue =
    `RES-${crypto.randomUUID()}`

  /*
   * Create the estate resident first.
   *
   * auth_user_id remains NULL until the
   * Supabase Auth invite succeeds.
   */
  const {
    data: resident,
    error:
      residentError,
  } =
    await service
      .from('residents')
      .insert({
        house_id:
          houseId,

        full_name:
          fullName,

        phone:
          reg.phone,

        email,

        relationship:
          reg.relationship,

        block_number:
          reg.block_number ??
          null,

        flat_number:
          reg.flat_number ??
          null,

        vehicle_plate_numbers:
          reg
            .vehicle_plate_numbers ??
          null,

        emergency_contact_name:
          reg
            .emergency_contact_name ??
          null,

        emergency_contact_phone:
          reg
            .emergency_contact_phone ??
          null,

        ...dates.data,

        qr_code_value:
          qrValue,
      })
      .select(
        'id, email, full_name'
      )
      .single()

  if (
    residentError ||
    !resident
  ) {
    return NextResponse.json(
      {
        error:
          residentError?.message ??
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

  /*
   * A NEW account uses the INVITE flow.
   *
   * It must go to /set-password,
   * never /reset-password.
   */
  const siteUrl =
    process.env
      .NEXT_PUBLIC_SITE_URL
      ?.replace(
        /\/$/,
        ''
      )

  if (!siteUrl) {
    /*
     * Resident creation must be rolled
     * back if we cannot safely create
     * their login.
     */
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
          'NEXT_PUBLIC_SITE_URL is not configured. Resident approval was not completed.',
      },
      {
        status: 500,
      }
    )
  }

  const {
    data: invited,
    error:
      inviteError,
  } =
    await service
      .auth
      .admin
      .inviteUserByEmail(
        email,
        {
          redirectTo:
            `${siteUrl}/set-password`,
        }
      )

  if (
    inviteError ||
    !invited.user
  ) {
    /*
     * Do not leave a resident record
     * behind when Auth account creation
     * failed.
     */
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
          'Could not send the portal invitation',
      },
      {
        status: 500,
      }
    )
  }

  /*
   * Extra account-isolation safety:
   * the Auth user returned by Supabase
   * must carry the same email as the
   * resident being approved.
   */
  const invitedEmail =
    invited.user.email
      ?.trim()
      .toLowerCase()

  if (
    !invitedEmail ||
    invitedEmail !== email
  ) {
    /*
     * Do NOT link a mismatched Auth user
     * to this resident.
     */
    await service
      .from('residents')
      .delete()
      .eq(
        'id',
        resident.id
      )

    /*
     * The newly created Auth account is
     * also removed because it did not
     * pass the identity check.
     */
    await service
      .auth
      .admin
      .deleteUser(
        invited.user.id
      )

    return NextResponse.json(
      {
        error:
          'The portal account email did not match the resident email. No resident login was linked.',
      },
      {
        status: 500,
      }
    )
  }

  /*
   * Link THIS resident to THIS newly
   * invited Supabase Auth user.
   */
  const {
    error:
      linkError,
  } =
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
      .is(
        'auth_user_id',
        null
      )

  if (linkError) {
    /*
     * Don't leave an ambiguous account
     * relationship behind.
     */
    await service
      .auth
      .admin
      .deleteUser(
        invited.user.id
      )

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
          'The invitation was created, but the resident account could not be linked safely. The incomplete account was rolled back.',
      },
      {
        status: 500,
      }
    )
  }

  /*
   * Confirm the link we just wrote.
   */
  const {
    data:
      linkedResident,
    error:
      linkedResidentError,
  } =
    await service
      .from('residents')
      .select(
        'id, email, auth_user_id'
      )
      .eq(
        'id',
        resident.id
      )
      .single()

  if (
    linkedResidentError ||
    !linkedResident ||
    linkedResident.auth_user_id !==
      invited.user.id ||
    linkedResident.email
      ?.trim()
      .toLowerCase() !==
      email
  ) {
    return NextResponse.json(
      {
        error:
          'Resident account verification failed after invitation. Please contact the administrator before retrying.',
      },
      {
        status: 500,
      }
    )
  }

  /*
   * Registration is only considered
   * approved after the resident and Auth
   * account are safely linked.
   */
  const {
    error:
      approvalError,
  } =
    await service
      .from(
        'registration_requests'
      )
      .update({
        status:
          'approved',

        ...dates.data,

        reviewed_by:
          admin.id,

        reviewed_at:
          new Date()
            .toISOString(),

        created_resident_id:
          resident.id,
      })
      .eq(
        'id',
        id
      )
      .eq(
        'status',
        'pending'
      )

  if (approvalError) {
    return NextResponse.json(
      {
        error:
          'The resident account was created, but saving the registration approval failed. Please contact the administrator before retrying.',
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

    authUserId:
      invited.user.id,

    sms,
  })
}