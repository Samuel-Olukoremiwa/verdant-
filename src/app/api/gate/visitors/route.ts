import {
  after,
  NextResponse,
} from 'next/server'

import {
  createClient,
} from '@/lib/supabase/server'

import {
  processNotificationQueue,
} from '@/lib/notification-worker'

type VisitorRedeemResult = {
  visitor:
    string

  visitor_phone:
    | string
    | null

  host:
    string

  address:
    string

  message:
    string

  has_outstanding:
    boolean

  balance:
    number

  alert_queued:
    boolean
}

type VisitorCheckoutResult = {
  ok:
    boolean

  already_checked_out:
    boolean

  id:
    string

  visitor:
    string

  host:
    string

  address:
    string

  checked_in_at:
    string

  checked_out_at:
    string
}

function validUuid(
  value:
    unknown
): value is string {
  return (
    typeof value ===
      'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  )
}

export async function POST(
  request: Request
) {
  const db =
    await createClient()

  const {
    data: {
      user,
    },
  } =
    await db.auth.getUser()

  if (!user) {
    return NextResponse.json(
      {
        error:
          'Please sign in',
      },
      {
        status:
          401,
      }
    )
  }

  const body =
    await request
      .json()
      .catch(
        () =>
          null
      )

  if (
    !body ||
    typeof body.code !==
      'string' ||
    !/^[a-f\d]{10}$/i.test(
      body.code.trim()
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Enter the 10-character visitor code',
      },
      {
        status:
          400,
      }
    )
  }

  const {
    data,
    error,
  } =
    await db.rpc(
      'redeem_visitor_pass',
      {
        p_code:
          body.code.trim(),
      }
    )

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status:
          400,
      }
    )
  }

  const result =
    data as
      | VisitorRedeemResult
      | null

  if (!result) {
    return NextResponse.json(
      {
        error:
          'Could not verify visitor',
      },
      {
        status:
          500,
      }
    )
  }

  if (
    result.has_outstanding
  ) {
    after(
      async () => {
        try {
          await processNotificationQueue({
            kind:
              'gate',

            maxJobs:
              10,

            deadlineMs:
              15000,
          })
        } catch {
          console.error(
            'Visitor billing alert remains queued for background delivery'
          )
        }
      }
    )
  }

  return NextResponse.json(
    result
  )
}

export async function PATCH(
  request: Request
) {
  const db =
    await createClient()

  const {
    data: {
      user,
    },
  } =
    await db.auth.getUser()

  if (!user) {
    return NextResponse.json(
      {
        error:
          'Please sign in',
      },
      {
        status:
          401,
      }
    )
  }

  const body =
    await request
      .json()
      .catch(
        () =>
          null
      )

  if (
    !body ||
    !validUuid(
      body.id
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Choose a valid visitor',
      },
      {
        status:
          400,
      }
    )
  }

  const {
    data,
    error,
  } =
    await db.rpc(
      'checkout_visitor_pass',
      {
        p_id:
          body.id,
      }
    )

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status:
          error.code ===
            '42501'
            ? 403
            : 400,
      }
    )
  }

  const result =
    data as
      | VisitorCheckoutResult
      | null

  if (
    !result ||
    !result.ok
  ) {
    return NextResponse.json(
      {
        error:
          'Visitor could not be checked out',
      },
      {
        status:
          500,
      }
    )
  }

  return NextResponse.json(
    result
  )
}