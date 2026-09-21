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

  const { data: resident } = await supabase.from('residents').select('id').eq('auth_user_id', user.id).eq('is_active', true).maybeSingle()
  if (!resident) return NextResponse.json({ error: 'Resident account unavailable' }, { status: 403 })
  const { data: payment, error: lookupError } = await supabase.from('payments').select('id').eq('paystack_reference', reference).eq('resident_id', resident.id).limit(1)
  if (lookupError) return NextResponse.json({ error: 'Could not look up payment' }, { status: 500 })
  if (!payment?.length) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

  try {
    const verified = await verifyTransaction(reference)
    if (verified.status !== 'success') {
      return NextResponse.json({ status: verified.status })
    }
    if (verified.reference !== reference) throw new Error('Payment reference mismatch')
    await applyConfirmedPayment(verified)
    return NextResponse.json({ status: 'success' })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Verification failed' },
      { status: 500 }
    )
  }
}
