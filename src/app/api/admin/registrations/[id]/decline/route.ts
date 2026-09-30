import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  z,
} from 'zod'

import {
  createClient,
} from '@/lib/supabase/server'

import {
  createServiceClient,
} from '@/lib/supabase/service'

const schema =
  z
    .object({
      reason:
        z
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

type DeclineResult = {
  declined?:
    boolean

  reason?:
    string

  status?:
    string

  claimed_at?:
    string
}

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
  const {
    id,
  } =
    await params

  const supabase =
    await createClient()

  const {
    data: {
      user,
    },
  } =
    await supabase.auth.getUser()

  if (
    !user
  ) {
    return NextResponse.json(
      {
        error:
          'Not signed in',
      },
      {
        status:
          401,
      }
    )
  }

  const {
    data:
      admin,

    error:
      adminError,
  } =
    await supabase
      .from(
        'admins'
      )
      .select(
        'id, role'
      )
      .eq(
        'auth_user_id',
        user.id
      )
      .single()

  if (
    adminError ||
    !admin ||
    ![
      'admin',
      'super_admin',
    ].includes(
      admin.role
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Not authorized',
      },
      {
        status:
          403,
      }
    )
  }

  const parsed =
    schema.safeParse(
      await req
        .json()
        .catch(
          () =>
            null
        )
    )

  if (
    !parsed.success
  ) {
    return NextResponse.json(
      {
        error:
          parsed
            .error
            .issues[0]
            ?.message ??
          'Decline reason is required.',
      },
      {
        status:
          400,
      }
    )
  }

  const service =
    createServiceClient()

  /*
   * Decline is performed in PostgreSQL so checking:
   *
   * - current registration status
   * - current approval claim
   * - claim expiry
   * - status transition
   *
   * all happen while the same row is locked.
   */
  const {
    data:
      resultData,

    error:
      declineError,
  } =
    await service.rpc(
      'decline_registration_request',
      {
        p_registration:
          id,

        p_admin:
          admin.id,

        p_reason:
          parsed.data.reason,
      }
    )

  if (
    declineError
  ) {
    const message =
      declineError.message ??
      ''

    if (
      message.includes(
        'decline_registration_request'
      ) ||
      message.includes(
        'schema cache'
      )
    ) {
      return NextResponse.json(
        {
          error:
            'The registration decline migration has not been applied yet.',
        },
        {
          status:
            503,
        }
      )
    }

    return NextResponse.json(
      {
        error:
          message ||
          'Could not decline registration.',
      },
      {
        status:
          500,
      }
    )
  }

  const result =
    (
      resultData ??
      null
    ) as
      | DeclineResult
      | null

  if (
    result?.declined ===
    true
  ) {
    return NextResponse.json({
      ok:
        true,
    })
  }

  if (
    result?.reason ===
    'not_found'
  ) {
    return NextResponse.json(
      {
        error:
          'Registration request not found.',
      },
      {
        status:
          404,
      }
    )
  }

  if (
    result?.reason ===
    'approval_in_progress'
  ) {
    return NextResponse.json(
      {
        error:
          'Another administrator is currently approving this registration. Wait for the approval to finish, then refresh the registration list.',
      },
      {
        status:
          409,
      }
    )
  }

  if (
    result?.reason ===
    'already_reviewed'
  ) {
    return NextResponse.json(
      {
        error:
          'This registration has already been reviewed. Refresh the registration list.',
      },
      {
        status:
          409,
      }
    )
  }

  return NextResponse.json(
    {
      error:
        'This registration could not be declined.',
    },
    {
      status:
        409,
    }
  )
}