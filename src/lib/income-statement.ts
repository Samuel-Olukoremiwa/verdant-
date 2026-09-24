import type { ReportRow } from './report-format'

type StreetHouse = {
  street_id?: string | null
  streets: { name: string } | null
}

export type StatementPayment = {
  amount: number | string
  invoices: {
    due_type_id?: string | null
    due_types: { name: string } | null
    houses: StreetHouse | null
    residents?: { houses: StreetHouse | null } | null
  } | null
}

export type StatementExpense = {
  amount: number | string
  description: string
  category: string
  expense_date: string
}

// Aggregate in kobo so fractional naira do not accumulate rounding drift.
export function incomeStatementRows(
  payments: StatementPayment[],
  expenses: StatementExpense[]
): ReportRow[] {
  const groups = new Map<
    string,
    {
      name: string
      total: number
      streets: Map<string, { name: string; total: number }>
    }
  >()

  let income = 0
  let spent = 0

  const kobo = (value: number | string) => {
    const number = Number(value)
    if (!Number.isFinite(number) || number < 0) {
      throw new Error('Invalid statement amount')
    }
    return Math.round(number * 100)
  }

  for (const payment of payments) {
    const amount = kobo(payment.amount)
    const invoice = payment.invoices
    const name = invoice?.due_types?.name || 'Unallocated income'
    const key = invoice?.due_type_id || name

    const group = groups.get(key) || {
      name,
      total: 0,
      streets: new Map<string, { name: string; total: number }>(),
    }

    const location = invoice?.houses ?? invoice?.residents?.houses ?? null
    const streetName = location?.streets?.name || 'Unassigned street'
    const streetKey = location?.street_id || streetName
    const street = group.streets.get(streetKey) || {
      name: streetName,
      total: 0,
    }

    street.total += amount
    group.streets.set(streetKey, street)
    group.total += amount
    groups.set(key, group)
    income += amount
  }

  const rows: ReportRow[] = [
    { kind: 'section', label: 'INCOME', detail: null, total: null },
  ]

  for (const group of [...groups.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    rows.push({
      kind: 'income',
      label: group.name,
      detail: null,
      total: group.total / 100,
    })

    for (const street of [...group.streets.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      rows.push({
        kind: 'street',
        label: street.name,
        detail: street.total / 100,
        total: null,
      })
    }
  }

  rows.push(
    { kind: 'subtotal', label: 'TOTAL INCOME', detail: null, total: income / 100 },
    { kind: 'section', label: 'EXPENSES', detail: null, total: null }
  )

  for (const expense of expenses) {
    const amount = kobo(expense.amount)
    spent += amount
    rows.push({
      kind: 'expense',
      label: expense.description || expense.category,
      category: expense.category,
      date: expense.expense_date,
      detail: amount / 100,
      total: null,
    })
  }

  rows.push(
    {
      kind: 'subtotal',
      label: 'TOTAL EXPENSES',
      detail: null,
      total: spent / 100,
    },
    {
      kind: income < spent ? 'deficit' : 'surplus',
      label: income < spent ? 'DEFICIT' : 'SURPLUS',
      detail: null,
      total: Math.abs(income - spent) / 100,
    }
  )

  return rows
}
