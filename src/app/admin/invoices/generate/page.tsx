'use client'

import Link from 'next/link'

import {
  InvoiceHouseholdControls,
} from '@/components/invoice-household-controls'

import {
  InvoiceResidentControls,
} from '@/components/invoice-resident-controls'

import {
  useInvoiceGeneration,
} from '@/hooks/use-invoice-generation'

export default function GenerateInvoicesPage() {
  const {
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
  } =
    useInvoiceGeneration()

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
            {mode !==
              'resident' && (
              <InvoiceHouseholdControls
                mode={
                  mode
                }
                houses={
                  houses
                }
                houseDueTypes={
                  houseDueTypes
                }
                selectedHouseId={
                  selectedHouseId
                }
                selectedHouse={
                  selectedHouse
                }
                selectedDueType={
                  selectedDueType
                }
                frequency={
                  houseFrequency
                }
                form={
                  form
                }
                allHouseholdPeriod={
                  allHouseholdPeriod
                }
                selectedHouseRange={
                  selectedHouseRange
                }
                housePreview={
                  housePreview
                }
                loading={
                  loading
                }
                onSelectHouse={
                  selectHouse
                }
                onChange={
                  changeForm
                }
                onGenerateAll={
                  generateAllHouseholds
                }
                onPreviewHouse={
                  previewSingleHousehold
                }
                onGenerateHouse={
                  generateSingleHousehold
                }
              />
            )}

            {mode ===
              'resident' && (
              <InvoiceResidentControls
                residents={
                  residents
                }
                residentDueTypes={
                  residentDueTypes
                }
                selectedResident={
                  selectedResident
                }
                selectedDueType={
                  selectedDueType
                }
                form={
                  form
                }
                loading={
                  loading
                }
                preview={
                  residentPreview
                }
                onChange={
                  changeForm
                }
                onSelectResident={
                  selectResident
                }
                onPreview={
                  previewResidentInvoices
                }
                onGenerate={
                  generateResidentInvoices
                }
              />
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