'use client'

import {
  FormEvent,
  useState,
} from 'react'

import Link from 'next/link'

import {
  usePathname,
  useRouter,
} from 'next/navigation'

import type {
  ResidentDirectoryFilters,
  ResidentDirectoryRow,
} from '@/lib/residents-directory-server'

const naira = (
  amount: number
) =>
  `₦${amount.toLocaleString(
    'en-NG'
  )}`

export function ResidentsTable({
  residents,
  streets,
  total,
  page,
  pageSize,
  filters,
}: {
  residents:
    ResidentDirectoryRow[]

  streets: {
    id: string
    name: string
  }[]

  total: number

  page: number

  pageSize: number

  filters:
    ResidentDirectoryFilters
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
    total === 0
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
      ResidentDirectoryFilters
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
      merged.street
    ) {
      params.set(
        'street',
        merged.street
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
      merged.dues !==
      'all'
    ) {
      params.set(
        'dues',
        merged.dues
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

  function occupancy(
    relationship:
      string
  ) {
    if (
      relationship ===
      'owner'
    ) {
      return 'Home Owner'
    }

    if (
      relationship ===
      'family_member'
    ) {
      return 'Family Member'
    }

    if (
      relationship ===
      'tenant'
    ) {
      return 'Tenant'
    }

    return relationship
  }

  return (
    <div>
      <form
        onSubmit={
          submitSearch
        }
        className="flex flex-col sm:flex-row gap-3 mb-4"
      >
        <div className="flex flex-1 gap-2">
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
            placeholder="Search by resident ID, name, house, or phone..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
          />

          <button
            type="submit"
            className="action secondary"
          >
            Search
          </button>
        </div>

        <select
          value={
            filters.street ??
            'all'
          }
          onChange={(
            event
          ) =>
            navigate({
              street:
                event.target
                  .value ===
                'all'
                  ? null
                  : event.target
                      .value,

              page:
                1,
            })
          }
          className="border rounded-lg px-3 py-2 text-sm"
          aria-label="Filter residents by street"
        >
          <option value="all">
            All streets
          </option>

          {streets.map(
            (
              street
            ) => (
              <option
                key={
                  street.id
                }
                value={
                  street.id
                }
              >
                {
                  street.name
                }
              </option>
            )
          )}
        </select>

        <select
          value={
            filters.status
          }
          onChange={(
            event
          ) =>
            navigate({
              status:
                event.target
                  .value as
                  ResidentDirectoryFilters['status'],

              page:
                1,
            })
          }
          className="border rounded-lg px-3 py-2 text-sm"
          aria-label="Filter residents by status"
        >
          <option value="all">
            All statuses
          </option>

          <option value="active">
            Active only
          </option>

          <option value="inactive">
            Inactive only
          </option>
        </select>
      </form>

      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <select
          aria-label="Filter residents by dues"
          className="border rounded-lg px-3 py-2 text-sm"
          value={
            filters.dues
          }
          onChange={(
            event
          ) =>
            navigate({
              dues:
                event.target
                  .value as
                  ResidentDirectoryFilters['dues'],

              page:
                1,
            })
          }
        >
          <option value="all">
            All residents
          </option>

          <option value="yes">
            Has dues to manage
          </option>

          <option value="no">
            No outstanding dues
          </option>
        </select>

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
          View all residents
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-2">
        {total ===
        0
          ? 'No residents found'
          : `Showing ${firstRow}–${lastRow} of ${total} resident${
              total ===
              1
                ? ''
                : 's'
            }`}
      </p>

      <div className="bg-white rounded-xl shadow overflow-x-auto border">
        <table className="w-full text-left">
          <thead className="bg-gray-100 text-sm text-gray-600">
            <tr>
              <th className="p-3">
                Resident ID
              </th>

              <th className="p-3">
                Name
              </th>

              <th className="p-3">
                House
              </th>

              <th className="p-3">
                Street
              </th>

              <th className="p-3">
                Phone
              </th>

              <th className="p-3">
                Occupancy
              </th>

              <th className="p-3">
                Status
              </th>

              <th className="p-3">
                Personal dues
              </th>

              <th className="p-3">
                Household billing
              </th>

              <th className="p-3">
              </th>
            </tr>
          </thead>

          <tbody>
            {residents.length >
            0 ? (
              residents.map(
                (
                  resident
                ) => (
                  <tr
                    key={
                      resident.id
                    }
                    className="border-t text-sm"
                  >
                    <td className="p-3 font-mono text-xs">
                      {
                        resident.resident_code
                      }
                    </td>

                    <td className="p-3 font-medium">
                      {
                        resident.full_name
                      }
                    </td>

                    <td className="p-3">
                      {resident.address ??
                        '—'}
                    </td>

                    <td className="p-3">
                      {resident.street_name ??
                        '—'}
                    </td>

                    <td className="p-3">
                      {resident.phone ??
                        '—'}
                    </td>

                    <td className="p-3">
                      {occupancy(
                        resident.relationship
                      )}
                    </td>

                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          resident.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {resident.is_active
                          ? 'Active'
                          : 'Inactive'}
                      </span>
                    </td>

                    <td className="p-3">
                      {naira(
                        resident.personalOutstanding
                      )}
                    </td>

                    <td className="p-3">
                      {resident.managesHouseholdBilling ? (
                        <span>
                          {naira(
                            resident.householdOutstanding
                          )}

                          <small className="block text-gray-500 mt-1">
                            Billing contact
                          </small>
                        </span>
                      ) : resident.billingContactName ? (
                        <span className="text-gray-500">
                          Managed by{' '}
                          {
                            resident.billingContactName
                          }
                        </span>
                      ) : (
                        <span className="text-gray-500">
                          No billing contact
                        </span>
                      )}
                    </td>

                    <td className="p-3">
                      <Link
                        href={`/admin/residents/${resident.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                )
              )
            ) : (
              <tr>
                <td
                  colSpan={
                    10
                  }
                  className="p-6 text-center text-gray-500"
                >
                  No residents match your filters.
                </td>
              </tr>
            )}
          </tbody>
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