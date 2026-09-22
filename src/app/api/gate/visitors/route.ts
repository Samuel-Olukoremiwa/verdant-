import {
  after,
  NextResponse,
} from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendGateDueEmails } from '@/lib/gate-due-emails'

export const maxDuration =
  60

type VisitorRedeemResult = {
  visitor: string

  visitor_phone:
    | string
    | null

  host: string
  address: string
  message: string

  has_outstanding:
    boolean

  balance: number

  alert_queued:
    boolean
}

export async function POST(
  request: Request
) {
  const db =
    await createClient()

  const {
    data: { user },
  } =
    await db.auth.getUser()

  if (!user) {
    return NextResponse.json(
      {
        error:
          'Please sign in',
      },
      {
        status: 401,
      }
    )
  }

  const body =
    await request
      .json()
      .catch(() => null)

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
        status: 400,
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
        status: 400,
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
        status: 500,
      }
    )
  }

  if (
    result.has_outstanding
  ) {
    after(async () => {
      try {
        await sendGateDueEmails()
      } catch {
        console.error(
          'Visitor billing alert email queue could not be processed'
        )
      }
    })
  }

  return NextResponse.json(
    result
  )
}