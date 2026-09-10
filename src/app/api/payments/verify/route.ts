import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyTransaction } from '@/lib/paystack'
import { applyConfirmedPayment } from '@/lib/payment-processing'

// Called by the callback page right after Paystack redirects the resident back.
// This is what actually confirms payment during local dev (no public webhook URL yet).
// Safe to also have the webhook fire later — applyConfirmedPayment is idempotent.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const reference = req.nextUrl.searchParams.get('reference')
  if (!reference) {
    return NextResponse.json({ error: 'reference is required' }, { status: 400 })
  }

  try {
    const verified = await verifyTransaction(reference)
    if (verified.status !== 'success') {
      return NextResponse.json({ status: verified.status })
    }
    await applyConfirmedPayment(reference, verified.amount / 100)
    return NextResponse.json({ status: 'success' })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Verification failed' },
      { status: 500 }
    )
  }
}
