import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/service'
import { dispatchSms } from '@/lib/sms-dispatch'
import { readAll } from '@/lib/read-all'
import { estateDate } from '@/lib/dashboard'

type Bill = { house_id: string; amount: number; amount_paid: number | null; houses: { address: string; billing_responsible_resident_id: string | null } | null }
export async function sendDueReminders({ daysAhead = 5 }: { daysAhead?: number } = {}) {
  const db = createServiceClient()
  const today = estateDate()
  const cutoff = new Date(today); cutoff.setUTCDate(cutoff.getUTCDate()+daysAhead)
  const invoices = await readAll((from,to) => db.from('invoices').select('id,house_id,amount,amount_paid,houses(address,billing_responsible_resident_id)').in('status',['unpaid','partial','overdue']).lte('due_date',cutoff.toISOString().slice(0,10)).order('id').range(from,to)) as unknown as Bill[]
  const households = new Map<string,{ address: string; payer: string | null; amount: number; count: number }>()
  for (const bill of invoices) {
    const amount = Math.max(0,Number(bill.amount)-Number(bill.amount_paid ?? 0))
    if (!amount) continue
    const house = households.get(bill.house_id) ?? { address: bill.houses?.address ?? 'your home', payer: bill.houses?.billing_responsible_resident_id ?? null, amount: 0, count: 0 }
    house.amount += amount; house.count++; households.set(bill.house_id,house)
  }
  const residents = await readAll((from,to) => db.from('residents').select('id,house_id,full_name,email,phone,relationship').eq('is_active',true).order('id').range(from,to))
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  const result = { emailsSent: 0, emailsFailed: 0, skippedNoEmail: 0, smsAccepted: 0, smsFailed: 0, smsUnknown: 0, smsSkipped: 0, invoicesChecked: invoices.length }
  for (const resident of residents) {
    const house = households.get(resident.house_id)
    if (!house || (house.payer ? resident.id !== house.payer : resident.relationship !== 'owner')) continue
    const text = `Verdant: NGN ${house.amount.toLocaleString('en-NG',{maximumFractionDigits:2})} outstanding across ${house.count} due/overdue bill(s) for ${house.address}. Please sign in to your resident portal to view and pay. If recently paid, check your updated balance.`
    const sms = await dispatchSms(`billing:${today}:${resident.id}:${resident.house_id}`,'billing',resident.phone ?? '',text)
    if (sms.status === 'accepted') result.smsAccepted++
    else if (sms.status === 'skipped') result.smsSkipped++
    else if (sms.status === 'unknown') result.smsUnknown++
    else result.smsFailed++
    if (!resident.email) { result.skippedNoEmail++; continue }
    if (!resend) { result.emailsFailed++; continue }
    try {
      const { error } = await resend.emails.send({ from:'Verdant Estate <onboarding@resend.dev>',to:resident.email,subject:'Your estate dues reminder',text },{ idempotencyKey: `billing-${today}-${resident.id}-${resident.house_id}` })
      if (error) result.emailsFailed++; else result.emailsSent++
    } catch { result.emailsFailed++ }
  }
  return result
}
