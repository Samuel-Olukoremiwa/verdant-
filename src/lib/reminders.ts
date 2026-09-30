import 'server-only'

import {
  createServiceClient,
} from '@/lib/supabase/service'

import {
  processNotificationQueue,
} from '@/lib/notification-worker'

type QueueResult = {
  invoices_checked?:
    unknown

  residents_eligible?:
    unknown

  emails_queued?:
    unknown

  sms_queued?:
    unknown

  skipped_no_email?:
    unknown

  skipped_no_phone?:
    unknown
}

function count(
  value: unknown
) {
  const number =
    Number(
      value ??
        0
    )

  return Number.isFinite(
    number
  )
    ? Math.max(
        0,
        Math.trunc(
          number
        )
      )
    : 0
}

export async function sendDueReminders(
  {
    daysAhead = 5,
  }: {
    daysAhead?:
      number
  } = {}
) {
  const db =
    createServiceClient()

  const {
    data,
    error,
  } =
    await db.rpc(
      'queue_due_reminders',
      {
        p_days_ahead:
          daysAhead,
      }
    )

  if (error) {
    throw new Error(
      error.message
    )
  }

  const queued =
    (
      data ??
      {}
    ) as QueueResult

  const delivery =
    await processNotificationQueue(
      {
        kind:
          'billing',

        maxJobs:
          100,

        deadlineMs:
          42000,
      }
    )

  const {
    count:
      pendingCount,
    error:
      pendingError,
  } =
    await db
      .from(
        'notification_outbox'
      )
      .select(
        'id',
        {
          count:
            'exact',

          head:
            true,
        }
      )
      .eq(
        'kind',
        'billing'
      )
      .eq(
        'status',
        'pending'
      )

  if (pendingError) {
    throw new Error(
      'Reminder queue status could not be loaded'
    )
  }

  return {
    invoicesChecked:
      count(
        queued.invoices_checked
      ),

    residentsEligible:
      count(
        queued.residents_eligible
      ),

    emailsQueued:
      count(
        queued.emails_queued
      ),

    smsQueued:
      count(
        queued.sms_queued
      ),

    skippedNoEmail:
      count(
        queued.skipped_no_email
      ),

    skippedNoPhone:
      count(
        queued.skipped_no_phone
      ),

    emailsSent:
      delivery.emailsSent,

    emailsFailed:
      delivery.emailsFailed,

    smsAccepted:
      delivery.smsAccepted,

    smsFailed:
      delivery.smsFailed,

    smsUnknown:
      delivery.smsUnknown,

    processed:
      delivery.processed,

    pending:
      pendingCount ??
      0,
  }
}