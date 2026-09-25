'use client'

import { formatDateGb } from '@/lib/date-format'

import { DateField } from '@/components/date-field'

import {
  useEffect,
  useState,
} from 'react'

import {
  REPORT_LABELS,
  periodRange,
  reportCsv,
  type ReportType,
  type ReportRow as Row,
  type PeriodPreset,
} from '@/lib/report-format'

const naira = (
  n: number
) =>
  `₦${n.toLocaleString()}`

export default function ReportsPage() {
  const [
    type,
    setType,
  ] =
    useState<ReportType>(
      'due'
    )

  const [
    { from, to },
    setRange,
  ] = useState(() =>
    periodRange('month')
  )

  const [
    period,
    setPeriod,
  ] =
    useState<PeriodPreset>(
      'month'
    )

  const [
    exporting,
    setExporting,
  ] = useState(false)

  const [
    rows,
    setRows,
  ] =
    useState<Row[]>([])

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null)

  useEffect(() => {
    let active = true

    const controller =
      new AbortController()

    if (
      !from ||
      !to ||
      from > to
    ) {
      return
    }

    const params =
      new URLSearchParams({
        type,
        from,
        to,
      })

    fetch(
      `/api/admin/reports?${params}`,
      {
        signal:
          controller.signal,
      }
    )
      .then(
        async (
          response
        ) => {
          const data =
            await response.json()

          if (
            !response.ok ||
            data.error
          ) {
            throw new Error(
              data.error ||
                'Failed to load report'
            )
          }

          return data
        }
      )
      .then((data) => {
        if (active) {
          setRows(
            data.rows ?? []
          )
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load report'
          )
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [
    type,
    from,
    to,
  ])

  function changeFilters(
    next: {
      type?: ReportType
      from?: string
      to?: string
    }
  ) {
    const nextFrom =
      next.from ?? from

    const nextTo =
      next.to ?? to

    if (
      (
        !next.type ||
        next.type === type
      ) &&
      nextFrom === from &&
      nextTo === to
    ) {
      return
    }

    if (
      !nextFrom ||
      !nextTo ||
      nextFrom > nextTo
    ) {
      setRange({
        from: nextFrom,
        to: nextTo,
      })

      setRows([])

      setError(
        'Choose a valid date range'
      )

      setLoading(false)

      return
    }

    setLoading(true)
    setError(null)
    setRows([])

    if (next.type) {
      setType(next.type)
    }

    setRange(
      (current) => ({
        from:
          next.from ??
          current.from,

        to:
          next.to ??
          current.to,
      })
    )
  }

  function exportCsv() {
    const csv =
      reportCsv(
        type,
        rows,
        from,
        to
      )

    const blob =
      new Blob(
        [csv],
        {
          type:
            'text/csv;charset=utf-8;',
        }
      )

    const url =
      URL.createObjectURL(
        blob
      )

    const a =
      document.createElement(
        'a'
      )

    a.href = url

    a.download =
      `${type}-report-${from}-to-${to}.csv`

    a.click()

    URL.revokeObjectURL(
      url
    )
  }

  async function exportPdf() {
    setExporting(true)
    setError(null)

    try {
      const {
        createReportPdf,
      } =
        await import(
          '@/lib/report-pdf'
        )

      const pdf =
        await createReportPdf(
          type,
          rows,
          from,
          to
        )

      pdf.save(
        `${type}-report-${from}-to-${to}.pdf`
      )
    } catch {
      setError(
        'PDF export failed. Please try again.'
      )
    } finally {
      setExporting(false)
    }
  }

  const amountKey =
    type ===
      'collected' ||
    type ===
      'expenses'
      ? 'amount'
      : 'outstanding'

  const total =
    rows.reduce(
      (
        sum,
        row
      ) =>
        sum +
        Number(
          row[
            amountKey
          ] ?? 0
        ),

      0
    )

  return (
    <div className="page-wrap">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">
            Dues &amp;
            billing
          </span>

          <h1 className="page-title">
            Reports
          </h1>

          <p className="page-lead">
            Income statements,
            dues and expenses,
            filtered by date and
            available as CSV or
            PDF.
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            onClick={
              exportPdf
            }
            disabled={
              loading ||
              exporting ||
              rows.length ===
                0
            }
            className="action"
          >
            {exporting
              ? 'Preparing PDF…'
              : 'Export PDF'}
          </button>

          <button
            type="button"
            onClick={
              exportCsv
            }
            disabled={
              loading ||
              rows.length ===
                0
            }
            className="action secondary"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div
        className="panel"
        style={{
          marginBottom:
            '1.5rem',

          padding:
            '1.25rem',
        }}
      >
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">
              Report
            </label>

            <select
              className="border rounded-lg px-3 py-2"
              aria-label="Report type"
              value={type}
              onChange={(
                event
              ) =>
                changeFilters({
                  type:
                    event
                      .target
                      .value as ReportType,
                })
              }
            >
              <option value="income-statement">
                Income
                Statement
              </option>

              <option value="due">
                Due Bills
              </option>

              <option value="collected">
                Collected
              </option>

              <option value="overdue">
                Overdue
              </option>

              <option value="future">
                Bills Expected
                in Future
              </option>

              <option value="expenses">
                Expenses
              </option>
            </select>
          </div>

          <label>
            Period

            <select
              aria-label="Report period"
              className="block border rounded-lg px-3 py-2"
              value={
                period
              }
              onChange={(
                event
              ) => {
                const preset =
                  event.target
                    .value as PeriodPreset

                setPeriod(
                  preset
                )

                if (
                  preset !==
                  'custom'
                ) {
                  changeFilters(
                    periodRange(
                      preset
                    )
                  )
                }
              }}
            >
              <option value="month">
                This month
              </option>

              <option value="last-month">
                Last month
              </option>

              <option value="quarter">
                This quarter
              </option>

              <option value="year">
                This year
              </option>

              <option value="next-month">
                Next month
              </option>

              <option value="next-quarter">
                Next 3 months
              </option>

              <option value="custom">
                Custom date
                range
              </option>
            </select>
          </label>

          <div>
            <label className="block text-sm font-medium mb-1">
              From
            </label>

            <DateField
disabled={
                period !==
                'custom'
              }
              className="border rounded-lg px-3 py-2"
              aria-label="Report from date"
              value={from}
              onChange={(
                event
              ) =>
                changeFilters({
                  from:
                    event
                      .target
                      .value,
                })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              To
            </label>

            <DateField
disabled={
                period !==
                'custom'
              }
              className="border rounded-lg px-3 py-2"
              aria-label="Report to date"
              value={to}
              onChange={(
                event
              ) =>
                changeFilters({
                  to:
                    event
                      .target
                      .value,
                })
              }
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="text-red-600 mb-4">
          {error}
        </p>
      )}

      {type ===
      'income-statement' ? (
        <section
          className="panel"
          aria-label="Income statement"
        >
          <div className="panel-head">
            <h2>
              Income Statement
              {' · '}
              {formatDateGb(from)}
              {' to '}
              {formatDateGb(to)}
            </h2>
          </div>

          <p className="p-4 text-sm text-gray-500">
            Cash basis:
            successful dues
            payments received
            during this period
            (WAT), less expenses
            recorded for these
            dates. Street
            assignments reflect
            current house
            records.
          </p>

          {loading ? (
            <p
              role="status"
              className="p-6"
            >
              Loading
              statement…
            </p>
          ) : (
            !error && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="p-3 text-left"
                      >
                        Income /
                        Expense
                      </th>

                      <th
                        scope="col"
                        className="p-3 text-right"
                      >
                        Amount
                        (NGN)
                      </th>

                      <th
                        scope="col"
                        className="p-3 text-right"
                      >
                        Total
                        (NGN)
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map(
                      (
                        row,
                        index
                      ) => (
                        <tr
                          key={
                            index
                          }
                          className={`border-t ${
                            row.kind ===
                            'deficit'
                              ? 'text-red-700'
                              : ''
                          } ${
                            row.kind ===
                              'street' ||
                            row.kind ===
                              'expense'
                              ? ''
                              : 'font-bold'
                          }`}
                        >
                          <th
                            scope="row"
                            className={`p-3 text-left ${
                              row.kind ===
                              'street'
                                ? 'pl-8 font-normal'
                                : ''
                            }`}
                          >
                            {
                              row.label
                            }

                            {row.kind ===
                              'expense' && (
                              <span className="block text-xs font-normal text-gray-500">
                                {formatDateGb(String(row.date))}
                                {' · '}
                                {
                                  row.category
                                }
                              </span>
                            )}
                          </th>

                          <td className="p-3 text-right">
                            {row.detail ==
                            null
                              ? ''
                              : naira(
                                  Number(
                                    row.detail
                                  )
                                )}
                          </td>

                          <td className="p-3 text-right">
                            {row.total ==
                            null
                              ? ''
                              : naira(
                                  Number(
                                    row.total
                                  )
                                )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )
          )}
        </section>
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-2">
            {loading
              ? 'Loading...'
              : `${
                  REPORT_LABELS[
                    type
                  ]
                }: ${
                  rows.length
                } record${
                  rows.length ===
                  1
                    ? ''
                    : 's'
                } — ${naira(
                  total
                )} total`}
          </p>

          <div className="bg-white rounded-xl shadow border overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 text-gray-600">
                <tr>
                  <th className="p-3">
                    {type ===
                    'expenses'
                      ? 'Category'
                      : 'Target'}
                  </th>

                  <th className="p-3">
                    {type ===
                    'expenses'
                      ? 'Description'
                      : 'Charge'}
                  </th>

                  {type !==
                    'expenses' && (
                    <th className="p-3">
                      Period
                    </th>
                  )}

                  {type ===
                    'collected' ||
                  type ===
                    'expenses' ? (
                    <>
                      <th className="p-3">
                        {type ===
                        'expenses'
                          ? 'Date'
                          : 'Paid Date'}
                      </th>

                      {type ===
                        'collected' && (
                        <th className="p-3">
                          Reference
                        </th>
                      )}

                      <th className="p-3 text-right">
                        Amount
                      </th>
                    </>
                  ) : (
                    <>
                      <th className="p-3">
                        Due Date
                      </th>

                      <th className="p-3">
                        Status
                      </th>

                      <th className="p-3 text-right">
                        Outstanding
                      </th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody>
                {rows.length >
                0 ? (
                  rows.map(
                    (
                      row,
                      index
                    ) => (
                      <tr
                        key={
                          index
                        }
                        className="border-t"
                      >
                        <td className="p-3">
                          {
                            row.house
                          }
                        </td>

                        <td className="p-3">
                          {
                            row.charge
                          }
                        </td>

                        {type !==
                          'expenses' && (
                          <td className="p-3">
                            {
                              row.period
                            }
                          </td>
                        )}

                        {type ===
                          'collected' ||
                        type ===
                          'expenses' ? (
                          <>
                            <td className="p-3">
                              {row.date
                                ? new Date(
                                    row.date as string
                                  ).toLocaleDateString(
                                    'en-GB',
                                    {
                                      timeZone:
                                        'Africa/Lagos',
                                    }
                                  )
                                : '—'}
                            </td>

                            {type ===
                              'collected' && (
                              <td className="p-3 font-mono text-xs">
                                {
                                  row.reference
                                }
                              </td>
                            )}

                            <td className="p-3 text-right font-medium">
                              {naira(
                                Number(
                                  row.amount
                                )
                              )}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-3">
                              {row.dueDate
                                ? new Date(
                                    row.dueDate as string
                                  ).toLocaleDateString(
                                    'en-GB',
                                    {
                                      timeZone:
                                        'Africa/Lagos',
                                    }
                                  )
                                : '—'}
                            </td>

                            <td className="p-3">
                              <span
                                className={`px-2 py-1 rounded-full text-xs ${
                                  row.status ===
                                  'paid'
                                    ? 'bg-green-100 text-green-700'
                                    : row.status ===
                                        'partial'
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : row.status ===
                                          'projected'
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-red-100 text-red-700'
                                }`}
                                title={
                                  row.status ===
                                  'projected'
                                    ? 'Not yet a real invoice — shown for planning purposes'
                                    : undefined
                                }
                              >
                                {row.status ===
                                'projected'
                                  ? 'projected (not billed yet)'
                                  : row.status}
                              </span>
                            </td>

                            <td className="p-3 text-right font-medium">
                              {naira(
                                Number(
                                  row.outstanding
                                )
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  )
                ) : (
                  <tr>
                    <td
                      colSpan={
                        type ===
                        'expenses'
                          ? 4
                          : 6
                      }
                      className="p-6 text-center text-gray-500"
                    >
                      {loading
                        ? 'Loading...'
                        : 'No records match this report and date range.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}