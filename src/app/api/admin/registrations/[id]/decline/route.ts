import {
  NextRequest,
  NextResponse,
} from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const schema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(
        3,
        'Decline reason is required.'
      )
      .max(
        500,
        'Decline reason must be 500 characters or fewer.'
      ),
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
        error: 'Not signed in',
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
        error: 'Not authorized',
      },
      {
        status: 403,
      }
    )
  }

  const parsed =
    schema.safeParse(
      await req
        .json()
        .catch(() => null)
    )

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]
            ?.message ??
          'Decline reason is required.',
      },
      {
        status: 400,
      }
    )
  }

  const service =
    createServiceClient()

  const {
    data: updated,
    error,
  } =
    await service
      .from(
        'registration_requests'
      )
      .update({
        status: 'declined',

        decline_reason:
          parsed.data.reason,

        reviewed_by:
          admin.id,

        reviewed_at:
          new Date()
            .toISOString(),
      })
      .eq('id', id)
      .eq(
        'status',
        'pending'
      )
      .select('id')
      .maybeSingle()

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
      },
      {
        status: 500,
      }
    )
  }

  if (!updated) {
    return NextResponse.json(
      {
        error:
          'This registration has already been reviewed or no longer exists.',
      },
      {
        status: 409,
      }
    )
  }

  return NextResponse.json({
    ok: true,
  })
}