import {
  NextRequest,
  NextResponse,
} from 'next/server'

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
    const result =
      await processNotificationQueue(
        {
          maxJobs:
            100,

          deadlineMs:
            45000,
        }
      )

    return NextResponse.json(
      result
    )
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