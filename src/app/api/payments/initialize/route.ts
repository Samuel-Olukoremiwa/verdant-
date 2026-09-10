import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { initializeTransaction } from '@/lib/paystack'

// Called by a logged-in resident to start paying one invoice.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { invoice_id } = await req.json()
  if (!invoice_id) {
    return NextResponse.json({ error: 'invoice_id is required' }, { status: 400 })
  }

  // Confirm this resident actually owns the house this invoice belongs to.
  // (RLS also enforces this, but we check explicitly for a clear error message.)
  const { data: resident } = await supabase
    .from('residents')
    .select('id, email, house_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!resident) {
    return NextResponse.json({ error: 'No resident profile found' }, { status: 403 })
  }

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, amount, amount_paid, house_id, status')
    .eq('id', invoice_id)
    .single()

  if (!invoice || invoice.house_id !== resident.house_id) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  const outstanding = Number(invoice.amount) - Number(invoice.amount_paid ?? 0)
  if (outstanding <= 0) {
    return NextResponse.json({ error: 'This invoice is already paid' }, { status: 400 })
  }

  const email = resident.email ?? user.email
  if (!email) {
    return NextResponse.json(
      { error: 'No email on file to receive a receipt' },
      { status: 400 }
    )
  }

  // Unique reference we control, so we can find our payment row after Paystack redirects back.
  const reference = `INV-${invoice.id.slice(0, 8)}-${Date.now()}`

  // Create a pending payment record up front (service role, since a resident
  // can only SELECT their own payments per RLS, not INSERT).
  const service = createServiceClient()
  const { error: insertError } = await service.from('payments').insert({
    invoice_id: invoice.id,
    resident_id: resident.id,
    amount: outstanding,
    paystack_reference: reference,
    status: 'pending',
  })
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const origin = req.nextUrl.origin
  try {
    const tx = await initializeTransaction({
      email,
      amountKobo: Math.round(outstanding * 100),
      reference,
      callbackUrl: `${origin}/portal/payment/callback`,
      metadata: { invoice_id: invoice.id, resident_id: resident.id },
    })
    return NextResponse.json({ authorization_url: tx.authorization_url })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Payment initialization failed' },
      { status: 500 }
    )
  }
}
