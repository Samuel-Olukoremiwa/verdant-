export type BillingInvoice = {
  id: string
  house_id: string | null
  resident_id: string | null
  amount: number
  amount_paid: number | null
  due_date: string | null
  houses: {
    address: string
    street_id: string | null
    streets: { name: string } | null
  } | null
  due_types: { name: string } | null
}

export type Collection = {
  amount: number
  paid_at: string | null
  invoices: { due_types: { name: string } | null } | null
}

export type Expense = {
  amount: number
  expense_date: string
}

export type Summary = {
  billed: number
  collected: number
  outstanding: number
  homes: number
  residents: number
  spent: number
  balance: number
  charges: {
    name: string
    billed: number
    collected: number
    outstanding: number
  }[]
}

export type HouseBalance = {
  id: string
  address: string
  streetId: string
  street: string
  owed: number
  paid: number
}

export function estateDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function summarize(
  invoices: BillingInvoice[],
  payments: Collection[],
  expenses: Expense[],
  month?: string
): Summary {
  const selected = invoices.filter(
    (invoice) => !month || invoice.due_date?.startsWith(month)
  )

  const collected = payments.filter(
    (payment) =>
      !month ||
      (payment.paid_at &&
        estateDate(new Date(payment.paid_at)).startsWith(month))
  )

  const spent = expenses
    .filter((expense) => !month || expense.expense_date.startsWith(month))
    .reduce((sum, expense) => sum + Number(expense.amount), 0)

  const charges = new Map<string, Summary['charges'][number]>(
    ['Service Charge', 'CDA Levy'].map((name) => [
      name,
      { name, billed: 0, collected: 0, outstanding: 0 },
    ])
  )

  const charge = (name: string) => {
    if (!charges.has(name)) {
      charges.set(name, { name, billed: 0, collected: 0, outstanding: 0 })
    }
    return charges.get(name)!
  }

  for (const invoice of selected) {
    const item = charge(invoice.due_types?.name ?? 'Other charges')
    item.billed += Number(invoice.amount)
    item.outstanding += Math.max(
      0,
      Number(invoice.amount) - Number(invoice.amount_paid ?? 0)
    )
  }

  for (const payment of collected) {
    charge(payment.invoices?.due_types?.name ?? 'Other charges').collected +=
      Number(payment.amount)
  }

  const total = [...charges.values()]
  const income = total.reduce((sum, item) => sum + item.collected, 0)

  const homes = new Set(
    selected
      .map((invoice) => invoice.house_id)
      .filter((houseId): houseId is string => Boolean(houseId))
  ).size

  const residents = new Set(
    selected
      .map((invoice) => invoice.resident_id)
      .filter((residentId): residentId is string => Boolean(residentId))
  ).size

  return {
    billed: total.reduce((sum, item) => sum + item.billed, 0),
    outstanding: total.reduce((sum, item) => sum + item.outstanding, 0),
    collected: income,
    homes,
    residents,
    spent,
    balance: income - spent,
    charges: total,
  }
}

export function houseBalances(invoices: BillingInvoice[]): HouseBalance[] {
  const houses = new Map<string, HouseBalance>()

  for (const invoice of invoices) {
    if (!invoice.house_id || !invoice.houses) continue

    if (!houses.has(invoice.house_id)) {
      houses.set(invoice.house_id, {
        id: invoice.house_id,
        address: invoice.houses.address,
        streetId: invoice.houses.street_id ?? '',
        street: invoice.houses.streets?.name ?? 'Unassigned street',
        owed: 0,
        paid: 0,
      })
    }

    const house = houses.get(invoice.house_id)!
    house.owed += Number(invoice.amount)
    house.paid += Number(invoice.amount_paid ?? 0)
  }

  return [...houses.values()].sort(
    (a, b) => b.owed - b.paid - (a.owed - a.paid)
  )
}
