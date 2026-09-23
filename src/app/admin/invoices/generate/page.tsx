'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  useRouter,
} from 'next/navigation'
import {
  createClient,
} from '@/lib/supabase/client'
import Link from 'next/link'

type DueType = {
  id: string
  name: string
  amount: number
  frequency: string
  billing_scope:
    | 'house'
    | 'resident'
}

type Resident = {
  id: string
  full_name: string
  move_in_date:
    | string
    | null
  property_allocation_date:
    | string
    | null
  houses:
    | {
        address: string
      }
    | null
}

type PreviewPeriod = {
  period_start: string
  period_end: string
  period_label: string
  due_date: string
  amount: number
  already_exists: boolean
}

type Preview = {
  resident_id: string
  resident_name: string
  due_type_id: string
  due_type_name: string
  frequency: string
  amount_per_period: number
  periods:
    PreviewPeriod[]
  create_count: number
  duplicate_count: number
  total_to_create: number
}

type Summary = {
  created: number
  skipped: number
}

const naira = (
  value: number
) =>
  `₦${value.toLocaleString(
    'en-NG'
  )}`

function displayDate(
  value:
    | string
    | null
) {
  if (!value) {
    return '—'
  }

  const parts =
    value
      .slice(0, 10)
      .split('-')

  if (
    parts.length !==
    3
  ) {
    return value
  }

  return [
    parts[2],
    parts[1],
    parts[0],
  ].join('/')
}

export default function GenerateInvoicesPage() {
  const router =
    useRouter()

  const supabase =
    useMemo(
      () =>
        createClient(),
      []
    )

  const [
    loading,
    setLoading,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null)

  const [
    summary,
    setSummary,
  ] = useState<
    Summary | null
  >(null)

  const [
    preview,
    setPreview,
  ] = useState<
    Preview | null
  >(null)

  const [
    dueTypes,
    setDueTypes,
  ] = useState<
    DueType[]
  >([])

  const [
    residents,
    setResidents,
  ] = useState<
    Resident[]
  >([])

  const [
    form,
    setForm,
  ] = useState({
    due_type_id: '',
    period_label: '',
    due_date: '',
    resident_id: '',
    start_basis:
      'allocation',
    custom_start: '',
    end_date: '',
  })

  useEffect(() => {
    async function load() {
      const [
        dueResult,
        residentResult,
      ] =
        await Promise.all([
          supabase
            .from(
              'due_types'
            )
            .select(`
              id,
              name,
              amount,
              frequency,
              billing_scope
            `)
            .order(
              'name'
            ),

          supabase
            .from(
              'residents'
            )
            .select(`
              id,
              full_name,
              move_in_date,
              property_allocation_date,
              houses:houses!residents_house_id_fkey (
                address
              )
            `)
            .order(
              'full_name'
            ),
        ])

      if (
        dueResult.error
      ) {
        setError(
          dueResult.error
            .message
        )
      } else {
        setDueTypes(
          (
            dueResult.data ??
            []
          ) as unknown as
            DueType[]
        )
      }

      if (
        residentResult.error
      ) {
        setError(
          residentResult
            .error.message
        )
      } else {
        setResidents(
          (
            residentResult
              .data ??
            []
          ) as unknown as
            Resident[]
        )
      }
    }

    void load()
  }, [supabase])

  const selectedDueType =
    dueTypes.find(
      (dueType) =>
        dueType.id ===
        form.due_type_id
    )

  const selectedResident =
    residents.find(
      (resident) =>
        resident.id ===
        form.resident_id
    )

  const resolvedStart =
    form.start_basis ===
    'allocation'
      ? selectedResident
          ?.property_allocation_date ??
        ''
      : form.start_basis ===
          'move'
        ? selectedResident
            ?.move_in_date ??
          ''
        : form.custom_start

  function changeForm(
    next:
      Partial<
        typeof form
      >
  ) {
    setForm(
      (current) => ({
        ...current,
        ...next,
      })
    )

    setPreview(null)
    setSummary(null)
    setError(null)
  }

  async function generateHouseInvoices(
    event:
      React.FormEvent
  ) {
    event.preventDefault()

    if (
      !selectedDueType ||
      selectedDueType
        .billing_scope !==
        'house'
    ) {
      setError(
        'Select a Household / Property due type.'
      )
      return
    }

    setLoading(true)
    setError(null)
    setSummary(null)

    try {
      const {
        data,
        error:
          generateError,
      } =
        await supabase.rpc(
          'generate_house_invoices',
          {
            p_due_type:
              selectedDueType.id,

            p_period_label:
              form.period_label,

            p_due_date:
              form.due_date ||
              null,
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
      setLoading(false)
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
      !resolvedStart
    ) {
      if (
        form.start_basis ===
        'allocation'
      ) {
        throw new Error(
          'This resident does not have a Property Allocation Date. Choose Move-in Date or Custom Date.'
        )
      }

      if (
        form.start_basis ===
        'move'
      ) {
        throw new Error(
          'This resident does not have a Move-in Date. Choose Property Allocation Date or Custom Date.'
        )
      }

      throw new Error(
        'Choose a billing start date.'
      )
    }

    if (
      !form.end_date
    ) {
      throw new Error(
        'Choose a billing end date.'
      )
    }

    if (
      resolvedStart >
      form.end_date
    ) {
      throw new Error(
        'The billing end date cannot be before the start date.'
      )
    }

    return {
      residentId:
        selectedResident.id,

      dueTypeId:
        selectedDueType.id,

      start:
        resolvedStart,

      end:
        form.end_date,
    }
  }

  async function previewResidentInvoices() {
    setLoading(true)
    setError(null)
    setSummary(null)

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
          }
        )

      if (
        previewError
      ) {
        throw previewError
      }

      setPreview(
        data as Preview
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
      setLoading(false)
    }
  }

  async function generateResidentInvoices() {
    setLoading(true)
    setError(null)

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

      setPreview(null)

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
      setLoading(false)
    }
  }

  return (
    <div className="page-wrap max-w-3xl">
      <span className="eyebrow">
        Dues & billing
      </span>

      <h1 className="page-title">
        Generate invoices
      </h1>

      <p className="page-lead mb-8">
        Household charges are
        issued once per property.
        Individual Resident
        charges are issued only
        to the selected resident.
      </p>

      <div className="form-card space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">
            Due Type *
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
              Select a due
              type
            </option>

            {dueTypes.map(
              (dueType) => (
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
                  }
                  {' — '}
                  {dueType.billing_scope ===
                  'resident'
                    ? 'Individual Resident'
                    : 'Household / Property'}
                  {' — '}
                  {naira(
                    Number(
                      dueType.amount
                    )
                  )}
                </option>
              )
            )}
          </select>
        </div>

        {selectedDueType?.billing_scope ===
          'house' && (
          <form
            onSubmit={
              generateHouseInvoices
            }
            className="space-y-5"
          >
            <div className="rounded-lg border bg-gray-50 p-4 text-sm">
              <strong>
                Household /
                Property charge
              </strong>

              <p className="mt-1 text-gray-600">
                One invoice
                will be created
                per house.
                Multiple
                residents in the
                same house will
                not create
                duplicate bills.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Period Label *
              </label>

              <input
                required
                className="w-full border rounded-lg px-3 py-2"
                placeholder="e.g. October 2026"
                value={
                  form
                    .period_label
                }
                onChange={(
                  event
                ) =>
                  changeForm({
                    period_label:
                      event
                        .target
                        .value,
                  })
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Due Date
              </label>

              <input
                type="date"
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
            </div>

            <button
              type="submit"
              disabled={
                loading
              }
              className="action disabled:opacity-50"
            >
              {loading
                ? 'Generating...'
                : 'Generate for All Houses'}
            </button>
          </form>
        )}

        {selectedDueType?.billing_scope ===
          'resident' && (
          <div className="space-y-5">
            <div className="rounded-lg border bg-gray-50 p-4 text-sm">
              <strong>
                Individual
                Resident charge
              </strong>

              <p className="mt-1 text-gray-600">
                This charge
                belongs only to
                the resident
                selected below.
                It will not be
                copied to other
                people in the
                same house.
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
                  form
                    .resident_id
                }
                onChange={(
                  event
                ) =>
                  changeForm({
                    resident_id:
                      event
                        .target
                        .value,
                  })
                }
              >
                <option value="">
                  Select a
                  resident
                </option>

                {residents.map(
                  (resident) => (
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
                      {resident
                        .houses
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
                    Property
                    Allocation
                    Date
                  </span>

                  <strong className="block mt-1">
                    {displayDate(
                      selectedResident
                        .property_allocation_date
                    )}
                  </strong>
                </div>

                <div>
                  <span className="text-gray-500">
                    Move-in Date
                  </span>

                  <strong className="block mt-1">
                    {displayDate(
                      selectedResident
                        .move_in_date
                    )}
                  </strong>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">
                Start Billing
                From *
              </label>

              <select
                className="w-full border rounded-lg px-3 py-2"
                value={
                  form
                    .start_basis
                }
                onChange={(
                  event
                ) =>
                  changeForm({
                    start_basis:
                      event
                        .target
                        .value,
                  })
                }
              >
                <option value="allocation">
                  Property
                  Allocation Date
                </option>

                <option value="move">
                  Move-in Date
                </option>

                <option value="custom">
                  Custom Date
                </option>
              </select>
            </div>

            {form.start_basis ===
              'custom' && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Custom Start
                  Date *
                </label>

                <input
                  type="date"
                  required
                  className="w-full border rounded-lg px-3 py-2"
                  value={
                    form
                      .custom_start
                  }
                  onChange={(
                    event
                  ) =>
                    changeForm({
                      custom_start:
                        event
                          .target
                          .value,
                    })
                  }
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">
                Billing Start
              </label>

              <input
                type="date"
                readOnly
                className="w-full border rounded-lg px-3 py-2 bg-gray-50"
                value={
                  resolvedStart
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Billing End *
              </label>

              <input
                type="date"
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

            <div className="rounded-lg border p-4 text-sm">
              <p>
                <strong>
                  Frequency:
                </strong>{' '}
                {
                  selectedDueType.frequency
                }
              </p>

              <p className="mt-1">
                <strong>
                  Amount per
                  period:
                </strong>{' '}
                {naira(
                  Number(
                    selectedDueType.amount
                  )
                )}
              </p>

              <p className="mt-1 text-gray-500">
                The final
                partial period,
                if any, uses the
                configured full
                amount. Verdant
                does not
                automatically
                prorate charges.
              </p>
            </div>

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

            {preview && (
              <div className="border rounded-xl overflow-hidden">
                <div className="p-4 border-b bg-gray-50">
                  <h2 className="font-semibold">
                    Invoice Preview
                  </h2>

                  <p className="text-sm text-gray-600 mt-1">
                    {
                      preview.resident_name
                    }
                    {' · '}
                    {
                      preview.due_type_name
                    }
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="p-3 text-left">
                          Period
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
                      {preview.periods.map(
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
                        preview.create_count
                      }
                    </strong>{' '}
                    new invoice
                    {preview.create_count ===
                    1
                      ? ''
                      : 's'}
                  </p>

                  {preview.duplicate_count >
                    0 && (
                    <p>
                      <strong>
                        {
                          preview.duplicate_count
                        }
                      </strong>{' '}
                      existing
                      period
                      {preview.duplicate_count ===
                      1
                        ? ''
                        : 's'}{' '}
                      will be
                      skipped.
                    </p>
                  )}

                  <p className="mt-2 text-base">
                    Total new
                    billing:{' '}
                    <strong>
                      {naira(
                        Number(
                          preview.total_to_create
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
                      preview.create_count ===
                        0
                    }
                    onClick={
                      generateResidentInvoices
                    }
                    className="action disabled:opacity-50"
                  >
                    {loading
                      ? 'Generating...'
                      : `Generate ${preview.create_count} Invoice${preview.create_count === 1 ? '' : 's'}`}
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
            {error}
          </p>
        )}

        {summary && (
          <div className="text-sm bg-green-50 text-green-700 px-4 py-3 rounded-lg">
            <strong>
              {summary.created}
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
                View all
                invoices →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}