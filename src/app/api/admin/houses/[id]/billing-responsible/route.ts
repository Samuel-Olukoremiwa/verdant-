import {
  NextRequest,
  NextResponse,
} from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const bodySchema = z
  .object({
    resident_id:
      z.uuid().nullable(),
  })
  .strict()

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

  if (
    !z.uuid()
      .safeParse(id)
      .success
  ) {
    return NextResponse.json(
      {
        error:
          'Invalid household',
      },
      {
        status: 400,
      }
    )
  }

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
      .select('role')
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

  const parsed =
    bodySchema.safeParse(
      await req
        .json()
        .catch(() => null)
    )

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          'Choose a valid billing contact',
      },
      {
        status: 400,
      }
    )
  }

  const {
    resident_id,
  } = parsed.data

  const service =
    createServiceClient()

  if (resident_id) {
    const {
      data: resident,
      error: residentError,
    } = await service
      .from('residents')
      .select(
        'id, house_id, is_active'
      )
      .eq(
        'id',
        resident_id
      )
      .maybeSingle()

    if (
      residentError ||
      !resident
    ) {
      return NextResponse.json(
        {
          error:
            'Resident not found',
        },
        {
          status: 404,
        }
      )
    }

    if (
      !resident.is_active ||
      resident.house_id !== id
    ) {
      return NextResponse.json(
        {
          error:
            'Billing contact must be an active resident of this household',
        },
        {
          status: 400,
        }
      )
    }
  }

  const {
    data: updated,
    error,
  } = await service
    .from('houses')
    .update({
      billing_responsible_resident_id:
        resident_id,
    })
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status: 400,
      }
    )
  }

  if (!updated) {
    return NextResponse.json(
      {
        error:
          'Household not found',
      },
      {
        status: 404,
      }
    )
  }

  return NextResponse.json({
    ok: true,
    billing_responsible_resident_id:
      resident_id,
  })
}