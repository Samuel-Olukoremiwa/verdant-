'use client'

import {
  useMemo,
  useState,
} from 'react'
import Link from 'next/link'

type Resident = {
  id: string
  full_name: string
  phone:
    | string
    | null
  relationship: string
  is_active: boolean

  personalOutstanding:
    number

  householdOutstanding:
    number

  managesHouseholdBilling:
    boolean

  billingContactName:
    | string
    | null

  houses:
    | {
        address: string
        house_type:
          | string
          | null
        street_id:
          | string
          | null

        streets:
          | {
              name: string
            }
          | null
      }
    | null
}

const naira = (
  amount: number
) =>
  `₦${amount.toLocaleString(
    'en-NG'
  )}`

export function ResidentsTable({
  residents,
  streets,
  initialHasDues =
    false,
}: {
  initialHasDues?: boolean
  residents:
    Resident[]
  streets: {
    id: string
    name: string
  }[]
}) {
  const [
    dues,
    setDues,
  ] = useState(
    initialHasDues
      ? 'yes'
      : 'all'
  )

  const [
    query,
    setQuery,
  ] = useState('')

  const [
    status,
    setStatus,
  ] = useState<
    | 'all'
    | 'active'
    | 'inactive'
  >('all')

  const [
    streetId,
    setStreetId,
  ] = useState(
    'all'
  )

  const filtered =
    useMemo(() => {
      const q =
        query
          .trim()
          .toLowerCase()

      return residents.filter(
        (resident) => {
          const amountManaged =
            resident
              .personalOutstanding
            +
            resident
              .householdOutstanding

          if (
            dues ===
              'yes' &&
            amountManaged <=
              0
          ) {
            return false
          }

          if (
            dues ===
              'no' &&
            amountManaged >
              0
          ) {
            return false
          }

          if (
            status ===
              'active' &&
            !resident.is_active
          ) {
            return false
          }

          if (
            status ===
              'inactive' &&
            resident.is_active
          ) {
            return false
          }

          if (
            streetId !==
              'all' &&
            resident.houses
              ?.street_id !==
              streetId
          ) {
            return false
          }

          if (!q) {
            return true
          }

          return (
            resident.full_name
              .toLowerCase()
              .includes(q)
            ||
            (
              resident
                .houses
                ?.address ??
              ''
            )
              .toLowerCase()
              .includes(q)
            ||
            (
              resident.phone ??
              ''
            )
              .toLowerCase()
              .includes(q)
          )
        }
      )
    }, [
      residents,
      query,
      status,
      streetId,
      dues,
    ])

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          value={query}
          onChange={(
            event
          ) =>
            setQuery(
              event.target
                .value
            )
          }
          placeholder="Search by name, house, or phone..."
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />

        <select
          value={
            streetId
          }
          onChange={(
            event
          ) =>
            setStreetId(
              event.target
                .value
            )
          }
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">
            All streets
          </option>

          {streets.map(
            (street) => (
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
            status
          }
          onChange={(
            event
          ) =>
            setStatus(
              event.target
                .value as
                | 'all'
                | 'active'
                | 'inactive'
            )
          }
          className="border rounded-lg px-3 py-2 text-sm"
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
      </div>

      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <select
          aria-label="Filter residents by dues"
          className="border rounded-lg px-3 py-2 text-sm"
          value={dues}
          onChange={(
            event
          ) =>
            setDues(
              event.target
                .value
            )
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
            setDues('all')
            setQuery('')
            setStreetId(
              'all'
            )
            setStatus(
              'all'
            )
          }}
        >
          View all residents
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-2">
        Showing{' '}
        {filtered.length}{' '}
        of{' '}
        {residents.length}{' '}
        resident
        {residents.length ===
        1
          ? ''
          : 's'}
      </p>

      <div className="bg-white rounded-xl shadow overflow-x-auto border">
        <table className="w-full text-left">
          <thead className="bg-gray-100 text-sm text-gray-600">
            <tr>
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
                Household
                billing
              </th>

              <th className="p-3">
              </th>
            </tr>
          </thead>

          <tbody>
            {filtered.length >
            0 ? (
              filtered.map(
                (
                  resident
                ) => (
                  <tr
                    key={
                      resident.id
                    }
                    className="border-t text-sm"
                  >
                    <td className="p-3 font-medium">
                      {
                        resident.full_name
                      }
                    </td>

                    <td className="p-3">
                      {resident
                        .houses
                        ?.address ??
                        '—'}
                    </td>

                    <td className="p-3">
                      {resident
                        .houses
                        ?.streets
                        ?.name ??
                        '—'}
                    </td>

                    <td className="p-3">
                      {resident.phone ??
                        '—'}
                    </td>

                    <td className="p-3">
                      {resident.relationship ===
                      'owner'
                        ? 'Home Owner'
                        : resident.relationship ===
                            'family_member'
                          ? 'Family Member'
                          : resident.relationship ===
                              'tenant'
                            ? 'Tenant'
                            : resident.relationship}
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
                        resident
                          .personalOutstanding
                      )}
                    </td>

                    <td className="p-3">
                      {resident.managesHouseholdBilling ? (
                        <span>
                          {naira(
                            resident
                              .householdOutstanding
                          )}

                          <small className="block text-gray-500 mt-1">
                            Billing
                            contact
                          </small>
                        </span>
                      ) : resident.billingContactName ? (
                        <span className="text-gray-500">
                          Managed
                          by{' '}
                          {
                            resident.billingContactName
                          }
                        </span>
                      ) : (
                        <span className="text-gray-500">
                          No
                          billing
                          contact
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
                  colSpan={9}
                  className="p-6 text-center text-gray-500"
                >
                  {residents.length ===
                  0
                    ? 'No residents yet.'
                    : 'No residents match your search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}