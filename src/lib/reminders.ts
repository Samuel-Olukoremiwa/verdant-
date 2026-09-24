import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/service'
import { dispatchSms } from '@/lib/sms-dispatch'
import { readAll } from '@/lib/read-all'
import { estateDate } from '@/lib/dashboard'

type Bill = {
  house_id: string | null
  resident_id: string | null
  amount: number
  amount_paid: number | null
  houses: {
    address: string
    billing_responsible_resident_id: string | null
  } | null
}

type Resident = {
  id: string
  house_id: string | null
  full_name: string
  email: string | null
  phone: string | null
  relationship: string | null
}

export async function sendDueReminders(
  { daysAhead = 5 }: { daysAhead?: number } = {}
) {
  const db = createServiceClient()
  const today = estateDate()
  const cutoff = new Date(today)
  cutoff.setUTCDate(cutoff.getUTCDate() + daysAhead)

  const invoices = (await readAll((from, to) =>
    db
      .from('invoices')
      .select(
        'id,house_id,resident_id,amount,amount_paid,houses(address,billing_responsible_resident_id)'
      )
      .in('status', ['unpaid', 'partial', 'overdue'])
      .lte('due_date', cutoff.toISOString().slice(0, 10))
      .order('id')
      .range(from, to)
  )) as unknown as Bill[]

  const householdBalances = new Map<
    string,
    { address: string; payer: string | null; amount: number; count: number }
  >()

  const personalBalances = new Map<
    string,
    { amount: number; count: number }
  >()

  for (const bill of invoices) {
    const amount = Math.max(
      0,
      Number(bill.amount) - Number(bill.amount_paid ?? 0)
    )

    if (!amount) continue

    if (bill.resident_id) {
      const personal = personalBalances.get(bill.resident_id) ?? {
        amount: 0,
        count: 0,
      }
      personal.amount += amount
      personal.count += 1
      personalBalances.set(bill.resident_id, personal)
      continue
    }

    if (!bill.house_id) continue

    const household = householdBalances.get(bill.house_id) ?? {
      address: bill.houses?.address ?? 'your home',
      payer: bill.houses?.billing_responsible_resident_id ?? null,
      amount: 0,
      count: 0,
    }

    household.amount += amount
    household.count += 1
    householdBalances.set(bill.house_id, household)
  }

  const residents = (await readAll((from, to) =>
    db
      .from('residents')
      .select('id,house_id,full_name,email,phone,relationship')
      .eq('is_active', true)
      .order('id')
      .range(from, to)
  )) as unknown as Resident[]

  const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null

  const result = {
    emailsSent: 0,
    emailsFailed: 0,
    skippedNoEmail: 0,
    smsAccepted: 0,
    smsFailed: 0,
    smsUnknown: 0,
    smsSkipped: 0,
    invoicesChecked: invoices.length,
  }

  for (const resident of residents) {
    const personal = personalBalances.get(resident.id) ?? {
      amount: 0,
      count: 0,
    }

    const household = resident.house_id
      ? householdBalances.get(resident.house_id)
      : undefined

    const managesHousehold = Boolean(
      household &&
        (household.payer
          ? household.payer === resident.id
          : resident.relationship === 'owner')
    )

    const householdAmount = managesHousehold ? household?.amount ?? 0 : 0
    const householdCount = managesHousehold ? household?.count ?? 0 : 0

    const total = personal.amount + householdAmount
    const totalCount = personal.count + householdCount

    if (!total || !totalCount) continue

    const parts: string[] = []

    if (personal.amount > 0) {
      parts.push(
        `NGN ${personal.amount.toLocaleString('en-NG', {
          maximumFractionDigits: 2,
        })} across ${personal.count} personal bill${personal.count === 1 ? '' : 's'}`
      )
    }

    if (householdAmount > 0 && household) {
      parts.push(
        `NGN ${householdAmount.toLocaleString('en-NG', {
          maximumFractionDigits: 2,
        })} across ${householdCount} household bill${
          householdCount === 1 ? '' : 's'
        } for ${household.address}`
      )
    }

    const text = `Verdant: ${parts.join(
      ' and '
    )} outstanding. Please sign in to your resident portal to view and pay. If recently paid, check your updated balance.`

    const sms = await dispatchSms(
      `billing:${today}:${resident.id}`,
      'billing',
      resident.phone ?? '',
      text
    )

    if (sms.status === 'accepted') result.smsAccepted++
    else if (sms.status === 'skipped') result.smsSkipped++
    else if (sms.status === 'unknown') result.smsUnknown++
    else result.smsFailed++

    if (!resident.email) {
      result.skippedNoEmail++
      continue
    }

    if (!resend) {
      result.emailsFailed++
      continue
    }

    try {
      const { error } = await resend.emails.send(
        {
          from: 'Verdant Estate <onboarding@resend.dev>',
          to: resident.email,
          subject: 'Your estate dues reminder',
          text,
        },
        {
          idempotencyKey: `billing-${today}-${resident.id}`,
        }
      )

      if (error) result.emailsFailed++
      else result.emailsSent++
    } catch {
      result.emailsFailed++
    }
  }

  return result
}
