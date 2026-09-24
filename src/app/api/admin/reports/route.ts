import {
  incomeStatementRows,
  type StatementPayment,
  type StatementExpense,
} from '@/lib/income-statement'
import { readAll } from '@/lib/read-all'
import { estateDate } from '@/lib/dashboard'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  if (
    !['due', 'collected', 'overdue', 'future', 'expenses', 'income-statement'].includes(
      type
    ) ||
    (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) ||
    (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) ||
    (from && to && from > to)
  ) {
    return NextResponse.json(
      { error: 'Choose a valid report and date range' },
      { status: 400 }
    )
  }

  const validDate = (value: string) =>
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value

  if ((from && !validDate(from)) || (to && !validDate(to))) {
    return NextResponse.json(
      { error: 'Choose valid calendar dates' },
      { status: 400 }
    )
  }

  if (from && to && Date.parse(to) - Date.parse(from) > 3660 * 86400000) {
    return NextResponse.json(
      { error: 'Choose a date range of ten years or less' },
      { status: 400 }
    )
  }

  const today = estateDate()

  try {
    if (type === 'income-statement') {
      if (!from || !to) {
        return NextResponse.json(
          { error: 'Choose both statement dates' },
          { status: 400 }
        )
      }

      const next = new Date(to)
      next.setUTCDate(next.getUTCDate() + 1)

      const [payments, expenses] = await Promise.all([
        readAll((start, end) =>
          supabase
            .from('payments')
            .select(`
              id,
              amount,
              invoices (
                due_type_id,
                due_types ( name ),
                houses (
                  street_id,
                  streets ( name )
                ),
                residents (
                  houses:houses!residents_house_id_fkey (
                    street_id,
                    streets ( name )
                  )
                )
              )
            `)
            .eq('status', 'success')
            .gte('paid_at', `${from}T00:00:00+01:00`)
            .lt(
              'paid_at',
              `${next.toISOString().slice(0, 10)}T00:00:00+01:00`
            )
            .order('id')
            .range(start, end)
        ),
        readAll((start, end) =>
          supabase
            .from('expenses')
            .select('id,amount,description,category,expense_date')
            .gte('expense_date', from)
            .lte('expense_date', to)
            .order('expense_date')
            .order('id')
            .range(start, end)
        ),
      ])

      return NextResponse.json({
        rows: incomeStatementRows(
          payments as unknown as StatementPayment[],
          expenses as StatementExpense[]
        ),
      })
    }

    if (type === 'expenses') {
      let query = supabase
        .from('expenses')
        .select('id, category, description, amount, expense_date')
        .order('expense_date', { ascending: false })

      if (from) query = query.gte('expense_date', from)
      if (to) query = query.lte('expense_date', to)

      const data = await readAll((start, end) =>
        query.order('id').range(start, end)
      )

      const rows = (data ?? []).map((expense) => ({
        house: expense.category,
        charge: expense.description,
        period: '—',
        amount: Number(expense.amount),
        date: expense.expense_date,
        reference: '—',
      }))

      return NextResponse.json({ rows })
    }

    if (type === 'collected') {
      let query = supabase
        .from('payments')
        .select(`
          id,
          amount,
          paid_at,
          paystack_reference,
          status,
          invoices (
            period_label,
            due_types ( name ),
            houses ( address ),
            residents ( full_name )
          )
        `)
        .eq('status', 'success')
        .order('paid_at', { ascending: false })

      if (from) query = query.gte('paid_at', `${from}T00:00:00+01:00`)
      if (to) {
        const next = new Date(to)
        next.setUTCDate(next.getUTCDate() + 1)
        query = query.lt(
          'paid_at',
          `${next.toISOString().slice(0, 10)}T00:00:00+01:00`
        )
      }

      const data = await readAll((start, end) =>
        query.order('id').range(start, end)
      )

      const rows = (data ?? []).map((payment) => {
        const invoice = payment.invoices as unknown as {
          period_label: string | null
          due_types: { name: string } | null
          houses: { address: string } | null
          residents: { full_name: string } | null
        } | null

        return {
          house:
            invoice?.houses?.address ??
            invoice?.residents?.full_name ??
            '—',
          charge: invoice?.due_types?.name ?? 'Estate charge',
          period: invoice?.period_label ?? '—',
          amount: Number(payment.amount),
          date: payment.paid_at,
          reference: payment.paystack_reference ?? '—',
        }
      })

      return NextResponse.json({ rows })
    }

    let query = supabase.from('invoices').select(`
      id,
      house_id,
      resident_id,
      due_type_id,
      amount,
      amount_paid,
      status,
      due_date,
      period_label,
      houses ( address ),
      residents ( full_name ),
      due_types ( name )
    `)

    if (from) query = query.gte('due_date', from)
    if (to) query = query.lte('due_date', to)

    if (type === 'overdue') {
      query = query
        .lt('due_date', today)
        .in('status', ['unpaid', 'partial', 'overdue'])
    } else if (type === 'future') {
      query = query.gt('due_date', today)
    }

    query = query.order('due_date', { ascending: type === 'future' })

    const data = await readAll((start, end) =>
      query.order('id').range(start, end)
    )

    const rows = (data ?? []).map((invoice) => {
      const house = invoice.houses as unknown as { address: string } | null
      const resident = invoice.residents as unknown as {
        full_name: string
      } | null
      const dueType = invoice.due_types as unknown as { name: string } | null

      return {
        house: house?.address ?? resident?.full_name ?? '—',
        charge: dueType?.name ?? 'Estate charge',
        period: invoice.period_label ?? '—',
        amount: Number(invoice.amount),
        outstanding: Math.max(
          0,
          Number(invoice.amount) - Number(invoice.amount_paid ?? 0)
        ),
        status: invoice.status,
        dueDate: invoice.due_date,
      }
    })

    if (type === 'future') {
      const fixedDueTypes = await readAll((start, end) =>
        supabase
          .from('due_types')
          .select('id, name, amount')
          .eq('billing_scope', 'house')
          .in('name', ['Service Charge', 'CDA Levy'])
          .order('id')
          .range(start, end)
      )

      const houses = await readAll((start, end) =>
        supabase
          .from('houses')
          .select('id, address')
          .order('id')
          .range(start, end)
      )

      const fixedIds = fixedDueTypes.map((dueType) => dueType.id)
      const existing = fixedIds.length
        ? await readAll((start, end) =>
            supabase
              .from('invoices')
              .select('id,house_id,due_type_id,period_label')
              .in('due_type_id', fixedIds)
              .order('id')
              .range(start, end)
          )
        : []

      const realKeys = new Set(
        existing.map(
          (invoice) =>
            `${invoice.house_id}::${invoice.due_type_id}::${invoice.period_label}`
        )
      )

      const rangeStart = from ? new Date(from) : new Date()
      const rangeEnd = to
        ? new Date(to)
        : new Date(
            Date.UTC(
              rangeStart.getUTCFullYear(),
              rangeStart.getUTCMonth() + 6,
              0
            )
          )

      for (const dueType of fixedDueTypes ?? []) {
        const cursor = new Date(
          Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), 1)
        )

        while (cursor <= rangeEnd) {
          const periodLabel = cursor.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })

          const dueDate = new Date(
            Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)
          )

          if (
            dueDate.toISOString().slice(0, 10) > today &&
            dueDate >= rangeStart &&
            dueDate <= rangeEnd
          ) {
            for (const house of houses ?? []) {
              const key = `${house.id}::${dueType.id}::${periodLabel}`

              if (!realKeys.has(key)) {
                rows.push({
                  house: house.address,
                  charge: dueType.name,
                  period: periodLabel,
                  amount: Number(dueType.amount),
                  outstanding: Number(dueType.amount),
                  status: 'projected',
                  dueDate: dueDate.toISOString().slice(0, 10),
                })
              }
            }
          }

          cursor.setUTCMonth(cursor.getUTCMonth() + 1)
        }
      }

      rows.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    }

    return NextResponse.json({ rows })
  } catch {
    return NextResponse.json(
      { error: 'The report could not be loaded. Please try again.' },
      { status: 500 }
    )
  }
}
