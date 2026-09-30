'use client'

import {
  DateField,
} from '@/components/date-field'

import {
  InvoiceGenerationPreview,
} from '@/components/invoice-generation-preview'

import {
  displayDate,
  naira,
  type DueType,
  type InvoiceGenerationForm,
  type Resident,
  type ResidentPreview,
} from '@/lib/invoice-generation'

export function InvoiceResidentControls({
  residents,
  residentDueTypes,
  selectedResident,
  selectedDueType,
  form,
  loading,
  preview,
  onChange,
  onSelectResident,
  onPreview,
  onGenerate,
}: {
  residents:
    Resident[]

  residentDueTypes:
    DueType[]

  selectedResident:
    Resident | undefined

  selectedDueType:
    DueType | undefined

  form:
    InvoiceGenerationForm

  loading:
    boolean

  preview:
    ResidentPreview | null

  onChange:
    (
      next:
        Partial<InvoiceGenerationForm>
    ) => void

  onSelectResident:
    (
      residentId: string
    ) => void

  onPreview:
    () => void

  onGenerate:
    () => void
}) {
  return (
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
            onSelectResident(
              event.target
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
            onChange({
              due_type_id:
                event.target
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
            onChange({
              billing_start:
                event.target
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
                !selectedResident
                  .property_allocation_date
              }
              onClick={() =>
                onChange({
                  billing_start:
                    selectedResident
                      .property_allocation_date ??
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
                !selectedResident
                  .move_in_date
              }
              onClick={() =>
                onChange({
                  billing_start:
                    selectedResident
                      .move_in_date ??
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
            onChange({
              end_date:
                event.target
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
            onChange({
              due_date:
                event.target
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
                selectedDueType
                  .frequency
              }
            </span>
          </p>

          <p className="mt-1">
            <strong>
              Amount per period:
            </strong>{' '}

            {naira(
              Number(
                selectedDueType
                  .amount
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
          onPreview
        }
        className="action secondary disabled:opacity-50"
      >
        {loading
          ? 'Preparing...'
          : 'Preview Invoices'}
      </button>

      {preview && (
        <InvoiceGenerationPreview
          title="Invoice Preview"
          subtitle={`${preview.resident_name} · ${preview.due_type_name}`}
          periods={
            preview.periods
          }
          createCount={
            preview.create_count
          }
          duplicateCount={
            preview.duplicate_count
          }
          totalToCreate={
            preview.total_to_create
          }
          loading={
            loading
          }
          onGenerate={
            onGenerate
          }
        />
      )}
    </div>
  )
}