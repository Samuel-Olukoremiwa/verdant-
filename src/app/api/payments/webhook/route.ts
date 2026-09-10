import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyTransaction } from '@/lib/paystack'
import { applyConfirmedPayment } from '@/lib/payment-processing'

// Paystack calls this URL directly (not the browser), so there's no user
// session here — we verify the request came from Paystack via signature,
// then re-verify the transaction status directly with Paystack's API
// before trusting anything.
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-paystack-signature')

  const expected = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
    .update(rawBody)
    .digest('hex')

  if (!signature || signature !== expected) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(rawBody)

  if (event.event === 'charge.success') {
    const reference = event.data.reference as string

    // Re-verify directly with Paystack rather than trusting the webhook body alone.
    const verified = await verifyTransaction(reference)
    if (verified.status !== 'success') {
      return NextResponse.json({ received: true, note: 'not successful on verify' })
    }

    await applyConfirmedPayment(reference, verified.amount / 100)
  }

  return NextResponse.json({ received: true })
}
