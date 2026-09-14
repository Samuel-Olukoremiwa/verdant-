import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Reports are read through the caller's own authenticated session (not the
// service role) so Supabase's normal admin RLS policies apply — this route
// can never be used to see more than an admin's session already permits.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { data: admin } = await supabase
    .from('admins')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()
  if (!admin || !['admin', 'super_admin'].includes(admin.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const type = req.nextUrl.searchParams.get('type') ?? 'due'
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  const today = new Date().toISOString().slice(0, 10)

  if (type === 'collected') {
    let query = supabase
      .from('payments')
      .select(
        'id, amount, paid_at, paystack_reference, status, invoices ( period_label, due_types ( name ), houses ( address ) )'
      )
      .eq('status', 'success')
      .order('paid_at', { ascending: false })
    if (from) query = query.gte('paid_at', from)
    if (to) query = query.lte('paid_at', `${to}T23:59:59`)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = (data ?? []).map((p) => {
      const inv = p.invoices as unknown as {
        period_label: string | null
        due_types: { name: string } | null
        houses: { address: string } | null
      } | null
      return {
        house: inv?.houses?.address ?? '—',
        charge: inv?.due_types?.name ?? 'Estate charge',
        period: inv?.period_label ?? '—',
        amount: Number(p.amount),
        date: p.paid_at,
        reference: p.paystack_reference ?? '—',
      }
    })
    return NextResponse.json({ rows })
  }

  // due / overdue / future all read from invoices, just with different
  // date/status constraints applied below.
  let query = supabase
    .from('invoices')
    .select('id, amount, amount_paid, status, due_date, period_label, houses ( address ), due_types ( name )')

  if (from) query = query.gte('due_date', from)
  if (to) query = query.lte('due_date', to)
  if (type === 'overdue') {
    query = query.lt('due_date', today).in('status', ['unpaid', 'partial'])
  } else if (type === 'future') {
    query = query.gt('due_date', today)
  }
  query = query.order('due_date', { ascending: type === 'future' })

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []).map((inv) => {
    const house = inv.houses as unknown as { address: string } | null
    const dueType = inv.due_types as unknown as { name: string } | null
    return {
      house: house?.address ?? '—',
      charge: dueType?.name ?? 'Estate charge',
      period: inv.period_label ?? '—',
      amount: Number(inv.amount),
      outstanding: Math.max(0, Number(inv.amount) - Number(inv.amount_paid ?? 0)),
      status: inv.status,
      dueDate: inv.due_date,
    }
  })
  return NextResponse.json({ rows })
}
