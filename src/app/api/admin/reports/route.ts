import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  estateDate,
} from '@/lib/dashboard'

import {
  reportCsv,
  type ReportRow,
  type ReportType,
} from '@/lib/report-format'

import {
  createClient,
} from '@/lib/supabase/server'

const REPORT_TYPES:
  ReportType[] = [
    'due',
    'collected',
    'overdue',
    'future',
    'expenses',
    'income-statement',
  ]

const PREVIEW_PAGE_SIZE =
  50

const EXPORT_BATCH_SIZE =
  500

function validDate(
  value: string
) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(
      value
    ) &&
    Number.isFinite(
      Date.parse(
        value
      )
    ) &&
    new Date(
      value
    )
      .toISOString()
      .slice(
        0,
        10
      ) ===
      value
  )
}

type RpcResult = {
  rows?: unknown

  total?: unknown

  total_amount?: unknown
}

function parseResult(
  value: unknown
) {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    throw new Error(
      'Invalid report response'
    )
  }

  const raw =
    value as RpcResult

  const rows =
    Array.isArray(
      raw.rows
    )
      ? raw.rows as
          ReportRow[]
      : []

  const total =
    Number(
      raw.total ??
        0
    )

  const totalAmount =
    Number(
      raw.total_amount ??
        0
    )

  if (
    !Number.isInteger(
      total
    ) ||
    total < 0 ||
    !Number.isFinite(
      totalAmount
    )
  ) {
    throw new Error(
      'Invalid report totals'
    )
  }

  return {
    rows,

    total,

    totalAmount,
  }
}

export async function GET(
  req: NextRequest
) {
  const supabase =
    await createClient()

  const {
    data: {
      user,
    },
  } =
    await supabase
      .auth
      .getUser()

  if (!user) {
    return NextResponse.json(
      {
        error:
          'Not signed in',
      },
      {
        status:
          401,
      }
    )
  }

  const {
    data:
      admin,
  } =
    await supabase
      .from(
        'admins'
      )
      .select(
        'role'
      )
      .eq(
        'auth_user_id',
        user.id
      )
      .maybeSingle()

  if (
    !admin ||
    ![
      'admin',
      'super_admin',
    ].includes(
      admin.role
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Not authorized',
      },
      {
        status:
          403,
      }
    )
  }

  const type =
    (
      req.nextUrl
        .searchParams
        .get(
          'type'
        ) ??
      'due'
    ) as ReportType

  const from =
    req.nextUrl
      .searchParams
      .get(
        'from'
      )

  const to =
    req.nextUrl
      .searchParams
      .get(
        'to'
      )

  const mode =
    req.nextUrl
      .searchParams
      .get(
        'mode'
      ) ??
    'preview'

  const format =
    req.nextUrl
      .searchParams
      .get(
        'format'
      ) ??
    'json'

  const rawPage =
    Number(
      req.nextUrl
        .searchParams
        .get(
          'page'
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

  if (
    !REPORT_TYPES.includes(
      type
    ) ||
    !from ||
    !to ||
    !validDate(
      from
    ) ||
    !validDate(
      to
    ) ||
    from > to ||
    ![
      'preview',
      'export',
    ].includes(
      mode
    ) ||
    ![
      'json',
      'csv',
    ].includes(
      format
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Choose a valid report and date range',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    Date.parse(
      to
    ) -
      Date.parse(
        from
      ) >
    3660 *
      86400000
  ) {
    return NextResponse.json(
      {
        error:
          'Choose a date range of ten years or less',
      },
      {
        status:
          400,
      }
    )
  }

  const today =
    estateDate()

  async function loadPage(
    limit: number,
    offset: number
  ) {
    if (
      type ===
      'collected'
    ) {
      const {
        data,
        error,
      } =
        await supabase.rpc(
          'admin_collected_payments_page',
          {
            p_from:
              from,

            p_to:
              to,

            p_limit:
              limit,

            p_offset:
              offset,
          }
        )

      if (error) {
        throw new Error(
          error.message
        )
      }

      return parseResult(
        data
      )
    }

    const {
      data,
      error,
    } =
      await supabase.rpc(
        'admin_report_page',
        {
          p_type:
            type,

          p_from:
            from,

          p_to:
            to,

          p_today:
            today,

          p_limit:
            limit,

          p_offset:
            offset,
        }
      )

    if (error) {
      throw new Error(
        error.message
      )
    }

    return parseResult(
      data
    )
  }

  try {
    if (
      mode ===
      'preview'
    ) {
      const result =
        await loadPage(
          PREVIEW_PAGE_SIZE,
          (
            page -
            1
          ) *
            PREVIEW_PAGE_SIZE
        )

      return NextResponse.json(
        {
          ...result,

          page,

          pageSize:
            PREVIEW_PAGE_SIZE,
        },
        {
          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      )
    }

    const rows:
      ReportRow[] =
      []

    let offset =
      0

    let total =
      0

    let totalAmount =
      0

    do {
      const batch =
        await loadPage(
          EXPORT_BATCH_SIZE,
          offset
        )

      if (
        offset ===
        0
      ) {
        total =
          batch.total

        totalAmount =
          batch.totalAmount
      }

      rows.push(
        ...batch.rows
      )

      if (
        batch.rows.length ===
        0
      ) {
        break
      }

      offset +=
        batch.rows.length
    } while (
      offset <
      total
    )

    if (
      format ===
      'csv'
    ) {
      const csv =
        reportCsv(
          type,
          rows,
          from,
          to
        )

      const filename =
        `${type}-report-${from}-to-${to}.csv`

      return new Response(
        csv,
        {
          status:
            200,

          headers: {
            'Content-Type':
              'text/csv; charset=utf-8',

            'Content-Disposition':
              `attachment; filename="${filename}"`,

            'Cache-Control':
              'no-store',
          },
        }
      )
    }

    return NextResponse.json(
      {
        rows,

        total,

        totalAmount,
      },
      {
        headers: {
          'Cache-Control':
            'no-store',
        },
      }
    )
  } catch {
    return NextResponse.json(
      {
        error:
          'The report could not be loaded. Please try again.',
      },
      {
        status:
          500,
      }
    )
  }
}