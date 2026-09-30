import 'server-only'

import {
  createServiceClient,
} from '@/lib/supabase/service'

export type GateDueDetails = {
  source_type?:
    | 'resident'
    | 'visitor'

  name:
    string

  visitor_phone?:
    | string
    | null

  host?:
    | string
    | null

  host_email?:
    | string
    | null

  host_phone?:
    | string
    | null

  billing_contact_name?:
    | string
    | null

  email:
    | string
    | null

  phone:
    | string
    | null

  address:
    string

  entered_at:
    string

  balance:
    number

  bills: {
    label:
      string

    amount:
      number

    due_date:
      | string
      | null
  }[]
}

type LegacyGateJob = {
  id:
    string

  alert_id:
    string

  recipient:
    string

  audience:
    string

  attempts:
    number
}

export function gateDueMessage(
  details:
    GateDueDetails,

  audience:
    string
) {
  const balance =
    Number(
      details.balance
    ).toLocaleString(
      'en-NG',
      {
        minimumFractionDigits:
          2,

        maximumFractionDigits:
          2,
      }
    )

  const when =
    new Date(
      details.entered_at
    ).toLocaleString(
      'en-GB',
      {
        timeZone:
          'Africa/Lagos',

        hour12:
          false,
      }
    ) +
    ' WAT'

  const isVisitor =
    details.source_type ===
    'visitor'

  let intro:
    string

  if (
    audience ===
    'admin'
  ) {
    if (
      isVisitor
    ) {
      intro =
        `Visitor ${details.name} entered the estate at ${when}.\n` +
        `Visitor phone: ${details.visitor_phone || 'Not provided'}\n` +
        `Host: ${details.host || 'Unknown'}\n` +
        `Host email: ${details.host_email || 'Not provided'}\n` +
        `Host phone: ${details.host_phone || 'Not provided'}\n` +
        `Address: ${details.address}\n` +
        `Designated billing contact: ${
          details.billing_contact_name ||
          'Not assigned'
        }\n` +
        `Billing contact email: ${
          details.email ||
          'Not provided'
        }\n` +
        `Billing contact phone: ${
          details.phone ||
          'Not provided'
        }`
    } else {
      intro =
        `${details.name} entered the estate at ${when}.\n` +
        `Resident email: ${details.email || 'Not provided'}\n` +
        `Resident phone: ${details.phone || 'Not provided'}\n` +
        `Address: ${details.address}\n` +
        `Designated billing contact: ${
          details.billing_contact_name ||
          'Not assigned'
        }`
    }
  } else if (
    isVisitor
  ) {
    intro =
      `A visitor named ${details.name} for ${
        details.host ||
        'your household'
      } was admitted to ${details.address} at ${when}.`
  } else {
    intro =
      `${details.name} entered the estate for the household at ` +
      `${details.address} at ${when}.`
  }

  const billLines =
    details.bills
      .map(
        (
          bill
        ) =>
          `${bill.label}: NGN ${Number(
            bill.amount
          ).toFixed(
            2
          )}${
            bill.due_date
              ? ` (due ${bill.due_date})`
              : ''
          }`
      )
      .join(
        '\n'
      )

  const action =
    audience ===
    'admin'
      ? 'Please review the household account in Zadant.'
      : details
          .billing_contact_name
        ? `The designated payee for this household is ${details.billing_contact_name}. Please review or coordinate settlement of the household dues in Zadant.`
        : 'Please review the household dues in Zadant.'

  return (
    `${intro}\n\n` +
    `The household had NGN ${balance} in unpaid dues at entry. ` +
    `This is a household balance and does not mean the visitor was denied access.\n\n` +
    `${billLines}\n\n` +
    `${action} Payments made since entry may have changed the balance.`
  )
}

function subjectFor(
  details:
    GateDueDetails,

  audience:
    string
) {
  const isVisitor =
    details.source_type ===
    'visitor'

  if (
    audience ===
    'admin'
  ) {
    return isVisitor
      ? 'Visitor entry: household with unpaid dues'
      : 'Gate entry: household with unpaid dues'
  }

  return isVisitor
    ? 'Visitor entry and household dues alert'
    : 'Your household dues reminder'
}

async function restorePending(
  job:
    LegacyGateJob
) {
  const db =
    createServiceClient()

  await db
    .from(
      'gate_due_emails'
    )
    .update({
      status:
        'pending',

      available_at:
        new Date(
          Date.now() +
            60000
        )
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
}

async function markFailed(
  job:
    LegacyGateJob
) {
  const db =
    createServiceClient()

  await db
    .from(
      'gate_due_emails'
    )
    .update({
      status:
        'failed',
    })
    .eq(
      'id',
      job.id
    )
    .eq(
      'attempts',
      job.attempts
    )
}

export async function queueGateDueEmails({
  maxJobs = 50,
  deadlineMs = 10000,
}: {
  maxJobs?:
    number

  deadlineMs?:
    number
} = {}) {
  const db =
    createServiceClient()

  const deadline =
    Date.now() +
    deadlineMs

  let migrated =
    0

  let duplicates =
    0

  let failed =
    0

  while (
    migrated +
      duplicates +
      failed <
      maxJobs &&
    Date.now() <
      deadline
  ) {
    const {
      data:
        jobs,

      error:
        claimError,
    } =
      await db.rpc(
        'claim_gate_due_emails',
        {
          p_alert:
            null,
        }
      )

    if (
      claimError
    ) {
      throw new Error(
        'Unable to claim queued gate email'
      )
    }

    if (
      !jobs?.length
    ) {
      break
    }

    const job =
      jobs[0] as
        LegacyGateJob

    const {
      data:
        alert,

      error:
        alertError,
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
          job.alert_id
        )
        .single()

    if (
      alertError ||
      !alert
    ) {
      await markFailed(
        job
      )

      failed++

      continue
    }

    const details =
      alert.details as
        GateDueDetails

    const {
      error:
        insertError,
    } =
      await db
        .from(
          'notification_outbox'
        )
        .insert({
          event_key:
            `gate:${job.id}`,

          kind:
            'gate',

          channel:
            'email',

          recipient:
            job.recipient,

          subject:
            subjectFor(
              details,
              job.audience
            ),

          body:
            gateDueMessage(
              details,
              job.audience
            ),
        })

    if (
      insertError &&
      insertError.code !==
        '23505'
    ) {
      await restorePending(
        job
      )

      failed++

      continue
    }

    const {
      error:
        migrateError,
    } =
      await db
        .from(
          'gate_due_emails'
        )
        .update({
          status:
            'migrated',
        })
        .eq(
          'id',
          job.id
        )
        .eq(
          'attempts',
          job.attempts
        )

    if (
      migrateError
    ) {
      /*
       * The outbox event key is unique.
       * Even if this legacy status update
       * fails, another bridge attempt
       * cannot create a duplicate email.
       */
      failed++

      continue
    }

    if (
      insertError?.code ===
      '23505'
    ) {
      duplicates++
    } else {
      migrated++
    }
  }

  return {
    migrated,
    duplicates,
    failed,
  }
}