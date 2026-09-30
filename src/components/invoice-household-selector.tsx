'use client'

import {
  useMemo,
  useState,
} from 'react'

import type {
  House,
} from '@/lib/invoice-generation'

export function InvoiceHouseholdSelector({
  houses,
  selectedHouseId,
  onSelect,
}: {
  houses:
    House[]

  selectedHouseId:
    string

  onSelect:
    (
      houseId: string
    ) => void
}) {
  const [
    houseSearch,
    setHouseSearch,
  ] =
    useState(
      ''
    )

  const [
    streetFilter,
    setStreetFilter,
  ] =
    useState(
      'all'
    )

  const streets =
    useMemo(
      () => {
        const byId =
          new Map<
            string,
            string
          >()

        for (
          const house
          of houses
        ) {
          if (
            house.street_id &&
            house.streets
              ?.name
          ) {
            byId.set(
              house.street_id,
              house.streets.name
            )
          }
        }

        return Array.from(
          byId.entries()
        )
          .map(
            ([
              id,
              name,
            ]) => ({
              id,
              name,
            })
          )
          .sort(
            (
              a,
              b
            ) =>
              a.name.localeCompare(
                b.name
              )
          )
      },
      [
        houses,
      ]
    )

  const selectedHouse =
    houses.find(
      (
        house
      ) =>
        house.id ===
        selectedHouseId
    )

  const housesForStreet =
    useMemo(
      () => {
        if (
          streetFilter ===
          'all'
        ) {
          return houses
        }

        return houses.filter(
          (
            house
          ) =>
            house.street_id ===
            streetFilter
        )
      },
      [
        houses,
        streetFilter,
      ]
    )

  const filteredHouses =
    useMemo(
      () => {
        const query =
          houseSearch
            .trim()
            .toLowerCase()

        if (
          !query
        ) {
          return housesForStreet
        }

        return housesForStreet.filter(
          (
            house
          ) => {
            const residentNames =
              (
                house.residents ??
                []
              )
                .filter(
                  (
                    resident
                  ) =>
                    resident.is_active
                )
                .map(
                  (
                    resident
                  ) =>
                    resident.full_name
                )
                .join(
                  ' '
                )
                .toLowerCase()

            return (
              house.address
                .toLowerCase()
                .includes(
                  query
                ) ||
              (
                house.house_type ??
                ''
              )
                .toLowerCase()
                .includes(
                  query
                ) ||
              residentNames.includes(
                query
              )
            )
          }
        )
      },
      [
        houseSearch,
        housesForStreet,
      ]
    )

  const billingContact =
    useMemo(
      () => {
        if (
          !selectedHouse
        ) {
          return null
        }

        const residents =
          selectedHouse
            .residents ??
          []

        if (
          selectedHouse
            .billing_responsible_resident_id
        ) {
          const delegated =
            residents.find(
              (
                resident
              ) =>
                resident.id ===
                selectedHouse
                  .billing_responsible_resident_id
            )

          if (
            delegated
          ) {
            return delegated
              .full_name
          }
        }

        const owner =
          residents.find(
            (
              resident
            ) =>
              resident.is_active &&
              resident.relationship ===
                'owner'
          )

        return (
          owner?.full_name ??
          null
        )
      },
      [
        selectedHouse,
      ]
    )

  function selectStreet(
    value:
      string
  ) {
    setStreetFilter(
      value
    )

    setHouseSearch(
      ''
    )

    if (
      value !==
        'all' &&
      selectedHouse &&
      selectedHouse.street_id !==
        value
    ) {
      onSelect(
        ''
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-gray-50 p-4 text-sm">
        <strong>
          Bill a household
        </strong>

        <p className="mt-1 text-gray-600">
          Filter the &apos;street&apos; first,
          then select one property. The invoice
          belongs to the house, not to every
          resident living there.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">
            Street
          </label>

          <select
            className="w-full border rounded-lg px-3 py-2"
            value={
              streetFilter
            }
            onChange={(
              event
            ) =>
              selectStreet(
                event.target
                  .value
              )
            }
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
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Property
          </label>

          <select
            className="w-full border rounded-lg px-3 py-2"
            value={
              selectedHouseId
            }
            onChange={(
              event
            ) =>
              onSelect(
                event.target
                  .value
              )
            }
          >
            <option value="">
              Select a property
            </option>

            {housesForStreet.map(
              (
                house
              ) => (
                <option
                  key={
                    house.id
                  }
                  value={
                    house.id
                  }
                >
                  {
                    house.address
                  }
                </option>
              )
            )}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Search resident or property
        </label>

        <input
          type="search"
          value={
            houseSearch
          }
          onChange={(
            event
          ) =>
            setHouseSearch(
              event.target
                .value
            )
          }
          placeholder="Optional: search by resident name, house, or house type..."
          className="w-full border rounded-lg px-3 py-2"
        />

        <p className="text-xs text-gray-500 mt-1">
          Use this when you know a resident
          name but not the exact property.
        </p>
      </div>

      <div className="border rounded-xl overflow-hidden max-h-72 overflow-y-auto">
        {filteredHouses.length >
        0 ? (
          filteredHouses.map(
            (
              house
            ) => {
              const activeResidents =
                (
                  house.residents ??
                  []
                ).filter(
                  (
                    resident
                  ) =>
                    resident.is_active
                )

              return (
                <button
                  key={
                    house.id
                  }
                  type="button"
                  aria-pressed={
                    selectedHouseId ===
                    house.id
                  }
                  onClick={() =>
                    onSelect(
                      house.id
                    )
                  }
                  className={`w-full text-left p-4 border-b last:border-b-0 ${
                    selectedHouseId ===
                    house.id
                      ? 'bg-green-50'
                      : 'bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong>
                        {
                          house.address
                        }
                      </strong>

                      <p className="text-xs text-gray-500 mt-1">
                        {house.house_type ??
                          'House type not set'}
                      </p>

                      {activeResidents.length >
                        0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          {activeResidents
                            .map(
                              (
                                resident
                              ) =>
                                resident.full_name
                            )
                            .join(
                              ', '
                            )}
                        </p>
                      )}
                    </div>

                    {selectedHouseId ===
                      house.id && (
                      <span className="pill good">
                        Selected
                      </span>
                    )}
                  </div>
                </button>
              )
            }
          )
        ) : (
          <p className="p-5 text-sm text-gray-500">
            No households match the selected
            street and search.
          </p>
        )}
      </div>

      {selectedHouse && (
        <div className="rounded-lg border p-4 text-sm bg-green-50">
          <span className="text-gray-500">
            Selected household
          </span>

          <strong className="block mt-1">
            ✓{' '}
            {
              selectedHouse.address
            }
          </strong>

          <p className="text-xs text-gray-500 mt-1">
            {selectedHouse.house_type ??
              'House type not set'}
          </p>

          <p className="text-xs text-gray-500 mt-2">
            <strong>
              Billing contact:
            </strong>{' '}
            {billingContact ??
              'No active Home Owner or designated billing contact found'}
          </p>

          <p className="text-xs text-gray-500 mt-1">
            The invoice remains attached to this
            house. The billing contact is the person
            who receives and manages the household bill.
          </p>
        </div>
      )}
    </div>
  )
}