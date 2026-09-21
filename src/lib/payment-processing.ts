import { createServiceClient } from '@/lib/supabase/service'

export async function applyConfirmedPayment(payment: {
  reference: string
  amount: number
  currency: string
  paid_at: string | null
}) {
  const { data, error } = await createServiceClient().rpc('confirm_estate_payment', {
    p_reference: payment.reference,
    p_amount_kobo: payment.amount,
    p_currency: payment.currency,
    p_paid_at: payment.paid_at,
  })
  if (error) throw new Error('Payment was received but could not be recorded. Please retry verification or contact the estate office.')
  if (!data?.ok) throw new Error('Payment confirmation did not complete')
  return data as { ok: true; applied: number; alreadyProcessed: number }
}
