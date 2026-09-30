import 'server-only'

import {
  createServiceClient,
} from '@/lib/supabase/service'

import {
  sendSms,
} from '@/lib/sms'

import {
  gateDueMessage,
  gateDueSubject,
  type GateDueDetails,
} from '@/lib/gate-due-emails'

type NotificationJob = {
  id:
    string

  event_key:
    string

  kind:
    string

  channel:
    'email' |
    'sms'

  recipient:
    string

  subject:
    string | null

  body:
    string

  status:
    string

  attempts:
    number
}

type WorkerResult = {
  processed:
    number

  emailsSent:
    number

  emailsFailed:
    number

  smsAccepted:
    number

  smsFailed:
    number

  smsUnknown:
    number
}

type ProcessOptions = {
  kind?:
    string | null

  maxJobs?:
    number

  deadlineMs?:
    number
}

type GateReference = {
  alert_id:
    string

  audience:
    'resident' |
    'admin'
}

async function updateJob(
  job:
    NotificationJob,

  values:
    Record<
      string,
      unknown
    >
) {
  const db =
    createServiceClient()

  const {
    error,
  } =
    await db
      .from(
        'notification_outbox'
      )
      .update({
        ...values,

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        'id',
        job.id
      )
      .eq(
        'attempts',
        job.attempts
      )

  if (error) {
    throw new Error(
      'Notification delivery status could not be saved'
    )
  }
}

function parseGateReference(
  value:
    string
): GateReference {
  let parsed:
    unknown

  try {
    parsed =
      JSON.parse(
        value
      )
  } catch {
    throw new Error(
      'Invalid gate notification reference'
    )
  }

  if (
    !parsed ||
    typeof parsed !==
      'object'
  ) {
    throw new Error(
      'Invalid gate notification reference'
    )
  }

  const reference =
    parsed as {
      alert_id?:
        unknown

      audience?:
        unknown
    }

  if (
    typeof reference
      .alert_id !==
      'string' ||
    !/^[a-f\d-]{36}$/i.test(
      reference.alert_id
    ) ||
    (
      reference.audience !==
        'resident' &&
      reference.audience !==
        'admin'
    )
  ) {
    throw new Error(
      'Invalid gate notification reference'
    )
  }

  return {
    alert_id:
      reference.alert_id,

    audience:
      reference.audience,
  }
}

async function resolveEmailContent(
  job:
    NotificationJob
) {
  if (
    job.kind !==
    'gate'
  ) {
    return {
      subject:
        job.subject ??
        'Zadant notification',

      body:
        job.body,
    }
  }

  const reference =
    parseGateReference(
      job.body
    )

  const db =
    createServiceClient()

  const {
    data:
      alert,

    error,
  } =
    await db
      .from(
        'gate_due_alerts'
      )
      .select(
        'details'
      )
      .eq(
        'id',
        reference.alert_id
      )
      .single()

  if (
    error ||
    !alert
  ) {
    throw new Error(
      'Gate alert details are unavailable'
    )
  }

  const details =
    alert.details as
      GateDueDetails

  return {
    subject:
      gateDueSubject(
        details,
        reference.audience
      ),

    body:
      gateDueMessage(
        details,
        reference.audience
      ),
  }
}

async function sendEmail(
  job:
    NotificationJob
) {
  const apiKey =
    process.env
      .RESEND_API_KEY

  const from =
    process.env
      .RESEND_FROM_EMAIL

  if (
    !apiKey ||
    !from
  ) {
    await updateJob(
      job,
      {
        status:
          'failed',

        last_error:
          'Resend is not configured.',
      }
    )

    return {
      sent:
        false,

      failed:
        true,
    }
  }

  let content: {
    subject:
      string

    body:
      string
  }

  try {
    content =
      await resolveEmailContent(
        job
      )
  } catch {
    await updateJob(
      job,
      {
        status:
          'failed',

        last_error:
          'Notification content could not be prepared.',
      }
    )

    return {
      sent:
        false,

      failed:
        true,
    }
  }

  try {
    const response =
      await fetch(
        'https://api.resend.com/emails',
        {
          method:
            'POST',

          headers: {
            Authorization:
              `Bearer ${apiKey}`,

            'Content-Type':
              'application/json',

            'Idempotency-Key':
              `zadant-notification-${job.id}`,
          },

          body:
            JSON.stringify({
              from,

              to: [
                job.recipient,
              ],

              subject:
                content.subject,

              text:
                content.body,
            }),

          signal:
            AbortSignal.timeout(
              10000
            ),

          cache:
            'no-store',

          redirect:
            'error',
        }
      )

    const data =
      await response
        .json()
        .catch(
          () =>
            null
        )

    const providerId =
      typeof data?.id ===
        'string'
        ? data.id
        : null

    if (
      response.ok &&
      providerId
    ) {
      await updateJob(
        job,
        {
          status:
            'sent',

          provider_id:
            providerId,

          last_error:
            null,

          sent_at:
            new Date()
              .toISOString(),
        }
      )

      return {
        sent:
          true,

        failed:
          false,
      }
    }

    const permanent =
      response.status >=
        400 &&
      response.status <
        500

    await updateJob(
      job,
      permanent
        ? {
            status:
              'failed',

            last_error:
              `Email provider rejected the request (${response.status}).`,
          }
        : {
            status:
              'pending',

            available_at:
              new Date(
                Date.now() +
                  5 *
                    60 *
                    1000
              )
                .toISOString(),

            last_error:
              `Email provider temporarily failed (${response.status}).`,
          }
    )

    return {
      sent:
        false,

      failed:
        permanent,
    }
  } catch {
    await updateJob(
      job,
      {
        status:
          'pending',

        available_at:
          new Date(
            Date.now() +
              5 *
                60 *
                1000
          )
            .toISOString(),

        last_error:
          'Email delivery could not be confirmed and will be retried safely.',
      }
    )

    return {
      sent:
        false,

      failed:
        false,
    }
  }
}

async function sendSmsJob(
  job:
    NotificationJob
) {
  const result =
    await sendSms(
      job.recipient,
      job.body
    )

  if (
    result.status ===
    'accepted'
  ) {
    await updateJob(
      job,
      {
        status:
          'sent',

        provider_code:
          result.code ??
          null,

        last_error:
          null,

        sent_at:
          new Date()
            .toISOString(),
      }
    )

    return result.status
  }

  if (
    result.status ===
    'unknown'
  ) {
    await updateJob(
      job,
      {
        status:
          'unknown',

        provider_code:
          result.code ??
          null,

        last_error:
          result.message,
      }
    )

    return result.status
  }

  await updateJob(
    job,
    {
      status:
        'failed',

      provider_code:
        result.code ??
        null,

      last_error:
        result.message,
    }
  )

  return result.status
}

export async function processNotificationQueue({
  kind = null,
  maxJobs = 100,
  deadlineMs = 42000,
}: ProcessOptions = {}): Promise<WorkerResult> {
  const db =
    createServiceClient()

  const deadline =
    Date.now() +
    deadlineMs

  const result:
    WorkerResult = {
      processed:
        0,

      emailsSent:
        0,

      emailsFailed:
        0,

      smsAccepted:
        0,

      smsFailed:
        0,

      smsUnknown:
        0,
    }

  while (
    result.processed <
      maxJobs &&
    Date.now() <
      deadline
  ) {
    const remaining =
      maxJobs -
      result.processed

    const batchSize =
      Math.min(
        10,
        remaining
      )

    const {
      data,
      error,
    } =
      await db.rpc(
        'claim_notification_outbox',
        {
          p_kind:
            kind,

          p_limit:
            batchSize,
        }
      )

    if (error) {
      throw new Error(
        'Unable to claim queued notifications'
      )
    }

    const jobs =
      (
        data ??
        []
      ) as NotificationJob[]

    if (
      jobs.length ===
      0
    ) {
      break
    }

    const outcomes =
      await Promise.all(
        jobs.map(
          async (
            job
          ) => {
            if (
              job.channel ===
              'email'
            ) {
              return {
                channel:
                  'email' as const,

                result:
                  await sendEmail(
                    job
                  ),
              }
            }

            return {
              channel:
                'sms' as const,

              result:
                await sendSmsJob(
                  job
                ),
            }
          }
        )
      )

    result.processed +=
      jobs.length

    for (
      const outcome
      of outcomes
    ) {
      if (
        outcome.channel ===
        'email'
      ) {
        if (
          outcome.result
            .sent
        ) {
          result.emailsSent++
        } else if (
          outcome.result
            .failed
        ) {
          result.emailsFailed++
        }

        continue
      }

      if (
        outcome.result ===
        'accepted'
      ) {
        result.smsAccepted++
      } else if (
        outcome.result ===
        'unknown'
      ) {
        result.smsUnknown++
      } else {
        result.smsFailed++
      }
    }
  }

  return result
}