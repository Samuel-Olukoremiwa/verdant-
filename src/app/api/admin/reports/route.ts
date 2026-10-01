import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  estateDate,
} from '@/lib/dashboard'

import {
  reportCsvHeader,
  reportCsvRows,
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

const PDF_EXPORT_MAX_ROWS =
  5000

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

    /*
     * Load the first export batch before creating a response.
     *
     * This gives us:
     *
     *   - the total row count
     *   - report totals
     *   - a chance to return a normal JSON error if the first
     *     database request fails
     *
     * CSV batches after this point are streamed directly to the
     * response and are never accumulated into one large array.
     */
    const firstBatch =
      await loadPage(
        EXPORT_BATCH_SIZE,
        0
      )

    if (
      format ===
      'csv'
    ) {
      const encoder =
        new TextEncoder()

      const stream =
        new ReadableStream<
          Uint8Array
        >({
          async start(
            controller
          ) {
            try {
              controller.enqueue(
                encoder.encode(
                  reportCsvHeader(
                    type,
                    from,
                    to
                  )
                )
              )

              let batch =
                firstBatch

              let offset =
                0

              while (
                true
              ) {
                if (
                  batch.rows
                    .length >
                  0
                ) {
                  controller.enqueue(
                    encoder.encode(
                      '\r\n' +
                        reportCsvRows(
                          type,
                          batch.rows
                        )
                    )
                  )
                }

                offset +=
                  batch.rows
                    .length

                if (
                  batch.rows
                    .length ===
                    0 ||
                  offset >=
                    batch.total
                ) {
                  break
                }

                batch =
                  await loadPage(
                    EXPORT_BATCH_SIZE,
                    offset
                  )
              }

              controller.close()
            } catch (
              error
            ) {
              controller.error(
                error
              )
            }
          },
        })

      const filename =
        `${type}-report-${from}-to-${to}.csv`

      return new Response(
        stream,
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

    /*
     * PDFs are generated in the browser using jsPDF.
     *
     * Very large tables produce impractically large PDFs and
     * require the complete JSON dataset to be held in browser
     * memory. Keep PDF useful for normal operational reports
     * and direct very large exports to streaming CSV instead.
     */
    if (
      firstBatch.total >
      PDF_EXPORT_MAX_ROWS
    ) {
      return NextResponse.json(
        {
          error:
            `This PDF contains ${firstBatch.total.toLocaleString(
              'en-NG'
            )} rows. PDF export supports up to ${PDF_EXPORT_MAX_ROWS.toLocaleString(
              'en-NG'
            )} rows. Use CSV for larger reports.`,

          total:
            firstBatch.total,

          maxPdfRows:
            PDF_EXPORT_MAX_ROWS,
        },
        {
          status:
            413,

          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      )
    }

    const rows:
      ReportRow[] = [
        ...firstBatch.rows,
      ]

    let offset =
      firstBatch.rows
        .length

    while (
      offset <
      firstBatch.total
    ) {
      const batch =
        await loadPage(
          EXPORT_BATCH_SIZE,
          offset
        )

      if (
        batch.rows
          .length ===
        0
      ) {
        break
      }

      rows.push(
        ...batch.rows
      )

      offset +=
        batch.rows
          .length
    }

    return NextResponse.json(
      {
        rows,

        total:
          firstBatch.total,

        totalAmount:
          firstBatch.totalAmount,
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