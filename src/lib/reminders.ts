import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/service'

const naira = (n: number) => `₦${n.toLocaleString()}`

// Sends a due-date reminder email to every resident whose house has an
// unpaid or partially-paid invoice due within the next `daysAhead` days,
// or already overdue. Safe to call repeatedly — it's just a query + send,
// no state mutation, so re-running it (e.g. daily via cron) is fine.
export async function sendDueReminders({ daysAhead = 5 }: { daysAhead?: number } = {}) {
  const supabase = createServiceClient()
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) throw new Error('RESEND_API_KEY is not set')
  const resend = new Resend(resendKey)

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + daysAhead)

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, amount, amount_paid, status, due_date, period_label, house_id, houses ( address ), due_types ( name )')
    .in('status', ['unpaid', 'partial'])
    .lte('due_date', cutoff.toISOString().slice(0, 10))

  if (error) throw error

  let emailsSent = 0
  let skippedNoEmail = 0
  const results: { house: string; resident: string; email: string }[] = []

  for (const inv of invoices ?? []) {
    const outstanding = Number(inv.amount) - Number(inv.amount_paid ?? 0)
    if (outstanding <= 0) continue

    const { data: residents } = await supabase
      .from('residents')
      .select('full_name, email')
      .eq('house_id', inv.house_id)
      .eq('is_active', true)

    const house = inv.houses as unknown as { address: string } | null
    const dueType = inv.due_types as unknown as { name: string } | null
    const isOverdue = inv.due_date ? new Date(inv.due_date) < new Date() : false

    for (const resident of residents ?? []) {
      if (!resident.email) {
        skippedNoEmail++
        continue
      }

      await resend.emails.send({
        from: 'Verdant Estate <onboarding@resend.dev>',
        to: resident.email,
        subject: isOverdue
          ? `Overdue: ${dueType?.name ?? 'Estate charge'} for ${house?.address ?? 'your home'}`
          : `Reminder: ${dueType?.name ?? 'Estate charge'} due soon`,
        html: `
          <p>Hi ${resident.full_name.split(' ')[0]},</p>
          <p>${
            isOverdue
              ? `This charge is now <strong>overdue</strong>:`
              : `This is a friendly reminder that a charge on your account is coming due:`
          }</p>
          <ul>
            <li><strong>Charge:</strong> ${dueType?.name ?? 'Estate charge'} ${inv.period_label ? `(${inv.period_label})` : ''}</li>
            <li><strong>House:</strong> ${house?.address ?? '—'}</li>
            <li><strong>Amount outstanding:</strong> ${naira(outstanding)}</li>
            <li><strong>Due date:</strong> ${inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—'}</li>
          </ul>
          <p>You can pay online any time through your resident portal.</p>
          <p>— Verdant Estate</p>
        `,
      })

      emailsSent++
      results.push({ house: house?.address ?? '—', resident: resident.full_name, email: resident.email })
    }
  }

  return { emailsSent, skippedNoEmail, invoicesChecked: invoices?.length ?? 0, results }
}
