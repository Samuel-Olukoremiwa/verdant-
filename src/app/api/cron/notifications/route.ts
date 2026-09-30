import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  queueGateDueEmails,
} from '@/lib/gate-due-emails'

import {
  processNotificationQueue,
} from '@/lib/notification-worker'

export const maxDuration =
  60

export async function GET(
  req: NextRequest
) {
  const secret =
    process.env
      .CRON_SECRET

  const authHeader =
    req.headers.get(
      'authorization'
    )

  if (
    !secret ||
    authHeader !==
      `Bearer ${secret}`
  ) {
    return NextResponse.json(
      {
        error:
          'Unauthorized',
      },
      {
        status:
          401,
      }
    )
  }

  try {
    /*
     * During the compatibility phase,
     * gate events are still written to
     * gate_due_emails by the database.
     *
     * Move those jobs into the shared
     * notification outbox first.
     */
    const gate =
      await queueGateDueEmails({
        maxJobs:
          50,

        deadlineMs:
          10000,
      })

    const delivery =
      await processNotificationQueue({
        maxJobs:
          100,

        deadlineMs:
          32000,
      })

    return NextResponse.json({
      gate,
      delivery,
    })
  } catch {
    return NextResponse.json(
      {
        error:
          'Queued notifications could not be processed.',
      },
      {
        status:
          500,
      }
    )
  }
}