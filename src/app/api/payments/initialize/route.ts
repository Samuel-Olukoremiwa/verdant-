import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { initializeTransaction } from '@/lib/paystack'

// The same database function prices both the read-only quote and checkout.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  let body
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid payment request' }, { status: 400 })
  }
  if (!body || !Array.isArray(body.items) || !body.items.length || body.items.length > 120) {
    return NextResponse.json({ error: 'Choose between 1 and 120 payment items' }, { status: 400 })
  }
  const quoteOnly = body.quote_only === true
  if (!quoteOnly && (!Number.isSafeInteger(body.expected_total_kobo) || body.expected_total_kobo <= 0)) {
    return NextResponse.json({ error: 'Review the payment amount first' }, { status: 400 })
  }
  const reference = `INV-${randomUUID()}`
  const service = createServiceClient()
  const { data, error } = await service.rpc('prepare_estate_payment', {
    p_auth_user: user.id, p_items: body.items, p_reference: reference,
    p_expected_kobo: quoteOnly ? null : body.expected_total_kobo, p_quote_only: quoteOnly,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (quoteOnly) return NextResponse.json({ total_kobo: data.total_kobo, lines: data.lines })
  const email = data.email || user.email
  if (!email) return NextResponse.json({ error: 'No receipt email available; contact the estate office' }, { status: 400 })
  try {
    const tx = await initializeTransaction({
      email, amountKobo: data.total_kobo, reference,
      callbackUrl: `${req.nextUrl.origin}/portal/payment/callback`,
      metadata: { resident_id: data.resident_id },
    })
    return NextResponse.json({ authorization_url: tx.authorization_url })
  } catch {
    // Retain the reference: an upstream timeout may still have created a transaction.
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 })
  }
}
