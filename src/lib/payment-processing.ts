import { createServiceClient } from '@/lib/supabase/service'

// Shared by both the webhook and the callback-verify route so payment
// confirmation logic lives in exactly one place (idempotent - safe to call twice).
export async function applyConfirmedPayment(reference: string, amountPaidNaira: number) {
  const supabase = createServiceClient()

  const { data: payment } = await supabase
    .from('payments')
    .select('id, invoice_id, status')
    .eq('paystack_reference', reference)
    .single()

  if (!payment) return { ok: false, reason: 'payment record not found' }
  if (payment.status === 'success') return { ok: true, reason: 'already processed' }

  await supabase
    .from('payments')
    .update({ status: 'success', paid_at: new Date().toISOString() })
    .eq('id', payment.id)

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, amount, amount_paid')
    .eq('id', payment.invoice_id)
    .single()

  if (!invoice) return { ok: false, reason: 'invoice not found' }

  const newAmountPaid = Number(invoice.amount_paid ?? 0) + amountPaidNaira
  const newStatus = newAmountPaid >= Number(invoice.amount) ? 'paid' : 'partial'

  await supabase
    .from('invoices')
    .update({ amount_paid: newAmountPaid, status: newStatus })
    .eq('id', invoice.id)

  return { ok: true }
}
