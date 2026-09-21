export type BillingInvoice = { id: string; house_id: string; amount: number; amount_paid: number | null; due_date: string | null; houses: { address: string; street_id: string | null; streets: { name: string } | null } | null; due_types: { name: string } | null }
export type Collection = { amount: number; paid_at: string | null; invoices: { due_types: { name: string } | null } | null }
export type Expense = { amount: number; expense_date: string }
export type Summary = { billed: number; collected: number; outstanding: number; homes: number; spent: number; balance: number; charges: { name: string; billed: number; collected: number; outstanding: number }[] }
export type HouseBalance = { id: string; address: string; streetId: string; street: string; owed: number; paid: number }
export function estateDate(date = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date) }
export function summarize(invoices: BillingInvoice[], payments: Collection[], expenses: Expense[], month?: string): Summary {
  const selected = invoices.filter(i => !month || i.due_date?.startsWith(month))
  const collected = payments.filter(p => !month || (p.paid_at && estateDate(new Date(p.paid_at)).startsWith(month)))
  const spent = expenses.filter(e => !month || e.expense_date.startsWith(month)).reduce((sum, e) => sum + Number(e.amount), 0)
  const charges = new Map<string, Summary['charges'][number]>(['Service Charge', 'CDA Levy'].map(name => [name, { name, billed: 0, collected: 0, outstanding: 0 }]))
  const charge = (name: string) => { if (!charges.has(name)) charges.set(name, { name, billed: 0, collected: 0, outstanding: 0 }); return charges.get(name)! }
  for (const i of selected) { const c = charge(i.due_types?.name ?? 'Other charges'); c.billed += Number(i.amount); c.outstanding += Math.max(0, Number(i.amount) - Number(i.amount_paid ?? 0)) }
  for (const p of collected) charge(p.invoices?.due_types?.name ?? 'Other charges').collected += Number(p.amount)
  const total = [...charges.values()]
  const income = total.reduce((s, c) => s + c.collected, 0)
  return { billed: total.reduce((s, c) => s + c.billed, 0), outstanding: total.reduce((s, c) => s + c.outstanding, 0), collected: income, homes: new Set(selected.map(i => i.house_id)).size, spent, balance: income - spent, charges: total }
}
export function houseBalances(invoices: BillingInvoice[]): HouseBalance[] {
  const houses = new Map<string, HouseBalance>()
  for (const i of invoices) {
    if (!i.houses) continue
    if (!houses.has(i.house_id)) houses.set(i.house_id, { id: i.house_id, address: i.houses.address, streetId: i.houses.street_id ?? '', street: i.houses.streets?.name ?? 'Unassigned street', owed: 0, paid: 0 })
    const h = houses.get(i.house_id)!; h.owed += Number(i.amount); h.paid += Number(i.amount_paid ?? 0)
  }
  return [...houses.values()].sort((a, b) => (b.owed - b.paid) - (a.owed - a.paid))
}
