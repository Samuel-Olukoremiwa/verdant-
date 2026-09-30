import 'server-only'

import type {
  createClient,
} from '@/lib/supabase/server'

import {
  INVOICES_PAGE_SIZE,
  type InvoiceDirectoryFilters,
  type InvoiceDirectoryOptions,
  type InvoiceDirectoryRow,
} from '@/lib/invoices-directory'

type ServerClient =
  Awaited<
    ReturnType<
      typeof createClient
    >
  >

type RawRow = {
  id?: unknown
  target?: unknown
  scope?: unknown
  scope_label?: unknown
  charge?: unknown
  period?: unknown
  due_date?: unknown
  status?: unknown
  amount?: unknown
  amount_paid?: unknown
  outstanding?: unknown
}

type RawFilters = {
  targets?: unknown
  charges?: unknown
  periods?: unknown
  due_dates?: unknown
}

type RawResponse = {
  total?: unknown
  total_billed?: unknown
  total_outstanding?: unknown
  rows?: unknown
  filters?: unknown
}

function money(
  value: unknown
) {
  const number =
    Number(
      value ??
        0
    )

  if (
    !Number.isFinite(
      number
    )
  ) {
    throw new Error(
      'Invalid invoice amount returned by database'
    )
  }

  return number
}

function integer(
  value: unknown
) {
  const number =
    Number(
      value ??
        0
    )

  if (
    !Number.isInteger(
      number
    ) ||
    number < 0
  ) {
    throw new Error(
      'Invalid invoice count returned by database'
    )
  }

  return number
}

function strings(
  value: unknown
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return []
  }

  return value.filter(
    (
      item
    ): item is string =>
      typeof item ===
      'string'
  )
}

function parseRow(
  value: unknown
): InvoiceDirectoryRow {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    throw new Error(
      'Invalid invoice returned by database'
    )
  }

  const row =
    value as RawRow

  if (
    typeof row.id !==
      'string' ||
    typeof row.target !==
      'string' ||
    (
      row.scope !==
        'house' &&
      row.scope !==
        'resident'
    ) ||
    typeof row.scope_label !==
      'string' ||
    typeof row.charge !==
      'string' ||
    typeof row.period !==
      'string' ||
    typeof row.status !==
      'string'
  ) {
    throw new Error(
      'Invalid invoice directory record'
    )
  }

  return {
    id:
      row.id,

    target:
      row.target,

    scope:
      row.scope,

    scopeLabel:
      row.scope_label,

    charge:
      row.charge,

    period:
      row.period,

    dueDate:
      typeof row.due_date ===
      'string'
        ? row.due_date
        : null,

    status:
      row.status,

    amount:
      money(
        row.amount
      ),

    amountPaid:
      money(
        row.amount_paid
      ),

    outstanding:
      money(
        row.outstanding
      ),
  }
}

function parseOptions(
  value: unknown
): InvoiceDirectoryOptions {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    return {
      targets:
        [],
      charges:
        [],
      periods:
        [],
      dueDates:
        [],
    }
  }

  const filters =
    value as RawFilters

  return {
    targets:
      strings(
        filters.targets
      ),

    charges:
      strings(
        filters.charges
      ),

    periods:
      strings(
        filters.periods
      ),

    dueDates:
      strings(
        filters.due_dates
      ),
  }
}

export async function loadInvoicesDirectory(
  db: ServerClient,
  filters:
    InvoiceDirectoryFilters
) {
  const offset =
    (
      filters.page -
      1
    ) *
    INVOICES_PAGE_SIZE

  const {
    data,
    error,
  } =
    await db.rpc(
      'admin_invoices_page',
      {
        p_query:
          filters.query ||
          null,

        p_target:
          filters.target,

        p_scope:
          filters.scope,

        p_charge:
          filters.charge,

        p_period:
          filters.period,

        p_due_date:
          filters.dueDate,

        p_status:
          filters.status,

        p_outstanding:
          filters.outstanding,

        p_limit:
          INVOICES_PAGE_SIZE,

        p_offset:
          offset,
      }
    )

  if (error) {
    throw new Error(
      error.message
    )
  }

  if (
    !data ||
    typeof data !==
      'object'
  ) {
    throw new Error(
      'Invalid invoice directory response'
    )
  }

  const raw =
    data as RawResponse

  return {
    rows:
      Array.isArray(
        raw.rows
      )
        ? raw.rows.map(
            parseRow
          )
        : [],

    total:
      integer(
        raw.total
      ),

    totalBilled:
      money(
        raw.total_billed
      ),

    totalOutstanding:
      money(
        raw.total_outstanding
      ),

    options:
      parseOptions(
        raw.filters
      ),

    pageSize:
      INVOICES_PAGE_SIZE,
  }
}