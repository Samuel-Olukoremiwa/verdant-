import 'server-only'

import type {
  createClient,
} from '@/lib/supabase/server'

import type {
  HouseBalance,
  Summary,
} from '@/lib/dashboard'

type ServerClient =
  Awaited<
    ReturnType<
      typeof createClient
    >
  >

type SummaryPayload = {
  billed?: unknown
  collected?: unknown
  outstanding?: unknown
  homes?: unknown
  residents?: unknown
  spent?: unknown
  balance?: unknown
  charges?: unknown
}

type ChargePayload = {
  name?: unknown
  billed?: unknown
  collected?: unknown
  outstanding?: unknown
}

type HousePayload = {
  id?: unknown
  address?: unknown
  street_id?: unknown
  street?: unknown
  owed?: unknown
  paid?: unknown
}

function money(
  value: unknown
) {
  const number =
    Number(
      value ?? 0
    )

  if (
    !Number.isFinite(
      number
    )
  ) {
    throw new Error(
      'Invalid financial value returned by database'
    )
  }

  return number
}

function count(
  value: unknown
) {
  const number =
    Number(
      value ?? 0
    )

  if (
    !Number.isInteger(
      number
    ) ||
    number < 0
  ) {
    throw new Error(
      'Invalid dashboard count returned by database'
    )
  }

  return number
}

function summary(
  value: unknown
): Summary {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    throw new Error(
      'Invalid dashboard summary returned by database'
    )
  }

  const raw =
    value as SummaryPayload

  const rawCharges =
    Array.isArray(
      raw.charges
    )
      ? raw.charges
      : []

  const charges =
    rawCharges.map(
      (
        item
      ) => {
        if (
          !item ||
          typeof item !==
            'object'
        ) {
          throw new Error(
            'Invalid dashboard charge returned by database'
          )
        }

        const charge =
          item as ChargePayload

        if (
          typeof charge.name !==
          'string'
        ) {
          throw new Error(
            'Invalid dashboard charge name returned by database'
          )
        }

        return {
          name:
            charge.name,

          billed:
            money(
              charge.billed
            ),

          collected:
            money(
              charge.collected
            ),

          outstanding:
            money(
              charge.outstanding
            ),
        }
      }
    )

  return {
    billed:
      money(
        raw.billed
      ),

    collected:
      money(
        raw.collected
      ),

    outstanding:
      money(
        raw.outstanding
      ),

    homes:
      count(
        raw.homes
      ),

    residents:
      count(
        raw.residents
      ),

    spent:
      money(
        raw.spent
      ),

    balance:
      money(
        raw.balance
      ),

    charges,
  }
}

function houses(
  value: unknown
): HouseBalance[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    throw new Error(
      'Invalid household balances returned by database'
    )
  }

  return value.map(
    (
      item
    ) => {
      if (
        !item ||
        typeof item !==
          'object'
      ) {
        throw new Error(
          'Invalid household balance returned by database'
        )
      }

      const row =
        item as HousePayload

      if (
        typeof row.id !==
          'string' ||
        typeof row.address !==
          'string'
      ) {
        throw new Error(
          'Invalid household identity returned by database'
        )
      }

      return {
        id:
          row.id,

        address:
          row.address,

        streetId:
          typeof row.street_id ===
          'string'
            ? row.street_id
            : '',

        street:
          typeof row.street ===
          'string'
            ? row.street
            : 'Unassigned street',

        owed:
          money(
            row.owed
          ),

        paid:
          money(
            row.paid
          ),
      }
    }
  )
}

function monthBounds(
  today: string
) {
  const [
    yearText,
    monthText,
  ] =
    today.split(
      '-'
    )

  const year =
    Number(
      yearText
    )

  const month =
    Number(
      monthText
    )

  if (
    !Number.isInteger(
      year
    ) ||
    !Number.isInteger(
      month
    ) ||
    month < 1 ||
    month > 12
  ) {
    throw new Error(
      'Invalid estate date'
    )
  }

  const lastDay =
    new Date(
      Date.UTC(
        year,
        month,
        0
      )
    )
      .getUTCDate()

  return {
    from:
      `${yearText}-${monthText}-01`,

    to:
      `${yearText}-${monthText}-${String(
        lastDay
      ).padStart(
        2,
        '0'
      )}`,
  }
}

export async function loadAdminDashboardFinancials(
  db: ServerClient,
  today: string
) {
  const period =
    monthBounds(
      today
    )

  const [
    monthResult,
    allTimeResult,
    housesResult,
  ] =
    await Promise.all(
      [
        db.rpc(
          'admin_dashboard_summary',
          {
            p_from:
              period.from,

            p_to:
              period.to,
          }
        ),

        db.rpc(
          'admin_dashboard_summary',
          {
            p_from:
              null,

            p_to:
              null,
          }
        ),

        db.rpc(
          'admin_house_balances'
        ),
      ]
    )

  if (
    monthResult.error
  ) {
    throw new Error(
      monthResult.error
        .message
    )
  }

  if (
    allTimeResult.error
  ) {
    throw new Error(
      allTimeResult.error
        .message
    )
  }

  if (
    housesResult.error
  ) {
    throw new Error(
      housesResult.error
        .message
    )
  }

  return {
    month:
      summary(
        monthResult.data
      ),

    allTime:
      summary(
        allTimeResult.data
      ),

    houses:
      houses(
        housesResult.data
      ),
  }
}