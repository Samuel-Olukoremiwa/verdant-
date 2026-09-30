'use client'

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'

import {
  useRouter,
} from 'next/navigation'

import {
  canonicalFrequency,
  freshForm,
  makeHouseRange,
  makeSingleHousePeriod,
  modeFromQuery,
  type BillingMode,
  type DueType,
  type House,
  type HousePreview,
  type InvoiceGenerationForm,
  type Resident,
  type ResidentPreview,
  type Summary,
} from '@/lib/invoice-generation'

import {
  createClient,
} from '@/lib/supabase/client'

export function useInvoiceGeneration() {
  const router =
    useRouter()

  const supabase =
    useMemo(
      () =>
        createClient(),
      []
    )

  const [
    mode,
    setMode,
  ] =
    useState<BillingMode>(
      null
    )

  const [
    loading,
    setLoading,
  ] =
    useState(
      false
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
    summary,
    setSummary,
  ] =
    useState<
      Summary | null
    >(
      null
    )

  const [
    residentPreview,
    setResidentPreview,
  ] =
    useState<
      ResidentPreview | null
    >(
      null
    )

  const [
    housePreview,
    setHousePreview,
  ] =
    useState<
      HousePreview | null
    >(
      null
    )

  const [
    dueTypes,
    setDueTypes,
  ] =
    useState<
      DueType[]
    >(
      []
    )

  const [
    houses,
    setHouses,
  ] =
    useState<
      House[]
    >(
      []
    )

  const [
    residents,
    setResidents,
  ] =
    useState<
      Resident[]
    >(
      []
    )

  const [
    selectedHouseId,
    setSelectedHouseId,
  ] =
    useState(
      ''
    )

  const [
    form,
    setForm,
  ] =
    useState<
      InvoiceGenerationForm
    >(
      freshForm
    )

  useEffect(
    () => {
      const timer =
        window.setTimeout(
          () => {
            const params =
              new URLSearchParams(
                window.location
                  .search
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
              ) ??
              ''

            const requestedResident =
              params.get(
                'resident'
              ) ??
              ''

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
    },
    []
  )

  useEffect(
    () => {
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

        if (
          !active
        ) {
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
    },
    [
      supabase,
    ]
  )

  const houseDueTypes =
    useMemo(
      () =>
        dueTypes.filter(
          (
            dueType
          ) =>
            dueType
              .billing_scope ===
            'house'
        ),
      [
        dueTypes,
      ]
    )

  const residentDueTypes =
    useMemo(
      () =>
        dueTypes.filter(
          (
            dueType
          ) =>
            dueType
              .billing_scope ===
            'resident'
        ),
      [
        dueTypes,
      ]
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
      InvoiceGenerationForm
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

  function selectHouse(
    houseId:
      string
  ) {
    setSelectedHouseId(
      houseId
    )

    resetResultState()
  }

  function selectResident(
    residentId:
      string
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

  function resetBillingMode() {
    setMode(
      null
    )

    setSelectedHouseId(
      ''
    )

    setForm(
      freshForm()
    )

    resetResultState()
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

    return {
      dueTypeId:
        selectedDueType.id,

      period:
        allHouseholdPeriod,

      dueDate:
        form.due_date,
    }
  }

  async function generateAllHouseholds(
    event:
      FormEvent
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
      const values =
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
              values.dueTypeId,

            p_period_start:
              values.period
                .start,

            p_period_end:
              values.period
                .end,

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

  return {
    mode,
    loading,
    error,
    summary,

    form,

    houses,
    residents,

    houseDueTypes,
    residentDueTypes,

    selectedHouseId,
    selectedHouse,
    selectedResident,
    selectedDueType,

    houseFrequency,
    allHouseholdPeriod,
    selectedHouseRange,

    housePreview,
    residentPreview,

    chooseMode,
    resetBillingMode,
    changeForm,
    selectHouse,
    selectResident,

    generateAllHouseholds,
    previewSingleHousehold,
    generateSingleHousehold,
    previewResidentInvoices,
    generateResidentInvoices,
  }
}