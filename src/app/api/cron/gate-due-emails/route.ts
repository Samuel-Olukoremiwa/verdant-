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

  if (
    !secret ||
    req.headers.get(
      'authorization'
    ) !==
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
    const gate =
      await queueGateDueEmails({
        maxJobs:
          50,

        deadlineMs:
          10000,
      })

    const delivery =
      await processNotificationQueue({
        kind:
          'gate',

        maxJobs:
          50,

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
          'Unable to process queued gate notifications',
      },
      {
        status:
          500,
      }
    )
  }
}