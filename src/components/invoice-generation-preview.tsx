import {
  displayDate,
  naira,
  type PreviewPeriod,
} from '@/lib/invoice-generation'

type Props = {
  title: string

  subtitle: string

  billingContact?:
    | string
    | null

  periods:
    PreviewPeriod[]

  createCount:
    number

  duplicateCount:
    number

  totalToCreate:
    number

  loading:
    boolean

  onGenerate:
    () => void
}

export function InvoiceGenerationPreview({
  title,
  subtitle,
  billingContact,
  periods,
  createCount,
  duplicateCount,
  totalToCreate,
  loading,
  onGenerate,
}: Props) {
  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="p-4 border-b bg-gray-50">
        <h2 className="font-semibold">
          {title}
        </h2>

        <p className="text-sm text-gray-600 mt-1">
          {subtitle}
        </p>

        {billingContact !==
          undefined && (
          <p className="text-xs text-gray-500 mt-1">
            Billing contact:{' '}
            {billingContact ??
              'Not assigned'}
          </p>
        )}
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
            {periods.map(
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
              createCount
            }
          </strong>{' '}
          new invoice
          {createCount ===
          1
            ? ''
            : 's'}
        </p>

        {duplicateCount >
          0 && (
          <p>
            <strong>
              {
                duplicateCount
              }
            </strong>{' '}
            existing period
            {duplicateCount ===
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
                totalToCreate
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
            createCount ===
              0
          }
          onClick={
            onGenerate
          }
          className="action disabled:opacity-50"
        >
          {loading
            ? 'Generating...'
            : `Generate ${createCount} Invoice${
                createCount ===
                1
                  ? ''
                  : 's'
              }`}
        </button>
      </div>
    </div>
  )
}