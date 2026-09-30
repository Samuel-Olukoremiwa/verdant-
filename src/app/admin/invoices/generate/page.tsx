'use client'

import { DateField } from '@/components/date-field'

import Link from 'next/link'
import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

import {
  MONTHS,
  QUARTERS,
  YEARS,
  canonicalFrequency,
  displayDate,
  freshForm,
  makeHouseRange,
  makeSingleHousePeriod,
  modeFromQuery,
  naira,
  type BillingMode,
  type DueType,
  type House,
  type HousePreview,
  type Resident,
  type ResidentPreview,
  type Summary,
} from '@/lib/invoice-generation'

export default function GenerateInvoicesPage() {
  const router = useRouter()

  const supabase = useMemo(
    () => createClient(),
    []
  )

  const [mode, setMode] =
    useState<BillingMode>(null)

  const [loading, setLoading] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const [summary, setSummary] =
    useState<Summary | null>(null)

  const [
    residentPreview,
    setResidentPreview,
  ] =
    useState<ResidentPreview | null>(
      null
    )

  const [
    housePreview,
    setHousePreview,
  ] =
    useState<HousePreview | null>(
      null
    )

  const [dueTypes, setDueTypes] =
    useState<DueType[]>([])

  const [houses, setHouses] =
    useState<House[]>([])

  const [residents, setResidents] =
    useState<Resident[]>([])

  const [
    houseSearch,
    setHouseSearch,
  ] =
    useState('')

  const [
    streetFilter,
    setStreetFilter,
  ] =
    useState('all')

  const [
    selectedHouseId,
    setSelectedHouseId,
  ] =
    useState('')

  const [form, setForm] =
    useState(freshForm)

  useEffect(() => {
    const timer =
      window.setTimeout(
        () => {
          const params =
            new URLSearchParams(
              window.location.search
            )

          const requestedMode =
            modeFromQuery(
              params.get(
                'mode'
              )
            )

          const requestedHouse =
            params.get(
              'house'
            ) ?? ''

          const requestedResident =
            params.get(
              'resident'
            ) ?? ''

          if (
            requestedMode
          ) {
            setMode(
              requestedMode
            )
          }

          if (
            requestedHouse
          ) {
            setSelectedHouseId(
              requestedHouse
            )
          }

          if (
            requestedResident
          ) {
            setForm(
              (
                current
              ) => ({
                ...current,

                resident_id:
                  requestedResident,
              })
            )
          }
        },
        0
      )

    return () => {
      window.clearTimeout(
        timer
      )
    }
  }, [])

  useEffect(() => {
    let active =
      true

    async function load() {
      const [
        dueResult,
        houseResult,
        residentResult,
      ] =
        await Promise.all([
          supabase
            .from(
              'due_types'
            )
            .select(
              'id, name, amount, frequency, billing_scope'
            )
            .order(
              'name'
            ),

          supabase
            .from(
              'houses'
            )
            .select(`
              id,
              address,
              house_type,
              street_id,
              billing_responsible_resident_id,
              streets (
                name
              ),
              residents:residents!residents_house_id_fkey (
                id,
                full_name,
                relationship,
                is_active
              )
            `)
            .order(
              'address'
            ),

          supabase
            .from(
              'residents'
            )
            .select(`
              id,
              house_id,
              full_name,
              move_in_date,
              property_allocation_date,
              houses:houses!residents_house_id_fkey (
                address
              )
            `)
            .eq(
              'is_active',
              true
            )
            .order(
              'full_name'
            ),
        ])

      if (!active) {
        return
      }

      const firstError =
        dueResult.error ??
        houseResult.error ??
        residentResult.error

      if (
        firstError
      ) {
        setError(
          firstError.message
        )

        return
      }

      setDueTypes(
        (
          dueResult.data ??
          []
        ) as unknown as DueType[]
      )

      setHouses(
        (
          houseResult.data ??
          []
        ) as unknown as House[]
      )

      setResidents(
        (
          residentResult.data ??
          []
        ) as unknown as Resident[]
      )
    }

    void load()

    return () => {
      active =
        false
    }
  }, [supabase])

  const houseDueTypes =
    useMemo(
      () =>
        dueTypes.filter(
          (
            dueType
          ) =>
            dueType.billing_scope ===
            'house'
        ),
      [dueTypes]
    )

  const residentDueTypes =
    useMemo(
      () =>
        dueTypes.filter(
          (
            dueType
          ) =>
            dueType.billing_scope ===
            'resident'
        ),
      [dueTypes]
    )

  const selectedDueType =
    dueTypes.find(
      (
        dueType
      ) =>
        dueType.id ===
        form.due_type_id
    )

  const selectedHouse =
    houses.find(
      (
        house
      ) =>
        house.id ===
        selectedHouseId
    )

  const selectedResident =
    residents.find(
      (
        resident
      ) =>
        resident.id ===
        form.resident_id
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
              house
                .streets
                .name
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
      [houses]
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

        if (!query) {
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

  const houseFrequency =
    selectedDueType
      ?.billing_scope ===
    'house'
      ? canonicalFrequency(
          selectedDueType
            .frequency
        )
      : null

  const allHouseholdPeriod =
    mode ===
      'all-households' &&
    selectedDueType
      ?.billing_scope ===
      'house'
      ? makeSingleHousePeriod(
          selectedDueType
            .frequency,

          form
        )
      : null

  const selectedHouseRange =
    mode ===
      'household' &&
    selectedDueType
      ?.billing_scope ===
      'house'
      ? makeHouseRange(
          selectedDueType
            .frequency,

          form
        )
      : null

  const householdBillingContact =
    useMemo(
      () => {
        if (
          !selectedHouse
        ) {
          return null
        }

        const householdMembers =
          selectedHouse
            .residents ??
          []

        if (
          selectedHouse
            .billing_responsible_resident_id
        ) {
          const delegated =
            householdMembers.find(
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
            return delegated.full_name
          }
        }

        const owner =
          householdMembers.find(
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
      [selectedHouse]
    )

  function resetResultState() {
    setResidentPreview(
      null
    )

    setHousePreview(
      null
    )

    setSummary(
      null
    )

    setError(
      null
    )
  }

  function chooseMode(
    nextMode: Exclude<
      BillingMode,
      null
    >
  ) {
    setMode(
      nextMode
    )

    setHouseSearch(
      ''
    )

    setStreetFilter(
      'all'
    )

    setSelectedHouseId(
      ''
    )

    setForm(
      freshForm()
    )

    resetResultState()
  }

  function changeForm(
    next: Partial<
      typeof form
    >
  ) {
    setForm(
      (
        current
      ) => ({
        ...current,
        ...next,
      })
    )

    resetResultState()
  }

  function selectStreet(
    value: string
  ) {
    setStreetFilter(
      value
    )

    setHouseSearch(
      ''
    )

    resetResultState()

    if (
      selectedHouseId &&
      value !==
        'all'
    ) {
      const selected =
        houses.find(
          (
            house
          ) =>
            house.id ===
            selectedHouseId
        )

      if (
        selected?.street_id !==
        value
      ) {
        setSelectedHouseId(
          ''
        )
      }
    }
  }

  function selectResident(
    residentId: string
  ) {
    const resident =
      residents.find(
        (
          item
        ) =>
          item.id ===
          residentId
      )

    changeForm({
      resident_id:
        residentId,

      billing_start:
        resident
          ?.property_allocation_date ??
        resident
          ?.move_in_date ??
        '',
    })
  }

  function validateAllHouseholds() {
    if (
      !selectedDueType ||
      selectedDueType
        .billing_scope !==
        'house'
    ) {
      throw new Error(
        'Select a Household / Property due type.'
      )
    }

    if (
      !allHouseholdPeriod
    ) {
      throw new Error(
        'Choose a valid billing period.'
      )
    }

    if (
      !form.due_date
    ) {
      throw new Error(
        'Choose a due date.'
      )
    }

    return allHouseholdPeriod
  }

  async function generateAllHouseholds(
    event:
      React.FormEvent
  ) {
    event.preventDefault()

    setLoading(
      true
    )

    setError(
      null
    )

    setSummary(
      null
    )

    try {
      const period =
        validateAllHouseholds()

      const {
        data,
        error:
          generateError,
      } =
        await supabase.rpc(
          'generate_house_invoices',
          {
            p_due_type:
              selectedDueType!
                .id,

            p_period_start:
              period.start,

            p_period_end:
              period.end,

            p_due_date:
              form.due_date,
          }
        )

      if (
        generateError
      ) {
        throw generateError
      }

      setSummary(
        data as Summary
      )

      router.refresh()
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof
          Error
          ? caughtError.message
          : 'Could not generate invoices.'
      )
    } finally {
      setLoading(
        false
      )
    }
  }

  function validateSingleHousehold() {
    if (
      !selectedHouse
    ) {
      throw new Error(
        'Select a household.'
      )
    }

    if (
      !selectedDueType ||
      selectedDueType
        .billing_scope !==
        'house'
    ) {
      throw new Error(
        'Select a Household / Property due type.'
      )
    }

    if (
      !selectedHouseRange
    ) {
      throw new Error(
        'Choose a valid From and To billing period.'
      )
    }

    if (
      !form.due_date
    ) {
      throw new Error(
        'Choose a due date.'
      )
    }

    return {
      houseId:
        selectedHouse.id,

      dueTypeId:
        selectedDueType.id,

      start:
        selectedHouseRange
          .start,

      end:
        selectedHouseRange
          .end,

      dueDate:
        form.due_date,
    }
  }

  async function previewSingleHousehold() {
    setLoading(
      true
    )

    setError(
      null
    )

    setSummary(
      null
    )

    try {
      const values =
        validateSingleHousehold()

      const {
        data,
        error:
          previewError,
      } =
        await supabase.rpc(
          'preview_single_house_invoices_range',
          {
            p_house:
              values.houseId,

            p_due_type:
              values.dueTypeId,

            p_start:
              values.start,

            p_end:
              values.end,

            p_due_date:
              values.dueDate,
          }
        )

      if (
        previewError
      ) {
        throw previewError
      }

      setHousePreview(
        data as HousePreview
      )
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof
          Error
          ? caughtError.message
          : 'Could not preview household invoices.'
      )
    } finally {
      setLoading(
        false
      )
    }
  }

  async function generateSingleHousehold() {
    setLoading(
      true
    )

    setError(
      null
    )

    try {
      const values =
        validateSingleHousehold()

      const {
        data,
        error:
          generateError,
      } =
        await supabase.rpc(
          'generate_single_house_invoices_range',
          {
            p_house:
              values.houseId,

            p_due_type:
              values.dueTypeId,

            p_start:
              values.start,

            p_end:
              values.end,

            p_due_date:
              values.dueDate,
          }
        )

      if (
        generateError
      ) {
        throw generateError
      }

      setSummary(
        data as Summary
      )

      setHousePreview(
        null
      )

      router.refresh()
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof
          Error
          ? caughtError.message
          : 'Could not generate household invoices.'
      )
    } finally {
      setLoading(
        false
      )
    }
  }

  function validateResidentForm() {
    if (
      !selectedDueType ||
      selectedDueType
        .billing_scope !==
        'resident'
    ) {
      throw new Error(
        'Select an Individual Resident due type.'
      )
    }

    if (
      !selectedResident
    ) {
      throw new Error(
        'Select a resident.'
      )
    }

    if (
      !form.billing_start
    ) {
      throw new Error(
        'Choose the Billing Start date.'
      )
    }

    if (
      !form.end_date
    ) {
      throw new Error(
        'Choose the Billing End date.'
      )
    }

    if (
      form.billing_start >
      form.end_date
    ) {
      throw new Error(
        'The Billing End date cannot be before the Billing Start date.'
      )
    }

    if (
      !form.due_date
    ) {
      throw new Error(
        'Choose a Due Date.'
      )
    }

    return {
      residentId:
        selectedResident.id,

      dueTypeId:
        selectedDueType.id,

      start:
        form.billing_start,

      end:
        form.end_date,

      dueDate:
        form.due_date,
    }
  }

  async function previewResidentInvoices() {
    setLoading(
      true
    )

    setError(
      null
    )

    setSummary(
      null
    )

    try {
      const values =
        validateResidentForm()

      const {
        data,
        error:
          previewError,
      } =
        await supabase.rpc(
          'preview_resident_invoices',
          {
            p_resident:
              values.residentId,

            p_due_type:
              values.dueTypeId,

            p_start:
              values.start,

            p_end:
              values.end,

            p_due_date:
              values.dueDate,
          }
        )

      if (
        previewError
      ) {
        throw previewError
      }

      setResidentPreview(
        data as ResidentPreview
      )
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof
          Error
          ? caughtError.message
          : 'Could not preview invoices.'
      )
    } finally {
      setLoading(
        false
      )
    }
  }

  async function generateResidentInvoices() {
    setLoading(
      true
    )

    setError(
      null
    )

    try {
      const values =
        validateResidentForm()

      const {
        data,
        error:
          generateError,
      } =
        await supabase.rpc(
          'generate_resident_invoices',
          {
            p_resident:
              values.residentId,

            p_due_type:
              values.dueTypeId,

            p_start:
              values.start,

            p_end:
              values.end,

            p_due_date:
              values.dueDate,
          }
        )

      if (
        generateError
      ) {
        throw generateError
      }

      setSummary(
        data as Summary
      )

      setResidentPreview(
        null
      )

      router.refresh()
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof
          Error
          ? caughtError.message
          : 'Could not generate invoices.'
      )
    } finally {
      setLoading(
        false
      )
    }
  }

  function resetBillingMode() {
    setMode(
      null
    )

    setSelectedHouseId(
      ''
    )

    setHouseSearch(
      ''
    )

    setStreetFilter(
      'all'
    )

    setForm(
      freshForm()
    )

    resetResultState()
  }

  return (
    <div className="page-wrap max-w-4xl">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">
            Dues &amp; billing
          </span>

          <h1 className="page-title">
            Generate dues
          </h1>

          <p className="page-lead">
            Bill every household, one household,
            or one resident without creating
            duplicate household invoices.
          </p>
        </div>

        <Link
          href="/admin/invoices"
          className="action secondary"
        >
          View invoices
        </Link>
      </div>

      {!mode ? (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <button
            type="button"
            onClick={() =>
              chooseMode(
                'all-households'
              )
            }
            className="panel p-5 text-left hover:shadow-md transition-shadow"
          >
            <span className="eyebrow">
              Estate-wide
            </span>

            <h2 className="text-lg font-semibold mt-2">
              Bill all households
            </h2>

            <p className="text-sm text-gray-600 mt-2">
              Apply one Household / Property due
              to every house in the estate.
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              chooseMode(
                'household'
              )
            }
            className="panel p-5 text-left hover:shadow-md transition-shadow"
          >
            <span className="eyebrow">
              One property
            </span>

            <h2 className="text-lg font-semibold mt-2">
              Bill a household
            </h2>

            <p className="text-sm text-gray-600 mt-2">
              Filter by street, select one house,
              and generate one or several periods.
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              chooseMode(
                'resident'
              )
            }
            className="panel p-5 text-left hover:shadow-md transition-shadow"
          >
            <span className="eyebrow">
              Individual
            </span>

            <h2 className="text-lg font-semibold mt-2">
              Bill a resident
            </h2>

            <p className="text-sm text-gray-600 mt-2">
              Create a personal charge that belongs
              only to the selected resident.
            </p>
          </button>
        </section>
      ) : (
        <div className="mt-6">
          <button
            type="button"
            className="action secondary mb-4"
            onClick={
              resetBillingMode
            }
          >
            ← Choose another billing type
          </button>

          <div className="form-card space-y-5">
            {mode ===
              'all-households' && (
              <div className="rounded-lg border bg-gray-50 p-4 text-sm">
                <strong>
                  Bill all households
                </strong>

                <p className="mt-1 text-gray-600">
                  One invoice will be created per
                  house for the selected period.
                  Residents sharing a house will not
                  receive duplicate household invoices.
                </p>
              </div>
            )}

            {mode ===
              'household' && (
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
                          event
                            .target
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
                      ) => {
                        setSelectedHouseId(
                          event
                            .target
                            .value
                        )

                        resetResultState()
                      }}
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
                        event
                          .target
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
                  {filteredHouses.length ? (
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
                            onClick={() => {
                              setSelectedHouseId(
                                house.id
                              )

                              resetResultState()
                            }}
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
                      {householdBillingContact ??
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
            )}

            {mode !==
              'resident' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Household Due Type *
                  </label>

                  <select
                    required
                    className="w-full border rounded-lg px-3 py-2"
                    value={
                      form.due_type_id
                    }
                    onChange={(
                      event
                    ) =>
                      changeForm({
                        due_type_id:
                          event
                            .target
                            .value,

                        due_date:
                          '',
                      })
                    }
                  >
                    <option value="">
                      Select a household due
                    </option>

                    {houseDueTypes.map(
                      (
                        dueType
                      ) => (
                        <option
                          key={
                            dueType.id
                          }
                          value={
                            dueType.id
                          }
                        >
                          {
                            dueType.name
                          }{' '}
                          —{' '}
                          {naira(
                            Number(
                              dueType.amount
                            )
                          )}{' '}
                          —{' '}
                          {
                            dueType.frequency
                          }
                        </option>
                      )
                    )}
                  </select>
                </div>

                {selectedDueType && (
                  <div className="rounded-lg border p-4 text-sm">
                    <p>
                      <strong>
                        Amount:
                      </strong>{' '}
                      {naira(
                        Number(
                          selectedDueType.amount
                        )
                      )}
                    </p>

                    <p className="mt-1 capitalize">
                      <strong>
                        Frequency:
                      </strong>{' '}
                      {
                        selectedDueType.frequency
                      }
                    </p>
                  </div>
                )}

                {selectedDueType &&
                  mode ===
                    'all-households' && (
                    <div className="space-y-4">
                      <div>
                        <span className="block text-sm font-medium mb-1">
                          Billing Period *
                        </span>

                        <p className="text-xs text-gray-500">
                          This estate-wide action creates one
                          period at a time. Period labels are
                          generated automatically.
                        </p>
                      </div>

                      {houseFrequency ===
                        'monthly' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium mb-1">
                              Month
                            </label>

                            <select
                              className="w-full border rounded-lg px-3 py-2"
                              value={
                                form.period_month
                              }
                              onChange={(
                                event
                              ) =>
                                changeForm({
                                  period_month:
                                    event
                                      .target
                                      .value,
                                })
                              }
                            >
                              {MONTHS.map(
                                (
                                  month,
                                  index
                                ) => (
                                  <option
                                    key={
                                      month
                                    }
                                    value={String(
                                      index +
                                        1
                                    )}
                                  >
                                    {
                                      month
                                    }
                                  </option>
                                )
                              )}
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-1">
                              Year
                            </label>

                            <select
                              className="w-full border rounded-lg px-3 py-2"
                              value={
                                form.period_year
                              }
                              onChange={(
                                event
                              ) =>
                                changeForm({
                                  period_year:
                                    event
                                      .target
                                      .value,
                                })
                              }
                            >
                              {YEARS.map(
                                (
                                  year
                                ) => (
                                  <option
                                    key={
                                      year
                                    }
                                    value={
                                      year
                                    }
                                  >
                                    {
                                      year
                                    }
                                  </option>
                                )
                              )}
                            </select>
                          </div>
                        </div>
                      )}

                      {houseFrequency ===
                        'quarterly' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium mb-1">
                              Quarter
                            </label>

                            <select
                              className="w-full border rounded-lg px-3 py-2"
                              value={
                                form.period_quarter
                              }
                              onChange={(
                                event
                              ) =>
                                changeForm({
                                  period_quarter:
                                    event
                                      .target
                                      .value,
                                })
                              }
                            >
                              {QUARTERS.map(
                                (
                                  quarter
                                ) => (
                                  <option
                                    key={
                                      quarter.value
                                    }
                                    value={
                                      quarter.value
                                    }
                                  >
                                    {
                                      quarter.label
                                    }
                                  </option>
                                )
                              )}
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-1">
                              Year
                            </label>

                            <select
                              className="w-full border rounded-lg px-3 py-2"
                              value={
                                form.period_year
                              }
                              onChange={(
                                event
                              ) =>
                                changeForm({
                                  period_year:
                                    event
                                      .target
                                      .value,
                                })
                              }
                            >
                              {YEARS.map(
                                (
                                  year
                                ) => (
                                  <option
                                    key={
                                      year
                                    }
                                    value={
                                      year
                                    }
                                  >
                                    {
                                      year
                                    }
                                  </option>
                                )
                              )}
                            </select>
                          </div>
                        </div>
                      )}

                      {houseFrequency ===
                        'yearly' && (
                        <div>
                          <label className="block text-sm font-medium mb-1">
                            Billing Year
                          </label>

                          <select
                            className="w-full border rounded-lg px-3 py-2"
                            value={
                              form.period_year
                            }
                            onChange={(
                              event
                            ) =>
                              changeForm({
                                period_year:
                                  event
                                    .target
                                    .value,
                              })
                            }
                          >
                            {YEARS.map(
                              (
                                year
                              ) => (
                                <option
                                  key={
                                    year
                                  }
                                  value={
                                    year
                                  }
                                >
                                  {
                                    year
                                  }
                                </option>
                              )
                            )}
                          </select>
                        </div>
                      )}

                      {(houseFrequency ===
                        'one-time' ||
                        houseFrequency ===
                          'custom') && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium mb-1">
                              Period Start *
                            </label>

                            <DateField
                              required
                              className="w-full border rounded-lg px-3 py-2"
                              value={
                                form.one_time_start
                              }
                              onChange={(
                                event
                              ) =>
                                changeForm({
                                  one_time_start:
                                    event
                                      .target
                                      .value,
                                })
                              }
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-1">
                              Period End *
                            </label>

                            <DateField
                              required
                              className="w-full border rounded-lg px-3 py-2"
                              value={
                                form.one_time_end
                              }
                              onChange={(
                                event
                              ) =>
                                changeForm({
                                  one_time_end:
                                    event
                                      .target
                                      .value,
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {allHouseholdPeriod && (
                        <div className="rounded-lg border bg-gray-50 p-4 text-sm">
                          <span className="text-gray-500">
                            Generated period
                          </span>

                          <strong className="block mt-1 text-base">
                            {
                              allHouseholdPeriod.label
                            }
                          </strong>

                          <p className="text-xs text-gray-500 mt-1">
                            {displayDate(
                              allHouseholdPeriod.start
                            )}
                            {' → '}
                            {displayDate(
                              allHouseholdPeriod.end
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                {selectedDueType &&
                  mode ===
                    'household' && (
                    <div className="space-y-4">
                      <div>
                        <span className="block text-sm font-medium mb-1">
                          Billing Period: From and To *
                        </span>

                        <p className="text-xs text-gray-500">
                          Zadant generates every period between
                          From and To according to this due type&apos;s
                          frequency. For example, January 2026 to
                          September 2026 creates nine monthly invoices.
                        </p>
                      </div>

                      {houseFrequency ===
                        'monthly' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="rounded-lg border p-4 space-y-3">
                            <strong className="text-sm">
                              From
                            </strong>

                            <div>
                              <label className="block text-xs font-medium mb-1">
                                Month
                              </label>

                              <select
                                className="w-full border rounded-lg px-3 py-2"
                                value={
                                  form.range_from_month
                                }
                                onChange={(
                                  event
                                ) =>
                                  changeForm({
                                    range_from_month:
                                      event
                                        .target
                                        .value,
                                  })
                                }
                              >
                                {MONTHS.map(
                                  (
                                    month,
                                    index
                                  ) => (
                                    <option
                                      key={
                                        month
                                      }
                                      value={String(
                                        index +
                                          1
                                      )}
                                    >
                                      {
                                        month
                                      }
                                    </option>
                                  )
                                )}
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-medium mb-1">
                                Year
                              </label>

                              <select
                                className="w-full border rounded-lg px-3 py-2"
                                value={
                                  form.range_from_year
                                }
                                onChange={(
                                  event
                                ) =>
                                  changeForm({
                                    range_from_year:
                                      event
                                        .target
                                        .value,
                                  })
                                }
                              >
                                {YEARS.map(
                                  (
                                    year
                                  ) => (
                                    <option
                                      key={
                                        year
                                      }
                                      value={
                                        year
                                      }
                                    >
                                      {
                                        year
                                      }
                                    </option>
                                  )
                                )}
                              </select>
                            </div>
                          </div>

                          <div className="rounded-lg border p-4 space-y-3">
                            <strong className="text-sm">
                              To
                            </strong>

                            <div>
                              <label className="block text-xs font-medium mb-1">
                                Month
                              </label>

                              <select
                                className="w-full border rounded-lg px-3 py-2"
                                value={
                                  form.range_to_month
                                }
                                onChange={(
                                  event
                                ) =>
                                  changeForm({
                                    range_to_month:
                                      event
                                        .target
                                        .value,
                                  })
                                }
                              >
                                {MONTHS.map(
                                  (
                                    month,
                                    index
                                  ) => (
                                    <option
                                      key={
                                        month
                                      }
                                      value={String(
                                        index +
                                          1
                                      )}
                                    >
                                      {
                                        month
                                      }
                                    </option>
                                  )
                                )}
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-medium mb-1">
                                Year
                              </label>

                              <select
                                className="w-full border rounded-lg px-3 py-2"
                                value={
                                  form.range_to_year
                                }
                                onChange={(
                                  event
                                ) =>
                                  changeForm({
                                    range_to_year:
                                      event
                                        .target
                                        .value,
                                  })
                                }
                              >
                                {YEARS.map(
                                  (
                                    year
                                  ) => (
                                    <option
                                      key={
                                        year
                                      }
                                      value={
                                        year
                                      }
                                    >
                                      {
                                        year
                                      }
                                    </option>
                                  )
                                )}
                              </select>
                            </div>
                          </div>
                        </div>
                      )}

                      {houseFrequency ===
                        'quarterly' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="rounded-lg border p-4 space-y-3">
                            <strong className="text-sm">
                              From
                            </strong>

                            <select
                              className="w-full border rounded-lg px-3 py-2"
                              value={
                                form.range_from_quarter
                              }
                              onChange={(
                                event
                              ) =>
                                changeForm({
                                  range_from_quarter:
                                    event
                                      .target
                                      .value,
                                })
                              }
                            >
                              {QUARTERS.map(
                                (
                                  quarter
                                ) => (
                                  <option
                                    key={
                                      quarter.value
                                    }
                                    value={
                                      quarter.value
                                    }
                                  >
                                    {
                                      quarter.label
                                    }
                                  </option>
                                )
                              )}
                            </select>

                            <select
                              className="w-full border rounded-lg px-3 py-2"
                              value={
                                form.range_from_year
                              }
                              onChange={(
                                event
                              ) =>
                                changeForm({
                                  range_from_year:
                                    event
                                      .target
                                      .value,
                                })
                              }
                            >
                              {YEARS.map(
                                (
                                  year
                                ) => (
                                  <option
                                    key={
                                      year
                                    }
                                    value={
                                      year
                                    }
                                  >
                                    {
                                      year
                                    }
                                  </option>
                                )
                              )}
                            </select>
                          </div>

                          <div className="rounded-lg border p-4 space-y-3">
                            <strong className="text-sm">
                              To
                            </strong>

                            <select
                              className="w-full border rounded-lg px-3 py-2"
                              value={
                                form.range_to_quarter
                              }
                              onChange={(
                                event
                              ) =>
                                changeForm({
                                  range_to_quarter:
                                    event
                                      .target
                                      .value,
                                })
                              }
                            >
                              {QUARTERS.map(
                                (
                                  quarter
                                ) => (
                                  <option
                                    key={
                                      quarter.value
                                    }
                                    value={
                                      quarter.value
                                    }
                                  >
                                    {
                                      quarter.label
                                    }
                                  </option>
                                )
                              )}
                            </select>

                            <select
                              className="w-full border rounded-lg px-3 py-2"
                              value={
                                form.range_to_year
                              }
                              onChange={(
                                event
                              ) =>
                                changeForm({
                                  range_to_year:
                                    event
                                      .target
                                      .value,
                                })
                              }
                            >
                              {YEARS.map(
                                (
                                  year
                                ) => (
                                  <option
                                    key={
                                      year
                                    }
                                    value={
                                      year
                                    }
                                  >
                                    {
                                      year
                                    }
                                  </option>
                                )
                              )}
                            </select>
                          </div>
                        </div>
                      )}

                      {houseFrequency ===
                        'yearly' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium mb-1">
                              From Year
                            </label>

                            <select
                              className="w-full border rounded-lg px-3 py-2"
                              value={
                                form.range_from_year
                              }
                              onChange={(
                                event
                              ) =>
                                changeForm({
                                  range_from_year:
                                    event
                                      .target
                                      .value,
                                })
                              }
                            >
                              {YEARS.map(
                                (
                                  year
                                ) => (
                                  <option
                                    key={
                                      year
                                    }
                                    value={
                                      year
                                    }
                                  >
                                    {
                                      year
                                    }
                                  </option>
                                )
                              )}
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-1">
                              To Year
                            </label>

                            <select
                              className="w-full border rounded-lg px-3 py-2"
                              value={
                                form.range_to_year
                              }
                              onChange={(
                                event
                              ) =>
                                changeForm({
                                  range_to_year:
                                    event
                                      .target
                                      .value,
                                })
                              }
                            >
                              {YEARS.map(
                                (
                                  year
                                ) => (
                                  <option
                                    key={
                                      year
                                    }
                                    value={
                                      year
                                    }
                                  >
                                    {
                                      year
                                    }
                                  </option>
                                )
                              )}
                            </select>
                          </div>
                        </div>
                      )}

                      {(houseFrequency ===
                        'one-time' ||
                        houseFrequency ===
                          'custom') && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium mb-1">
                              Period Start *
                            </label>

                            <DateField
                              required
                              className="w-full border rounded-lg px-3 py-2"
                              value={
                                form.one_time_start
                              }
                              onChange={(
                                event
                              ) =>
                                changeForm({
                                  one_time_start:
                                    event
                                      .target
                                      .value,
                                })
                              }
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-1">
                              Period End *
                            </label>

                            <DateField
                              required
                              className="w-full border rounded-lg px-3 py-2"
                              value={
                                form.one_time_end
                              }
                              onChange={(
                                event
                              ) =>
                                changeForm({
                                  one_time_end:
                                    event
                                      .target
                                      .value,
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {selectedHouseRange && (
                        <div className="rounded-lg border bg-gray-50 p-4 text-sm">
                          <span className="text-gray-500">
                            Selected range
                          </span>

                          <strong className="block mt-1 text-base">
                            {
                              selectedHouseRange.label
                            }
                          </strong>

                          <p className="text-xs text-gray-500 mt-1">
                            {displayDate(
                              selectedHouseRange.start
                            )}
                            {' → '}
                            {displayDate(
                              selectedHouseRange.end
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Due Date *
                  </label>

                  <DateField
                    required
                    className="w-full border rounded-lg px-3 py-2"
                    value={
                      form.due_date
                    }
                    onChange={(
                      event
                    ) =>
                      changeForm({
                        due_date:
                          event
                            .target
                            .value,
                      })
                    }
                  />

                  <p className="text-xs text-gray-500 mt-1">
                    For a multi-period household range,
                    this same due date is applied to all
                    newly generated invoices in the range.
                  </p>
                </div>

                {mode ===
                  'all-households' &&
                  selectedDueType &&
                  allHouseholdPeriod &&
                  form.due_date && (
                    <div className="rounded-xl border p-4">
                      <span className="eyebrow">
                        Preview
                      </span>

                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-sm">
                        <div>
                          <dt className="text-gray-500">
                            Target
                          </dt>

                          <dd className="font-semibold mt-1">
                            All{' '}
                            {
                              houses.length
                            }{' '}
                            households
                          </dd>
                        </div>

                        <div>
                          <dt className="text-gray-500">
                            Charge
                          </dt>

                          <dd className="font-semibold mt-1">
                            {
                              selectedDueType.name
                            }
                          </dd>
                        </div>

                        <div>
                          <dt className="text-gray-500">
                            Period
                          </dt>

                          <dd className="font-semibold mt-1">
                            {
                              allHouseholdPeriod.label
                            }
                          </dd>
                        </div>

                        <div>
                          <dt className="text-gray-500">
                            Due date
                          </dt>

                          <dd className="font-semibold mt-1">
                            {displayDate(
                              form.due_date
                            )}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-gray-500">
                            Amount per household
                          </dt>

                          <dd className="font-semibold mt-1">
                            {naira(
                              Number(
                                selectedDueType.amount
                              )
                            )}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-gray-500">
                            Maximum new billing
                          </dt>

                          <dd className="font-semibold mt-1">
                            {naira(
                              Number(
                                selectedDueType.amount
                              ) *
                                houses.length
                            )}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  )}

                {mode ===
                  'all-households' && (
                  <form
                    onSubmit={
                      generateAllHouseholds
                    }
                  >
                    <button
                      type="submit"
                      disabled={
                        loading ||
                        !allHouseholdPeriod ||
                        !form.due_date
                      }
                      className="action disabled:opacity-50"
                    >
                      {loading
                        ? 'Generating...'
                        : 'Generate Due for All Households'}
                    </button>
                  </form>
                )}

                {mode ===
                  'household' && (
                  <div className="space-y-4">
                    <button
                      type="button"
                      disabled={
                        loading ||
                        !selectedHouse ||
                        !selectedHouseRange ||
                        !form.due_date
                      }
                      onClick={
                        previewSingleHousehold
                      }
                      className="action secondary disabled:opacity-50"
                    >
                      {loading
                        ? 'Preparing...'
                        : 'Preview Household Invoices'}
                    </button>

                    {housePreview && (
                      <div className="border rounded-xl overflow-hidden">
                        <div className="p-4 border-b bg-gray-50">
                          <h2 className="font-semibold">
                            Household Invoice Preview
                          </h2>

                          <p className="text-sm text-gray-600 mt-1">
                            {
                              housePreview.address
                            }
                            {' · '}
                            {
                              housePreview.due_type_name
                            }
                          </p>

                          <p className="text-xs text-gray-500 mt-1">
                            Billing contact:{' '}
                            {housePreview.billing_contact_name ??
                              'Not assigned'}
                          </p>
                        </div>

                        <div className="overflow-x-auto max-h-80 overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr>
                                <th className="p-3 text-left">
                                  Period
                                </th>

                                <th className="p-3 text-left">
                                  Due date
                                </th>

                                <th className="p-3 text-right">
                                  Amount
                                </th>

                                <th className="p-3 text-left">
                                  Result
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {housePreview.periods.map(
                                (
                                  period
                                ) => (
                                  <tr
                                    key={`${period.period_start}-${period.period_end}`}
                                    className="border-t"
                                  >
                                    <td className="p-3">
                                      {
                                        period.period_label
                                      }
                                    </td>

                                    <td className="p-3">
                                      {displayDate(
                                        period.due_date
                                      )}
                                    </td>

                                    <td className="p-3 text-right">
                                      {naira(
                                        Number(
                                          period.amount
                                        )
                                      )}
                                    </td>

                                    <td className="p-3">
                                      {period.already_exists
                                        ? 'Already invoiced — will skip'
                                        : 'Will create'}
                                    </td>
                                  </tr>
                                )
                              )}
                            </tbody>
                          </table>
                        </div>

                        <div className="p-4 border-t bg-gray-50 text-sm">
                          <p>
                            <strong>
                              {
                                housePreview.create_count
                              }
                            </strong>{' '}
                            new invoice
                            {housePreview.create_count ===
                            1
                              ? ''
                              : 's'}
                          </p>

                          {housePreview.duplicate_count >
                            0 && (
                            <p>
                              <strong>
                                {
                                  housePreview.duplicate_count
                                }
                              </strong>{' '}
                              existing period
                              {housePreview.duplicate_count ===
                              1
                                ? ''
                                : 's'}{' '}
                              will be skipped.
                            </p>
                          )}

                          <p className="mt-2 text-base">
                            Total new billing:{' '}
                            <strong>
                              {naira(
                                Number(
                                  housePreview.total_to_create
                                )
                              )}
                            </strong>
                          </p>
                        </div>

                        <div className="p-4">
                          <button
                            type="button"
                            disabled={
                              loading ||
                              housePreview.create_count ===
                                0
                            }
                            onClick={
                              generateSingleHousehold
                            }
                            className="action disabled:opacity-50"
                          >
                            {loading
                              ? 'Generating...'
                              : `Generate ${housePreview.create_count} Invoice${
                                  housePreview.create_count ===
                                  1
                                    ? ''
                                    : 's'
                                }`}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {mode ===
              'resident' && (
              <div className="space-y-5">
                <div className="rounded-lg border bg-gray-50 p-4 text-sm">
                  <strong>
                    Bill a resident
                  </strong>

                  <p className="mt-1 text-gray-600">
                    The charge belongs only to the
                    selected resident. Other people in
                    the same house will not receive it.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Resident *
                  </label>

                  <select
                    required
                    className="w-full border rounded-lg px-3 py-2"
                    value={
                      form.resident_id
                    }
                    onChange={(
                      event
                    ) =>
                      selectResident(
                        event
                          .target
                          .value
                      )
                    }
                  >
                    <option value="">
                      Select a resident
                    </option>

                    {residents.map(
                      (
                        resident
                      ) => (
                        <option
                          key={
                            resident.id
                          }
                          value={
                            resident.id
                          }
                        >
                          {
                            resident.full_name
                          }
                          {resident.houses
                            ?.address
                            ? ` — ${resident.houses.address}`
                            : ''}
                        </option>
                      )
                    )}
                  </select>
                </div>

                {selectedResident && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border p-4 text-sm">
                    <div>
                      <span className="text-gray-500">
                        Property Allocation Date
                      </span>

                      <strong className="block mt-1">
                        {displayDate(
                          selectedResident.property_allocation_date
                        )}
                      </strong>
                    </div>

                    <div>
                      <span className="text-gray-500">
                        Move-in Date
                      </span>

                      <strong className="block mt-1">
                        {displayDate(
                          selectedResident.move_in_date
                        )}
                      </strong>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Individual Resident Due Type *
                  </label>

                  <select
                    required
                    className="w-full border rounded-lg px-3 py-2"
                    value={
                      form.due_type_id
                    }
                    onChange={(
                      event
                    ) =>
                      changeForm({
                        due_type_id:
                          event
                            .target
                            .value,
                      })
                    }
                  >
                    <option value="">
                      Select an individual due
                    </option>

                    {residentDueTypes.map(
                      (
                        dueType
                      ) => (
                        <option
                          key={
                            dueType.id
                          }
                          value={
                            dueType.id
                          }
                        >
                          {
                            dueType.name
                          }{' '}
                          —{' '}
                          {naira(
                            Number(
                              dueType.amount
                            )
                          )}{' '}
                          —{' '}
                          {
                            dueType.frequency
                          }
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Billing Start *
                  </label>

                  <DateField
                    required
                    className="w-full border rounded-lg px-3 py-2"
                    value={
                      form.billing_start
                    }
                    onChange={(
                      event
                    ) =>
                      changeForm({
                        billing_start:
                          event
                            .target
                            .value,
                      })
                    }
                  />

                  {selectedResident && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        type="button"
                        className="action secondary"
                        style={{
                          padding:
                            '.45rem .75rem',

                          minHeight:
                            36,

                          fontSize:
                            '.75rem',
                        }}
                        disabled={
                          !selectedResident.property_allocation_date
                        }
                        onClick={() =>
                          changeForm({
                            billing_start:
                              selectedResident.property_allocation_date ??
                              '',
                          })
                        }
                      >
                        Use allocation date
                      </button>

                      <button
                        type="button"
                        className="action secondary"
                        style={{
                          padding:
                            '.45rem .75rem',

                          minHeight:
                            36,

                          fontSize:
                            '.75rem',
                        }}
                        disabled={
                          !selectedResident.move_in_date
                        }
                        onClick={() =>
                          changeForm({
                            billing_start:
                              selectedResident.move_in_date ??
                              '',
                          })
                        }
                      >
                        Use move-in date
                      </button>
                    </div>
                  )}

                  <p className="text-xs text-gray-500 mt-2">
                    You can select any valid start date
                    directly from the calendar.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Billing End *
                  </label>

                  <DateField
                    required
                    className="w-full border rounded-lg px-3 py-2"
                    value={
                      form.end_date
                    }
                    onChange={(
                      event
                    ) =>
                      changeForm({
                        end_date:
                          event
                            .target
                            .value,
                      })
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Due Date *
                  </label>

                  <DateField
                    required
                    className="w-full border rounded-lg px-3 py-2"
                    value={
                      form.due_date
                    }
                    onChange={(
                      event
                    ) =>
                      changeForm({
                        due_date:
                          event
                            .target
                            .value,
                      })
                    }
                  />

                  <p className="text-xs text-gray-500 mt-1">
                    The selected due date is applied to
                    each new personal invoice created from
                    this billing range.
                  </p>
                </div>

                {selectedDueType && (
                  <div className="rounded-lg border p-4 text-sm">
                    <p>
                      <strong>
                        Frequency:
                      </strong>{' '}

                      <span className="capitalize">
                        {
                          selectedDueType.frequency
                        }
                      </span>
                    </p>

                    <p className="mt-1">
                      <strong>
                        Amount per period:
                      </strong>{' '}

                      {naira(
                        Number(
                          selectedDueType.amount
                        )
                      )}
                    </p>

                    <p className="mt-1 text-gray-500">
                      Zadant splits the selected range
                      into monthly, quarterly, yearly,
                      or one-time invoices according to
                      the due type. Period labels are
                      generated automatically.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  disabled={
                    loading
                  }
                  onClick={
                    previewResidentInvoices
                  }
                  className="action secondary disabled:opacity-50"
                >
                  {loading
                    ? 'Preparing...'
                    : 'Preview Invoices'}
                </button>

                {residentPreview && (
                  <div className="border rounded-xl overflow-hidden">
                    <div className="p-4 border-b bg-gray-50">
                      <h2 className="font-semibold">
                        Invoice Preview
                      </h2>

                      <p className="text-sm text-gray-600 mt-1">
                        {
                          residentPreview.resident_name
                        }
                        {' · '}
                        {
                          residentPreview.due_type_name
                        }
                      </p>
                    </div>

                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="p-3 text-left">
                              Period
                            </th>

                            <th className="p-3 text-left">
                              Due date
                            </th>

                            <th className="p-3 text-right">
                              Amount
                            </th>

                            <th className="p-3 text-left">
                              Result
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {residentPreview.periods.map(
                            (
                              period
                            ) => (
                              <tr
                                key={`${period.period_start}-${period.period_end}`}
                                className="border-t"
                              >
                                <td className="p-3">
                                  {
                                    period.period_label
                                  }
                                </td>

                                <td className="p-3">
                                  {displayDate(
                                    period.due_date
                                  )}
                                </td>

                                <td className="p-3 text-right">
                                  {naira(
                                    Number(
                                      period.amount
                                    )
                                  )}
                                </td>

                                <td className="p-3">
                                  {period.already_exists
                                    ? 'Already invoiced — will skip'
                                    : 'Will create'}
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="p-4 border-t bg-gray-50 text-sm">
                      <p>
                        <strong>
                          {
                            residentPreview.create_count
                          }
                        </strong>{' '}
                        new invoice
                        {residentPreview.create_count ===
                        1
                          ? ''
                          : 's'}
                      </p>

                      {residentPreview.duplicate_count >
                        0 && (
                        <p>
                          <strong>
                            {
                              residentPreview.duplicate_count
                            }
                          </strong>{' '}
                          existing period
                          {residentPreview.duplicate_count ===
                          1
                            ? ''
                            : 's'}{' '}
                          will be skipped.
                        </p>
                      )}

                      <p className="mt-2 text-base">
                        Total new billing:{' '}

                        <strong>
                          {naira(
                            Number(
                              residentPreview.total_to_create
                            )
                          )}
                        </strong>
                      </p>
                    </div>

                    <div className="p-4">
                      <button
                        type="button"
                        disabled={
                          loading ||
                          residentPreview.create_count ===
                            0
                        }
                        onClick={
                          generateResidentInvoices
                        }
                        className="action disabled:opacity-50"
                      >
                        {loading
                          ? 'Generating...'
                          : `Generate ${residentPreview.create_count} Invoice${
                              residentPreview.create_count ===
                              1
                                ? ''
                                : 's'
                            }`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="text-red-600 text-sm"
              >
                {
                  error
                }
              </p>
            )}

            {summary && (
              <div className="text-sm bg-green-50 text-green-700 px-4 py-3 rounded-lg">
                <strong>
                  {
                    summary.created
                  }
                </strong>{' '}
                invoice
                {summary.created ===
                1
                  ? ''
                  : 's'}{' '}
                created.

                {summary.skipped >
                  0 && (
                  <>
                    {' '}
                    <strong>
                      {
                        summary.skipped
                      }
                    </strong>{' '}
                    duplicate
                    {summary.skipped ===
                    1
                      ? ''
                      : 's'}{' '}
                    skipped.
                  </>
                )}

                <div className="mt-2">
                  <Link
                    href="/admin/invoices"
                    className="underline font-medium"
                  >
                    View all invoices →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}