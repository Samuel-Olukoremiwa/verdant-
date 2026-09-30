'use client'

import {
  DateField,
} from '@/components/date-field'

import {
  InvoiceGenerationPreview,
} from '@/components/invoice-generation-preview'

import {
  InvoiceHouseholdSelector,
} from '@/components/invoice-household-selector'

import {
  InvoicePeriodControls,
} from '@/components/invoice-period-controls'

import {
  displayDate,
  naira,
  type DueType,
  type House,
  type HousePeriod,
  type HousePreview,
  type HouseRange,
  type InvoiceGenerationForm,
} from '@/lib/invoice-generation'

type Props = {
  mode:
    | 'all-households'
    | 'household'

  houses:
    House[]

  houseDueTypes:
    DueType[]

  selectedHouseId:
    string

  selectedHouse:
    House | undefined

  selectedDueType:
    DueType | undefined

  frequency:
    string | null

  form:
    InvoiceGenerationForm

  allHouseholdPeriod:
    HousePeriod | null

  selectedHouseRange:
    HouseRange | null

  housePreview:
    HousePreview | null

  loading:
    boolean

  onSelectHouse:
    (
      houseId: string
    ) => void

  onChange:
    (
      next:
        Partial<InvoiceGenerationForm>
    ) => void

  onGenerateAll:
    (
      event:
        React.FormEvent
    ) => void

  onPreviewHouse:
    () => void

  onGenerateHouse:
    () => void
}

export function InvoiceHouseholdControls({
  mode,
  houses,
  houseDueTypes,
  selectedHouseId,
  selectedHouse,
  selectedDueType,
  frequency,
  form,
  allHouseholdPeriod,
  selectedHouseRange,
  housePreview,
  loading,
  onSelectHouse,
  onChange,
  onGenerateAll,
  onPreviewHouse,
  onGenerateHouse,
}: Props) {
  return (
    <>
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
        <InvoiceHouseholdSelector
          houses={
            houses
          }
          selectedHouseId={
            selectedHouseId
          }
          onSelect={
            onSelectHouse
          }
        />
      )}

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
              onChange({
                due_type_id:
                  event.target
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
                  selectedDueType
                    .amount
                )
              )}
            </p>

            <p className="mt-1 capitalize">
              <strong>
                Frequency:
              </strong>{' '}

              {
                selectedDueType
                  .frequency
              }
            </p>
          </div>
        )}

        {selectedDueType &&
          mode ===
            'all-households' && (
            <InvoicePeriodControls
              mode="all-households"
              frequency={
                frequency
              }
              form={
                form
              }
              onChange={
                onChange
              }
              singlePeriod={
                allHouseholdPeriod
              }
              range={
                null
              }
            />
          )}

        {selectedDueType &&
          mode ===
            'household' && (
            <InvoicePeriodControls
              mode="household"
              frequency={
                frequency
              }
              form={
                form
              }
              onChange={
                onChange
              }
              singlePeriod={
                null
              }
              range={
                selectedHouseRange
              }
            />
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
              onChange({
                due_date:
                  event.target
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
                      selectedDueType
                        .name
                    }
                  </dd>
                </div>

                <div>
                  <dt className="text-gray-500">
                    Period
                  </dt>

                  <dd className="font-semibold mt-1">
                    {
                      allHouseholdPeriod
                        .label
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
                        selectedDueType
                          .amount
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
                        selectedDueType
                          .amount
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
              onGenerateAll
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
                onPreviewHouse
              }
              className="action secondary disabled:opacity-50"
            >
              {loading
                ? 'Preparing...'
                : 'Preview Household Invoices'}
            </button>

            {housePreview && (
              <InvoiceGenerationPreview
                title="Household Invoice Preview"
                subtitle={`${housePreview.address} · ${housePreview.due_type_name}`}
                billingContact={
                  housePreview
                    .billing_contact_name
                }
                periods={
                  housePreview
                    .periods
                }
                createCount={
                  housePreview
                    .create_count
                }
                duplicateCount={
                  housePreview
                    .duplicate_count
                }
                totalToCreate={
                  housePreview
                    .total_to_create
                }
                loading={
                  loading
                }
                onGenerate={
                  onGenerateHouse
                }
              />
            )}
          </div>
        )}
      </div>
    </>
  )
}