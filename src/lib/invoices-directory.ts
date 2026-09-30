export const INVOICES_PAGE_SIZE =
  50

export type InvoiceScope =
  | 'all'
  | 'house'
  | 'resident'

export type InvoiceOutstandingFilter =
  | 'all'
  | 'positive'
  | 'zero'
  | 'under5000'
  | '5000plus'

export type InvoiceStatusFilter =
  | 'all'
  | 'unpaid'
  | 'partial'
  | 'paid'
  | 'overdue'

export type InvoiceDirectoryFilters = {
  query: string

  target:
    | string
    | null

  scope:
    InvoiceScope

  charge:
    | string
    | null

  period:
    | string
    | null

  dueDate:
    | string
    | null

  status:
    InvoiceStatusFilter

  outstanding:
    InvoiceOutstandingFilter

  page:
    number
}

export type InvoiceDirectoryRow = {
  id: string

  target:
    string

  scope:
    | 'house'
    | 'resident'

  scopeLabel:
    string

  charge:
    string

  period:
    string

  dueDate:
    | string
    | null

  status:
    string

  amount:
    number

  amountPaid:
    number

  outstanding:
    number
}

export type InvoiceDirectoryOptions = {
  targets:
    string[]

  charges:
    string[]

  periods:
    string[]

  dueDates:
    string[]
}

function firstValue(
  value:
    | string
    | string[]
    | undefined
) {
  return Array.isArray(
    value
  )
    ? value[0]
    : value
}

function cleanText(
  value:
    | string
    | undefined,
  max = 160
) {
  const cleaned =
    (
      value ??
      ''
    )
      .trim()
      .slice(
        0,
        max
      )

  return cleaned ||
    null
}

export function normalizeInvoiceFilters(
  params: Record<
    string,
    | string
    | string[]
    | undefined
  >
): InvoiceDirectoryFilters {
  const query =
    (
      firstValue(
        params.q
      ) ??
      ''
    )
      .trim()
      .slice(
        0,
        120
      )

  const target =
    cleanText(
      firstValue(
        params.target
      )
    )

  const charge =
    cleanText(
      firstValue(
        params.charge
      )
    )

  const period =
    cleanText(
      firstValue(
        params.period
      )
    )

  const rawDueDate =
    firstValue(
      params.dueDate
    )

  const dueDate =
    rawDueDate ===
      '__none__' ||
    (
      rawDueDate &&
      /^\d{4}-\d{2}-\d{2}$/.test(
        rawDueDate
      )
    )
      ? rawDueDate
      : null

  const rawScope =
    firstValue(
      params.scope
    )

  const scope:
    InvoiceScope =
      rawScope ===
        'house' ||
      rawScope ===
        'resident'
        ? rawScope
        : 'all'

  const rawStatus =
    firstValue(
      params.status
    )

  const status:
    InvoiceStatusFilter =
      rawStatus ===
        'unpaid' ||
      rawStatus ===
        'partial' ||
      rawStatus ===
        'paid' ||
      rawStatus ===
        'overdue'
        ? rawStatus
        : 'all'

  const rawOutstanding =
    firstValue(
      params.outstanding
    )

  const outstanding:
    InvoiceOutstandingFilter =
      rawOutstanding ===
        'positive' ||
      rawOutstanding ===
        'zero' ||
      rawOutstanding ===
        'under5000' ||
      rawOutstanding ===
        '5000plus'
        ? rawOutstanding
        : 'all'

  const rawPage =
    Number(
      firstValue(
        params.page
      ) ??
        '1'
    )

  const page =
    Number.isInteger(
      rawPage
    ) &&
    rawPage > 0
      ? rawPage
      : 1

  return {
    query,
    target,
    scope,
    charge,
    period,
    dueDate,
    status,
    outstanding,
    page,
  }
}