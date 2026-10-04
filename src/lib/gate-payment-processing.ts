import 'server-only'

import {
  createServiceClient,
} from '@/lib/supabase/service'

export type VerifiedGatePayment = {
  id:
    number

  reference:
    string

  amount:
    number

  currency:
    string

  paid_at:
    string | null
}

export async function applyConfirmedGatePayment(
  payment:
    VerifiedGatePayment
) {
  const service =
    createServiceClient()

  const {
    data,
    error,
  } =
    await service.rpc(
      'confirm_gate_payment',
      {
        p_reference:
          payment.reference,

        p_amount_kobo:
          payment.amount,

        p_currency:
          payment.currency,

        p_paid_at:
          payment.paid_at,

        p_provider_transaction_id:
          String(
            payment.id
          ),
      }
    )

  if (error) {
    throw new Error(
      'Payment was received but could not be recorded. Please retry verification or contact the estate office.'
    )
  }

  if (
    !data?.ok
  ) {
    throw new Error(
      'Gate payment confirmation did not complete'
    )
  }

  return data as {
    ok:
      true

    already_confirmed:
      boolean

    id:
      string

    payment_code:
      string

    reference:
      string

    charge_name:
      string

    amount:
      number

    paid_at:
      string
  }
}