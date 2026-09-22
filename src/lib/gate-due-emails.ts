import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'

export type GateDueDetails = {
  source_type?:
    | 'resident'
    | 'visitor'

  name: string

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
    label: string
    amount: number
    due_date:
      | string
      | null
  }[]
}

export function gateDueMessage(
  details: GateDueDetails,
  audience: string
) {
  const balance =
    Number(
      details.balance
    ).toLocaleString(
      'en-NG',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
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
        hour12: false,
      }
    ) + ' WAT'

  const isVisitor =
    details.source_type ===
    'visitor'

  let intro: string

  if (
    audience ===
    'admin'
  ) {
    if (isVisitor) {
      intro =
        `Visitor ${details.name} entered the estate at ${when}.\n` +
        `Visitor phone: ${details.visitor_phone || 'Not provided'}\n` +
        `Host: ${details.host || 'Unknown'}\n` +
        `Address: ${details.address}\n` +
        `Designated billing contact: ${details.billing_contact_name || 'Not assigned'}`
    } else {
      intro =
        `${details.name} entered the estate at ${when}.\n` +
        `Address: ${details.address}\n` +
        `Designated billing contact: ${details.billing_contact_name || 'Not assigned'}`
    }
  } else if (
    isVisitor
  ) {
    intro =
      `A visitor named ${details.name} for ${details.host || 'your household'} ` +
      `was admitted to ${details.address} at ${when}.`
  } else {
    intro =
      `${details.name} entered the estate for the household at ` +
      `${details.address} at ${when}.`
  }

  const billLines =
    details.bills
      .map(
        (bill) =>
          `${bill.label}: NGN ${Number(
            bill.amount
          ).toFixed(2)}${
            bill.due_date
              ? ` (due ${bill.due_date})`
              : ''
          }`
      )
      .join('\n')

  const action =
    audience === 'admin'
      ? 'Please review the household account in Verdant.'
      : details
          .billing_contact_name
        ? `The designated payee for this household is ${details.billing_contact_name}. Please review or coordinate settlement of the household dues in Verdant.`
        : 'Please review the household dues in Verdant.'

  return (
    `${intro}\n\n` +
    `The household had NGN ${balance} in unpaid dues at entry. ` +
    `This is a household balance and does not mean the visitor was denied access.\n\n` +
    `${billLines}\n\n` +
    `${action} Payments made since entry may have changed the balance.`
  )
}

function subjectFor(
  details: GateDueDetails,
  audience: string
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

export async function sendGateDueEmails() {
  const apiKey =
    process.env
      .RESEND_API_KEY

  const from =
    process.env
      .RESEND_FROM_EMAIL

  if (!apiKey || !from) {
    return {
      sent: 0,
      failed: 0,
      configured:
        false,
    }
  }

  const db =
    createServiceClient()

  const deadline =
    Date.now() +
    40000

  let sent = 0
  let failed = 0

  while (
    Date.now() <
    deadline
  ) {
    const {
      data: jobs,
      error,
    } =
      await db.rpc(
        'claim_gate_due_emails',
        {
          p_alert: null,
        }
      )

    if (error) {
      throw new Error(
        'Unable to claim gate reminder'
      )
    }

    if (!jobs?.length) {
      break
    }

    const job =
      jobs[0]

    const {
      data: alert,
      error:
        readError,
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
      readError ||
      !alert
    ) {
      throw new Error(
        'Unable to load gate reminder'
      )
    }

    const details =
      alert.details as GateDueDetails

    let accepted =
      false

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
                `gate-dues-${job.id}`,
            },

            body:
              JSON.stringify({
                from,

                to: [
                  job.recipient,
                ],

                subject:
                  subjectFor(
                    details,
                    job.audience
                  ),

                text:
                  gateDueMessage(
                    details,
                    job.audience
                  ),
              }),

            signal:
              AbortSignal.timeout(
                8000
              ),
          }
        )

      const body =
        await response
          .json()

      accepted =
        response.ok &&
        typeof body.id ===
          'string'
    } catch {
      // Keep for retry.
    }

    const {
      error:
        updateError,
    } =
      await db
        .from(
          'gate_due_emails'
        )
        .update(
          accepted
            ? {
                status:
                  'sent',

                sent_at:
                  new Date()
                    .toISOString(),
              }
            : {
                status:
                  'pending',

                available_at:
                  new Date(
                    Date.now() +
                      60000
                  ).toISOString(),
              }
        )
        .eq(
          'id',
          job.id
        )
        .eq(
          'attempts',
          job.attempts
        )

    if (
      updateError
    ) {
      throw new Error(
        'Unable to record gate reminder status'
      )
    }

    if (accepted) {
      sent++
    } else {
      failed++
    }

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          550
        )
    )
  }

  return {
    sent,
    failed,
    configured: true,
  }
}