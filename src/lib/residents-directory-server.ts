import 'server-only'

import type {
  createClient,
} from '@/lib/supabase/server'

type ServerClient =
  Awaited<
    ReturnType<
      typeof createClient
    >
  >

export const RESIDENTS_PAGE_SIZE =
  50

export type ResidentDirectoryFilters = {
  query: string

  street:
    | string
    | null

  status:
    | 'all'
    | 'active'
    | 'inactive'

  dues:
    | 'all'
    | 'yes'
    | 'no'

  page: number
}

export type ResidentDirectoryRow = {
  id: string

  resident_code:
    string

  full_name:
    string

  phone:
    | string
    | null

  relationship:
    string

  is_active:
    boolean

  address:
    | string
    | null

  house_type:
    | string
    | null

  street_id:
    | string
    | null

  street_name:
    | string
    | null

  personalOutstanding:
    number

  householdOutstanding:
    number

  managesHouseholdBilling:
    boolean

  billingContactName:
    | string
    | null
}

type RpcRow = {
  id?: unknown
  resident_code?: unknown
  full_name?: unknown
  phone?: unknown
  relationship?: unknown
  is_active?: unknown
  address?: unknown
  house_type?: unknown
  street_id?: unknown
  street_name?: unknown
  personal_outstanding?: unknown
  household_outstanding?: unknown
  manages_household_billing?: unknown
  billing_contact_name?: unknown
}

type RpcResult = {
  total?: unknown
  rows?: unknown
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

export function normalizeResidentFilters(
  params: Record<
    string,
    | string
    | string[]
    | undefined
  >
): ResidentDirectoryFilters {
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

  const rawStreet =
    firstValue(
      params.street
    )

  const street =
    rawStreet &&
    UUID_PATTERN.test(
      rawStreet
    )
      ? rawStreet
      : null

  const rawStatus =
    firstValue(
      params.status
    )

  const status:
    ResidentDirectoryFilters['status'] =
      rawStatus ===
        'active' ||
      rawStatus ===
        'inactive'
        ? rawStatus
        : 'all'

  const rawDues =
    firstValue(
      params.dues
    )

  const dues:
    ResidentDirectoryFilters['dues'] =
      rawDues ===
        'yes' ||
      rawDues ===
        'no'
        ? rawDues
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
    street,
    status,
    dues,
    page,
  }
}

function numberValue(
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
      'Invalid resident balance returned by database'
    )
  }

  return number
}

function parseRow(
  value: unknown
): ResidentDirectoryRow {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    throw new Error(
      'Invalid resident returned by database'
    )
  }

  const row =
    value as RpcRow

  if (
    typeof row.id !==
      'string' ||
    typeof row.resident_code !==
      'string' ||
    typeof row.full_name !==
      'string' ||
    typeof row.relationship !==
      'string' ||
    typeof row.is_active !==
      'boolean'
  ) {
    throw new Error(
      'Invalid resident directory record'
    )
  }

  return {
    id:
      row.id,

    resident_code:
      row.resident_code,

    full_name:
      row.full_name,

    phone:
      typeof row.phone ===
      'string'
        ? row.phone
        : null,

    relationship:
      row.relationship,

    is_active:
      row.is_active,

    address:
      typeof row.address ===
      'string'
        ? row.address
        : null,

    house_type:
      typeof row.house_type ===
      'string'
        ? row.house_type
        : null,

    street_id:
      typeof row.street_id ===
      'string'
        ? row.street_id
        : null,

    street_name:
      typeof row.street_name ===
      'string'
        ? row.street_name
        : null,

    personalOutstanding:
      numberValue(
        row.personal_outstanding
      ),

    householdOutstanding:
      numberValue(
        row.household_outstanding
      ),

    managesHouseholdBilling:
      row.manages_household_billing ===
      true,

    billingContactName:
      typeof row.billing_contact_name ===
      'string'
        ? row.billing_contact_name
        : null,
  }
}

export async function loadResidentsDirectory(
  db: ServerClient,

  filters:
    ResidentDirectoryFilters
) {
  const offset =
    (
      filters.page -
      1
    ) *
    RESIDENTS_PAGE_SIZE

  const {
    data,
    error,
  } =
    await db.rpc(
      'admin_residents_page',
      {
        p_query:
          filters.query ||
          null,

        p_street:
          filters.street,

        p_status:
          filters.status,

        p_dues:
          filters.dues,

        p_limit:
          RESIDENTS_PAGE_SIZE,

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
      'Invalid resident directory response'
    )
  }

  const result =
    data as RpcResult

  const total =
    Number(
      result.total ??
        0
    )

  if (
    !Number.isInteger(
      total
    ) ||
    total < 0
  ) {
    throw new Error(
      'Invalid resident count returned by database'
    )
  }

  const rows =
    Array.isArray(
      result.rows
    )
      ? result.rows.map(
          parseRow
        )
      : []

  return {
    rows,
    total,
    pageSize:
      RESIDENTS_PAGE_SIZE,
  }
}