'use client'

import {
  FormEvent,
  useState,
} from 'react'

import {
  usePathname,
  useRouter,
} from 'next/navigation'

import {
  isoToDdMmYyyy,
} from '@/lib/date-format'

import type {
  InvoiceDirectoryFilters,
  InvoiceDirectoryOptions,
  InvoiceDirectoryRow,
  InvoiceOutstandingFilter,
  InvoiceScope,
  InvoiceStatusFilter,
} from '@/lib/invoices-directory'

const naira = (
  amount: number
) =>
  `₦${amount.toLocaleString(
    'en-NG'
  )}`

export function InvoicesTable({
  invoices,
  total,
  totalBilled,
  totalOutstanding,
  page,
  pageSize,
  options,
  filters,
}: {
  invoices:
    InvoiceDirectoryRow[]

  total:
    number

  totalBilled:
    number

  totalOutstanding:
    number

  page:
    number

  pageSize:
    number

  options:
    InvoiceDirectoryOptions

  filters:
    InvoiceDirectoryFilters
}) {
  const router =
    useRouter()

  const pathname =
    usePathname()

  const [
    query,
    setQuery,
  ] =
    useState(
      filters.query
    )

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        total /
          pageSize
      )
    )

  const firstRow =
    total ===
    0
      ? 0
      : (
          page -
          1
        ) *
          pageSize +
        1

  const lastRow =
    Math.min(
      page *
        pageSize,
      total
    )

  function navigate(
    next: Partial<
      InvoiceDirectoryFilters
    >
  ) {
    const merged = {
      ...filters,
      ...next,
    }

    const params =
      new URLSearchParams()

    if (
      merged.query
    ) {
      params.set(
        'q',
        merged.query
      )
    }

    if (
      merged.target
    ) {
      params.set(
        'target',
        merged.target
      )
    }

    if (
      merged.scope !==
      'all'
    ) {
      params.set(
        'scope',
        merged.scope
      )
    }

    if (
      merged.charge
    ) {
      params.set(
        'charge',
        merged.charge
      )
    }

    if (
      merged.period
    ) {
      params.set(
        'period',
        merged.period
      )
    }

    if (
      merged.dueDate
    ) {
      params.set(
        'dueDate',
        merged.dueDate
      )
    }

    if (
      merged.status !==
      'all'
    ) {
      params.set(
        'status',
        merged.status
      )
    }

    if (
      merged.outstanding !==
      'all'
    ) {
      params.set(
        'outstanding',
        merged.outstanding
      )
    }

    if (
      merged.page >
      1
    ) {
      params.set(
        'page',
        String(
          merged.page
        )
      )
    }

    const suffix =
      params.toString()

    router.push(
      suffix
        ? `${pathname}?${suffix}`
        : pathname
    )
  }

  function submitSearch(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    navigate({
      query:
        query
          .trim()
          .slice(
            0,
            120
          ),

      page:
        1,
    })
  }

  return (
    <div>
      <form
        onSubmit={
          submitSearch
        }
        className="flex flex-col sm:flex-row gap-3 mb-4"
      >
        <input
          type="search"
          value={
            query
          }
          onChange={(
            event
          ) =>
            setQuery(
              event.target
                .value
            )
          }
          placeholder="Search by house, resident, due type, or period..."
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />

        <button
          type="submit"
          className="action secondary"
        >
          Search
        </button>

        <button
          type="button"
          className="action secondary"
          onClick={() => {
            setQuery(
              ''
            )

            router.push(
              pathname
            )
          }}
        >
          Clear filters
        </button>
      </form>

      <p className="text-xs text-gray-500 mb-2">
        {total ===
        0
          ? 'No invoices found'
          : `Showing ${firstRow}–${lastRow} of ${total} invoice${
              total ===
              1
                ? ''
                : 's'
            } — ${naira(
              totalOutstanding
            )} outstanding in this view`}
      </p>

      <div className="bg-white rounded-xl shadow overflow-x-auto border">
        <table className="w-full text-left">
          <thead className="bg-gray-100 text-sm text-gray-600">
            <tr>
              <th className="p-3">
                <label>
                  Target

                  <select
                    aria-label="Filter Target"
                    className="block border rounded p-1 mt-2 max-w-48"
                    value={
                      filters.target ??
                      ''
                    }
                    onChange={(
                      event
                    ) =>
                      navigate({
                        target:
                          event.target
                            .value ||
                          null,

                        page:
                          1,
                      })
                    }
                  >
                    <option value="">
                      All
                    </option>

                    {options.targets.map(
                      (
                        value
                      ) => (
                        <option
                          key={
                            value
                          }
                          value={
                            value
                          }
                        >
                          {
                            value
                          }
                        </option>
                      )
                    )}
                  </select>
                </label>
              </th>

              <th className="p-3">
                <label>
                  Scope

                  <select
                    aria-label="Filter Scope"
                    className="block border rounded p-1 mt-2"
                    value={
                      filters.scope
                    }
                    onChange={(
                      event
                    ) =>
                      navigate({
                        scope:
                          event.target
                            .value as InvoiceScope,

                        page:
                          1,
                      })
                    }
                  >
                    <option value="all">
                      All
                    </option>

                    <option value="house">
                      Household / Property
                    </option>

                    <option value="resident">
                      Individual Resident
                    </option>
                  </select>
                </label>
              </th>

              <th className="p-3">
                <label>
                  Charge

                  <select
                    aria-label="Filter Charge"
                    className="block border rounded p-1 mt-2 max-w-48"
                    value={
                      filters.charge ??
                      ''
                    }
                    onChange={(
                      event
                    ) =>
                      navigate({
                        charge:
                          event.target
                            .value ||
                          null,

                        page:
                          1,
                      })
                    }
                  >
                    <option value="">
                      All
                    </option>

                    {options.charges.map(
                      (
                        value
                      ) => (
                        <option
                          key={
                            value
                          }
                          value={
                            value
                          }
                        >
                          {
                            value
                          }
                        </option>
                      )
                    )}
                  </select>
                </label>
              </th>

              <th className="p-3">
                <label>
                  Period

                  <select
                    aria-label="Filter Period"
                    className="block border rounded p-1 mt-2 max-w-48"
                    value={
                      filters.period ??
                      ''
                    }
                    onChange={(
                      event
                    ) =>
                      navigate({
                        period:
                          event.target
                            .value ||
                          null,

                        page:
                          1,
                      })
                    }
                  >
                    <option value="">
                      All
                    </option>

                    {options.periods.map(
                      (
                        value
                      ) => (
                        <option
                          key={
                            value
                          }
                          value={
                            value
                          }
                        >
                          {
                            value
                          }
                        </option>
                      )
                    )}
                  </select>
                </label>
              </th>

              <th className="p-3">
                <label>
                  Due date

                  <select
                    aria-label="Filter Due date"
                    className="block border rounded p-1 mt-2"
                    value={
                      filters.dueDate ??
                      ''
                    }
                    onChange={(
                      event
                    ) =>
                      navigate({
                        dueDate:
                          event.target
                            .value ||
                          null,

                        page:
                          1,
                      })
                    }
                  >
                    <option value="">
                      All
                    </option>

                    {options.dueDates.map(
                      (
                        value
                      ) => (
                        <option
                          key={
                            value
                          }
                          value={
                            value
                          }
                        >
                          {value ===
                          '__none__'
                            ? '—'
                            : isoToDdMmYyyy(
                                value
                              )}
                        </option>
                      )
                    )}
                  </select>
                </label>
              </th>

              <th className="p-3">
                <label>
                  Status

                  <select
                    aria-label="Filter Status"
                    className="block border rounded p-1 mt-2"
                    value={
                      filters.status
                    }
                    onChange={(
                      event
                    ) =>
                      navigate({
                        status:
                          event.target
                            .value as InvoiceStatusFilter,

                        page:
                          1,
                      })
                    }
                  >
                    <option value="all">
                      All
                    </option>

                    <option value="unpaid">
                      unpaid
                    </option>

                    <option value="partial">
                      partial
                    </option>

                    <option value="paid">
                      paid
                    </option>

                    <option value="overdue">
                      overdue
                    </option>
                  </select>
                </label>
              </th>

              <th className="p-3">
                <label>
                  Outstanding

                  <select
                    aria-label="Filter Outstanding"
                    className="block border rounded p-1 mt-2"
                    value={
                      filters.outstanding
                    }
                    onChange={(
                      event
                    ) =>
                      navigate({
                        outstanding:
                          event.target
                            .value as InvoiceOutstandingFilter,

                        page:
                          1,
                      })
                    }
                  >
                    <option value="all">
                      All amounts
                    </option>

                    <option value="positive">
                      Has balance
                    </option>

                    <option value="zero">
                      Fully paid
                    </option>

                    <option value="under5000">
                      Under ₦5,000
                    </option>

                    <option value="5000plus">
                      ₦5,000 or more
                    </option>
                  </select>
                </label>
              </th>
            </tr>
          </thead>

          <tbody>
            {invoices.length >
            0 ? (
              invoices.map(
                (
                  invoice
                ) => (
                  <tr
                    key={
                      invoice.id
                    }
                    className="border-t text-sm"
                  >
                    <td className="p-3 font-medium">
                      {
                        invoice.target
                      }
                    </td>

                    <td className="p-3">
                      <span className="pill">
                        {
                          invoice.scopeLabel
                        }
                      </span>
                    </td>

                    <td className="p-3">
                      {
                        invoice.charge
                      }
                    </td>

                    <td className="p-3">
                      {
                        invoice.period
                      }
                    </td>

                    <td className="p-3">
                      {invoice.dueDate
                        ? isoToDdMmYyyy(
                            invoice.dueDate
                          )
                        : '—'}
                    </td>

                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          invoice.status ===
                          'paid'
                            ? 'bg-green-100 text-green-700'
                            : invoice.status ===
                                'partial'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {
                          invoice.status
                        }
                      </span>
                    </td>

                    <td className="p-3 text-right font-medium">
                      {naira(
                        invoice.outstanding
                      )}
                    </td>
                  </tr>
                )
              )
            ) : (
              <tr>
                <td
                  colSpan={
                    7
                  }
                  className="p-6 text-center text-gray-500"
                >
                  No invoices match your filters.
                </td>
              </tr>
            )}
          </tbody>

          {total >
            0 && (
            <tfoot>
              <tr className="border-t-2 bg-gray-50 text-sm font-semibold">
                <td
                  className="p-3"
                  colSpan={
                    6
                  }
                >
                  Total (
                  {
                    total
                  }{' '}
                  invoice
                  {total ===
                  1
                    ? ''
                    : 's'}
                  ) —{' '}
                  {naira(
                    totalBilled
                  )}{' '}
                  billed
                </td>

                <td className="p-3 text-right">
                  {naira(
                    totalOutstanding
                  )}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {totalPages >
        1 && (
        <div className="flex items-center justify-between gap-3 mt-4">
          <button
            type="button"
            className="action secondary"
            disabled={
              page <=
              1
            }
            onClick={() =>
              navigate({
                page:
                  Math.max(
                    1,
                    page -
                      1
                  ),
              })
            }
          >
            ← Previous
          </button>

          <span className="text-sm text-gray-500">
            Page{' '}
            {page}{' '}
            of{' '}
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
            onClick={() =>
              navigate({
                page:
                  Math.min(
                    totalPages,
                    page +
                      1
                  ),
              })
            }
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}