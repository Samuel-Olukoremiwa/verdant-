import 'server-only'

import {
  createServiceClient,
} from '@/lib/supabase/service'

import {
  normalizeNigerianPhone,
} from '@/lib/sms'

export type QueuedNotificationResult = {
  status:
    | 'queued'
    | 'skipped'
    | 'failed'

  message:
    string
}

type SmsKind =
  | 'billing'
  | 'registration'
  | 'visitor'

export async function queueSmsNotification({
  eventKey,
  kind,
  phone,
  message,
}: {
  eventKey:
    string

  kind:
    SmsKind

  phone:
    string

  message:
    string
}): Promise<QueuedNotificationResult> {
  const recipient =
    normalizeNigerianPhone(
      phone
    )

  if (!recipient) {
    return {
      status:
        'failed',

      message:
        'No valid Nigerian mobile number is available for SMS.',
    }
  }

  const body =
    message.trim()

  if (!body) {
    return {
      status:
        'failed',

      message:
        'SMS message is empty.',
    }
  }

  const db =
    createServiceClient()

  const {
    error,
  } =
    await db
      .from(
        'notification_outbox'
      )
      .insert({
        event_key:
          eventKey,

        kind,

        channel:
          'sms',

        recipient:
          recipient,

        body,
      })

  if (
    error?.code ===
    '23505'
  ) {
    return {
      status:
        'skipped',

      message:
        'This SMS notification is already queued or was previously processed.',
    }
  }

  if (error) {
    return {
      status:
        'failed',

      message:
        'The SMS notification could not be queued.',
    }
  }

  return {
    status:
      'queued',

    message:
      'SMS queued for delivery.',
  }
}