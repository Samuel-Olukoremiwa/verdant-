'use client'

import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import {
  DateField,
} from '@/components/date-field'

import {
  formatDateTimeGb,
} from '@/lib/date-format'

import {
  periodRange,
} from '@/lib/report-format'

type Charge = {
  id:
    string

  name:
    string

  description:
    string | null

  amount:
    number | string

  active:
    boolean

  sort_order:
    number
}

type Payment = {
  id:
    string

  payment_code:
    string

  gate_charge_type_id:
    string

  charge_name:
    string

  amount:
    number | string

  payer_name:
    string

  payer_email:
    string

  payer_phone:
    string

  company_name:
    string | null

  vehicle_plate:
    string | null

  host_reference:
    string | null

  purpose_note:
    string | null

  status:
    string

  paid_at:
    string | null

  admitted_at:
    string | null

  created_at:
    string
}

type ResponseData = {
  payments:
    Payment[]

  charges:
    Charge[]

  totalCount:
    number

  successfulCount:
    number

  awaitingAdmissionCount:
    number

  admittedCount:
    number

  totalRevenue:
    number

  page:
    number

  pageSize:
    number

  error?:
    string
}

type Filters = {
  from:
    string

  to:
    string

  status:
    string

  chargeTypeId:
    string

  payer:
    string

  paymentCode:
    string
}

type ChargeForm = {
  name:
    string

  description:
    string

  amount:
    string

  sortOrder:
    string

  active:
    boolean
}

const initialRange =
  periodRange(
    'month'
  )

function blankCharge():
  ChargeForm {
  return {
    name:
      '',

    description:
      '',

    amount:
      '',

    sortOrder:
      '0',

    active:
      true,
  }
}

function naira(
  value:
    number | string
) {
  return `₦${Number(
    value
  ).toLocaleString(
    'en-NG',
    {
      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    }
  )}`
}

function dateTime(
  value:
    string | null
) {
  if (!value) {
    return '—'
  }

  return `${formatDateTimeGb(
    value
  )} WAT`
}

function statusLabel(
  value:
    string
) {
  switch (
    value
  ) {
    case 'success':
      return 'Paid'

    case 'failed':
      return 'Failed'

    case 'abandoned':
      return 'Abandoned'

    default:
      return 'Pending'
  }
}

export function GateRevenueManager() {
  const [
    filters,
    setFilters,
  ] =
    useState<Filters>({
      from:
        initialRange.from,

      to:
        initialRange.to,

      status:
        'all',

      chargeTypeId:
        '',

      payer:
        '',

      paymentCode:
        '',
    })

  const [
    applied,
    setApplied,
  ] =
    useState<Filters>(
      filters
    )

  const [
    page,
    setPage,
  ] =
    useState(
      1
    )

  const [
    data,
    setData,
  ] =
    useState<ResponseData | null>(
      null
    )

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    )

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null
    )

  const [
    editingId,
    setEditingId,
  ] =
    useState<
      string | null
    >(
      null
    )

  const [
    chargeForm,
    setChargeForm,
  ] =
    useState<ChargeForm>(
      blankCharge
    )

  const [
    savingCharge,
    setSavingCharge,
  ] =
    useState(
      false
    )

  const [
    exportingPdf,
    setExportingPdf,
  ] =
    useState(
      false
    )

  const load =
    useCallback(
      async (
        signal?:
          AbortSignal
      ) => {
        setLoading(
          true
        )

        setError(
          null
        )

        const params =
          new URLSearchParams({
            ...applied,

            page:
              String(
                page
              ),
          })

        try {
          const response =
            await fetch(
              `/api/admin/gate-revenue?${params}`,
              {
                signal,

                cache:
                  'no-store',
              }
            )

          const result =
            await response.json() as ResponseData

          if (
            !response.ok ||
            result.error
          ) {
            throw new Error(
              result.error ||
                'Gate revenue could not be loaded'
            )
          }

          setData(
            result
          )
        } catch (
          caught
        ) {
          if (
            caught instanceof
              DOMException &&
            caught.name ===
              'AbortError'
          ) {
            return
          }

          setError(
            caught instanceof
              Error
              ? caught.message
              : 'Gate revenue could not be loaded'
          )
        } finally {
          setLoading(
            false
          )
        }
      },
      [
        applied,
        page,
      ]
    )

  useEffect(
    () => {
      const controller =
        new AbortController()

      const timer =
        window.setTimeout(
          () => {
            void load(
              controller.signal
            )
          },
          0
        )

      return () => {
        window.clearTimeout(
          timer
        )

        controller.abort()
      }
    },
    [
      load,
    ]
  )

  const charges =
    data?.charges ??
    []

  const payments =
    data?.payments ??
    []

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        (
          data?.totalCount ??
          0
        ) /
          (
            data?.pageSize ??
            50
          )
      )
    )

  function updateFilter(
    key:
      keyof Filters,

    value:
      string
  ) {
    setFilters(
      (
        previous
      ) => ({
        ...previous,

        [key]:
          value,
      })
    )
  }

  function applyFilters(
    event:
      React.FormEvent
  ) {
    event.preventDefault()

    if (
      !filters.from ||
      !filters.to ||
      filters.from >
        filters.to
    ) {
      setError(
        'Choose a valid date range'
      )

      return
    }

    setPage(
      1
    )

    setApplied({
      ...filters,
    })
  }

  function editCharge(
    charge:
      Charge
  ) {
    setEditingId(
      charge.id
    )

    setChargeForm({
      name:
        charge.name,

      description:
        charge.description ??
        '',

      amount:
        String(
          charge.amount
        ),

      sortOrder:
        String(
          charge.sort_order
        ),

      active:
        charge.active,
    })

    window.scrollTo({
      top:
        0,

      behavior:
        'smooth',
    })
  }

  function cancelEdit() {
    setEditingId(
      null
    )

    setChargeForm(
      blankCharge()
    )
  }

  async function saveCharge(
    event:
      React.FormEvent
  ) {
    event.preventDefault()

    if (
      savingCharge
    ) {
      return
    }

    setSavingCharge(
      true
    )

    setError(
      null
    )

    try {
      const response =
        await fetch(
          '/api/admin/gate-revenue',
          {
            method:
              editingId
                ? 'PATCH'
                : 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                ...(editingId
                  ? {
                      id:
                        editingId,
                    }
                  : {}),

                name:
                  chargeForm.name,

                description:
                  chargeForm.description,

                amount:
                  Number(
                    chargeForm.amount
                  ),

                sortOrder:
                  Number(
                    chargeForm.sortOrder
                  ),

                active:
                  chargeForm.active,
              }),
          }
        )

      const result =
        await response.json()

      if (
        !response.ok
      ) {
        throw new Error(
          result.error ||
            'Gate charge could not be saved'
        )
      }

      cancelEdit()

      await load()
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : 'Gate charge could not be saved'
      )
    } finally {
      setSavingCharge(
        false
      )
    }
  }

  function csvUrl() {
    const params =
      new URLSearchParams({
        type:
          'gate-revenue',

        from:
          applied.from,

        to:
          applied.to,

        mode:
          'export',

        format:
          'csv',
      })

    return `/api/admin/reports?${params}`
  }

  function exportCsv() {
    const link =
      document.createElement(
        'a'
      )

    link.href =
      csvUrl()

    document.body.appendChild(
      link
    )

    link.click()
    link.remove()
  }

  async function exportPdf() {
    setExportingPdf(
      true
    )

    setError(
      null
    )

    try {
      const params =
        new URLSearchParams({
          type:
            'gate-revenue',

          from:
            applied.from,

          to:
            applied.to,

          mode:
            'export',

          format:
            'json',
        })

      const response =
        await fetch(
          `/api/admin/reports?${params}`
        )

      const result =
        await response.json()

      if (
        !response.ok ||
        result.error
      ) {
        throw new Error(
          result.error ||
            'PDF export failed'
        )
      }

      const {
        createReportPdf,
      } =
        await import(
          '@/lib/report-pdf'
        )

      const pdf =
        await createReportPdf(
          'gate-revenue',
          result.rows ??
            [],
          applied.from,
          applied.to
        )

      pdf.save(
        `gate-revenue-${applied.from}-to-${applied.to}.pdf`
      )
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : 'PDF export failed'
      )
    } finally {
      setExportingPdf(
        false
      )
    }
  }

  return (
    <div className="space-y-6">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">
              Configuration
            </span>

            <h2>
              {editingId
                ? 'Edit gate charge'
                : 'Add gate charge'}
            </h2>
          </div>

          {editingId && (
            <button
              type="button"
              className="action secondary"
              onClick={
                cancelEdit
              }
            >
              Cancel edit
            </button>
          )}
        </div>

        <div className="panel-body">
          <form
            onSubmit={
              saveCharge
            }
            className="grid gap-4 md:grid-cols-2"
          >
            <div>
              <label className="block text-sm font-semibold mb-1">
                Charge name *
              </label>

              <input
                required
                maxLength={120}
                className="w-full border rounded-lg p-3"
                placeholder="e.g. Contractor Entry"
                value={
                  chargeForm.name
                }
                onChange={
                  (
                    event
                  ) =>
                    setChargeForm(
                      (
                        previous
                      ) => ({
                        ...previous,

                        name:
                          event.target.value,
                      })
                    )
                }
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">
                Amount (₦) *
              </label>

              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                className="w-full border rounded-lg p-3"
                value={
                  chargeForm.amount
                }
                onChange={
                  (
                    event
                  ) =>
                    setChargeForm(
                      (
                        previous
                      ) => ({
                        ...previous,

                        amount:
                          event.target.value,
                      })
                    )
                }
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold mb-1">
                Description
              </label>

              <textarea
                rows={3}
                maxLength={500}
                className="w-full border rounded-lg p-3"
                value={
                  chargeForm.description
                }
                onChange={
                  (
                    event
                  ) =>
                    setChargeForm(
                      (
                        previous
                      ) => ({
                        ...previous,

                        description:
                          event.target.value,
                      })
                    )
                }
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">
                Display order
              </label>

              <input
                type="number"
                min="0"
                step="1"
                className="w-full border rounded-lg p-3"
                value={
                  chargeForm.sortOrder
                }
                onChange={
                  (
                    event
                  ) =>
                    setChargeForm(
                      (
                        previous
                      ) => ({
                        ...previous,

                        sortOrder:
                          event.target.value,
                      })
                    )
                }
              />
            </div>

            <label className="flex items-center gap-3 self-end rounded-lg border p-3">
              <input
                type="checkbox"
                checked={
                  chargeForm.active
                }
                onChange={
                  (
                    event
                  ) =>
                    setChargeForm(
                      (
                        previous
                      ) => ({
                        ...previous,

                        active:
                          event.target.checked,
                      })
                    )
                }
              />

              Active on public
              gate payment page
            </label>

            <div className="md:col-span-2">
              <button
                className="action"
                disabled={
                  savingCharge
                }
              >
                {savingCharge
                  ? 'Saving…'
                  : editingId
                    ? 'Save changes'
                    : 'Add gate charge'}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>
            Gate charge types
          </h2>

          <span className="pill">
            {
              charges.length
            }{' '}
            configured
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="p-3 text-left">
                  Charge
                </th>

                <th className="p-3 text-right">
                  Amount
                </th>

                <th className="p-3 text-left">
                  Status
                </th>

                <th className="p-3 text-left">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {charges.map(
                (
                  charge
                ) => (
                  <tr
                    key={
                      charge.id
                    }
                    className="border-t"
                  >
                    <td className="p-3">
                      <strong>
                        {
                          charge.name
                        }
                      </strong>

                      {charge.description && (
                        <small className="block mt-1 text-gray-500">
                          {
                            charge.description
                          }
                        </small>
                      )}
                    </td>

                    <td className="p-3 text-right">
                      {naira(
                        charge.amount
                      )}
                    </td>

                    <td className="p-3">
                      <span className="pill">
                        {charge.active
                          ? 'Active'
                          : 'Inactive'}
                      </span>
                    </td>

                    <td className="p-3">
                      <button
                        type="button"
                        className="action secondary"
                        onClick={
                          () =>
                            editCharge(
                              charge
                            )
                        }
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              )}

              {!charges.length && (
                <tr>
                  <td
                    colSpan={4}
                    className="p-6 text-center text-gray-500"
                  >
                    No gate charges
                    configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="panel p-5">
          <span className="eyebrow">
            Gate revenue
          </span>

          <strong className="block text-2xl mt-2">
            {naira(
              data?.totalRevenue ??
              0
            )}
          </strong>

          <small>
            Successful payments
            in selected period
          </small>
        </div>

        <div className="panel p-5">
          <span className="eyebrow">
            Paid entries
          </span>

          <strong className="block text-2xl mt-2">
            {
              data?.successfulCount ??
              0
            }
          </strong>

          <small>
            Successful gate
            payments
          </small>
        </div>

        <div className="panel p-5">
          <span className="eyebrow">
            Awaiting gate
          </span>

          <strong className="block text-2xl mt-2">
            {
              data?.awaitingAdmissionCount ??
              0
            }
          </strong>

          <small>
            Paid but not yet
            admitted
          </small>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">
              Transactions
            </span>

            <h2>
              Gate payment history
            </h2>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className="action"
              disabled={
                exportingPdf
              }
              onClick={
                exportPdf
              }
            >
              {exportingPdf
                ? 'Preparing PDF…'
                : 'Export PDF'}
            </button>

            <button
              type="button"
              className="action secondary"
              onClick={
                exportCsv
              }
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="panel-body">
          <form
            onSubmit={
              applyFilters
            }
            className="grid gap-4 md:grid-cols-3"
          >
            <div>
              <label className="block text-sm font-semibold mb-1">
                From
              </label>

              <DateField
                className="w-full border rounded-lg p-3"
                value={
                  filters.from
                }
                onChange={
                  (
                    event
                  ) =>
                    updateFilter(
                      'from',
                      event.target.value
                    )
                }
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">
                To
              </label>

              <DateField
                className="w-full border rounded-lg p-3"
                value={
                  filters.to
                }
                onChange={
                  (
                    event
                  ) =>
                    updateFilter(
                      'to',
                      event.target.value
                    )
                }
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">
                Status
              </label>

              <select
                className="w-full border rounded-lg p-3"
                value={
                  filters.status
                }
                onChange={
                  (
                    event
                  ) =>
                    updateFilter(
                      'status',
                      event.target.value
                    )
                }
              >
                <option value="all">
                  All statuses
                </option>

                <option value="success">
                  Paid
                </option>

                <option value="pending">
                  Pending
                </option>

                <option value="failed">
                  Failed
                </option>

                <option value="abandoned">
                  Abandoned
                </option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">
                Charge type
              </label>

              <select
                className="w-full border rounded-lg p-3"
                value={
                  filters.chargeTypeId
                }
                onChange={
                  (
                    event
                  ) =>
                    updateFilter(
                      'chargeTypeId',
                      event.target.value
                    )
                }
              >
                <option value="">
                  All charges
                </option>

                {charges.map(
                  (
                    charge
                  ) => (
                    <option
                      value={
                        charge.id
                      }
                      key={
                        charge.id
                      }
                    >
                      {
                        charge.name
                      }
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">
                Payer
              </label>

              <input
                className="w-full border rounded-lg p-3"
                value={
                  filters.payer
                }
                onChange={
                  (
                    event
                  ) =>
                    updateFilter(
                      'payer',
                      event.target.value
                    )
                }
                placeholder="Search payer name"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">
                Payment ID
              </label>

              <input
                className="w-full border rounded-lg p-3 uppercase font-mono"
                value={
                  filters.paymentCode
                }
                onChange={
                  (
                    event
                  ) =>
                    updateFilter(
                      'paymentCode',
                      event.target.value.toUpperCase()
                    )
                }
                placeholder="GATE-202610-000001"
              />
            </div>

            <div className="md:col-span-3">
              <button
                type="submit"
                className="action"
              >
                Apply filters
              </button>
            </div>
          </form>
        </div>

        {error && (
          <p
            role="alert"
            className="px-5 pb-4 text-red-700"
          >
            {error}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="p-3 text-left">
                  Payment ID
                </th>

                <th className="p-3 text-left">
                  Payer
                </th>

                <th className="p-3 text-left">
                  Charge
                </th>

                <th className="p-3 text-left">
                  House / vehicle
                </th>

                <th className="p-3 text-right">
                  Amount
                </th>

                <th className="p-3 text-left">
                  Status
                </th>

                <th className="p-3 text-left">
                  Paid
                </th>

                <th className="p-3 text-left">
                  Admission
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="p-8 text-center"
                  >
                    Loading gate
                    revenue…
                  </td>
                </tr>
              ) : payments.length ? (
                payments.map(
                  (
                    payment
                  ) => (
                    <tr
                      key={
                        payment.id
                      }
                      className="border-t align-top"
                    >
                      <td className="p-3 font-mono whitespace-nowrap">
                        {
                          payment.payment_code
                        }
                      </td>

                      <td className="p-3">
                        <strong>
                          {
                            payment.payer_name
                          }
                        </strong>

                        <small className="block text-gray-500">
                          {
                            payment.payer_phone
                          }
                        </small>

                        {payment.company_name && (
                          <small className="block text-gray-500">
                            {
                              payment.company_name
                            }
                          </small>
                        )}
                      </td>

                      <td className="p-3">
                        {
                          payment.charge_name
                        }
                      </td>

                      <td className="p-3">
                        {payment.host_reference ||
                          payment.vehicle_plate ||
                          '—'}

                        {payment.host_reference &&
                          payment.vehicle_plate && (
                            <small className="block text-gray-500">
                              {
                                payment.vehicle_plate
                              }
                            </small>
                          )}
                      </td>

                      <td className="p-3 text-right whitespace-nowrap">
                        {naira(
                          payment.amount
                        )}
                      </td>

                      <td className="p-3">
                        <span className="pill">
                          {statusLabel(
                            payment.status
                          )}
                        </span>
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        {dateTime(
                          payment.paid_at
                        )}
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        {payment.admitted_at
                          ? `Admitted · ${dateTime(
                              payment.admitted_at
                            )}`
                          : payment.status ===
                              'success'
                            ? 'Awaiting entry'
                            : '—'}
                      </td>
                    </tr>
                  )
                )
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="p-8 text-center text-gray-500"
                  >
                    No gate payments
                    match these
                    filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="panel-body flex items-center justify-between gap-3">
          <span className="text-sm text-gray-600">
            {data?.totalCount ??
              0}{' '}
            transaction(s)
          </span>

          <div className="flex gap-2">
            <button
              type="button"
              className="action secondary"
              disabled={
                page <=
                1
              }
              onClick={
                () =>
                  setPage(
                    (
                      current
                    ) =>
                      Math.max(
                        1,
                        current -
                          1
                      )
                  )
              }
            >
              Previous
            </button>

            <span className="p-2 text-sm">
              Page {page} of{' '}
              {
                totalPages
              }
            </span>

            <button
              type="button"
              className="action secondary"
              disabled={
                page >=
                totalPages
              }
              onClick={
                () =>
                  setPage(
                    (
                      current
                    ) =>
                      current +
                      1
                  )
              }
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}