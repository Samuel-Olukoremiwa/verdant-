import Link from 'next/link'

import {
  notFound,
} from 'next/navigation'

import {
  PrintButton,
} from '@/components/print-button'

import {
  requireRole,
} from '@/lib/auth'

import {
  formatDateTimeGb,
} from '@/lib/date-format'

import {
  createClient,
} from '@/lib/supabase/server'

const naira = (
  amount: number
) =>
  `₦${amount.toLocaleString(
    'en-NG',
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }
  )}`

type Resident = {
  id: string

  resident_code: string

  full_name: string

  houses:
    | {
        address: string
      }
    | null
}

type PaymentTransaction = {
  id: string

  payment_code: string

  reference: string

  resident_id: string

  provider:
    | 'paystack'
    | 'manual'

  amount: number

  currency: string

  status:
    | 'pending'
    | 'success'
    | 'failed'

  paid_at:
    | string
    | null

  created_at: string
}

type InvoiceDetails = {
  period_label:
    | string
    | null

  due_types:
    | {
        name: string
      }
    | null
}

type PaymentAllocation = {
  id: string

  amount: number

  invoices:
    | InvoiceDetails
    | null
}

type LegacyPaymentLink = {
  transaction_id:
    | string
    | null

  resident_id: string
}

function allocationDescription(
  allocation:
    PaymentAllocation
) {
  const invoice =
    allocation.invoices

  const name =
    invoice
      ?.due_types
      ?.name ??
    'Estate charge'

  if (
    invoice
      ?.period_label
  ) {
    return `${name} — ${invoice.period_label}`
  }

  return name
}

export default async function ReceiptPage({
  params,
}: {
  params:
    Promise<{
      id: string
    }>
}) {
  const {
    id,
  } =
    await params

  const user =
    await requireRole(
      [
        'resident',
      ]
    )

  const supabase =
    await createClient()

  const {
    data:
      residentRow,
  } =
    await supabase
      .from(
        'residents'
      )
      .select(
        'id, resident_code, full_name, houses:houses!residents_house_id_fkey ( address )'
      )
      .eq(
        'auth_user_id',
        user.id
      )
      .eq(
        'is_active',
        true
      )
      .maybeSingle()

  const resident =
    residentRow as unknown as
      | Resident
      | null

  if (
    !resident
  ) {
    notFound()
  }

  const {
    data:
      directTransactionRow,
  } =
    await supabase
      .from(
        'payment_transactions'
      )
      .select(
        'id, payment_code, reference, resident_id, provider, amount, currency, status, paid_at, created_at'
      )
      .eq(
        'id',
        id
      )
      .eq(
        'resident_id',
        resident.id
      )
      .maybeSingle()

  let transaction =
    directTransactionRow as unknown as
      | PaymentTransaction
      | null

  /*
   * Backward compatibility:
   *
   * Before Phase 6B, receipt URLs used payments.id.
   *
   * Old receipt links are therefore resolved from the
   * historical allocation row to the canonical transaction.
   */
  if (
    !transaction
  ) {
    const {
      data:
        legacyRow,
    } =
      await supabase
        .from(
          'payments'
        )
        .select(
          'transaction_id, resident_id'
        )
        .eq(
          'id',
          id
        )
        .eq(
          'resident_id',
          resident.id
        )
        .maybeSingle()

    const legacyPayment =
      legacyRow as unknown as
        | LegacyPaymentLink
        | null

    if (
      legacyPayment
        ?.transaction_id
    ) {
      const {
        data:
          resolvedTransactionRow,
      } =
        await supabase
          .from(
            'payment_transactions'
          )
          .select(
            'id, payment_code, reference, resident_id, provider, amount, currency, status, paid_at, created_at'
          )
          .eq(
            'id',
            legacyPayment.transaction_id
          )
          .eq(
            'resident_id',
            resident.id
          )
          .maybeSingle()

      transaction =
        resolvedTransactionRow as unknown as
          | PaymentTransaction
          | null
    }
  }

  if (
    !transaction ||
    transaction.resident_id !==
      resident.id ||
    transaction.status !==
      'success'
  ) {
    notFound()
  }

  const {
    data:
      allocationRows,
    error:
      allocationError,
  } =
    await supabase
      .from(
        'payments'
      )
      .select(
        'id, amount, invoices ( period_label, due_types ( name ) )'
      )
      .eq(
        'transaction_id',
        transaction.id
      )
      .eq(
        'resident_id',
        resident.id
      )
      .order(
        'created_at',
        {
          ascending:
            true,
        }
      )

  if (
    allocationError
  ) {
    throw new Error(
      'Could not load receipt details'
    )
  }

  const allocations =
    (
      allocationRows ??
      []
    ) as unknown as
      PaymentAllocation[]

  if (
    allocations.length ===
    0
  ) {
    notFound()
  }

  const house =
    resident.houses

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between gap-4 mb-4 print:hidden">
        <Link
          href="/portal/payments"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Payment history
        </Link>

        <PrintButton />
      </div>

      <div className="bg-white border rounded-xl shadow p-8">
        <div className="flex justify-between items-start gap-6 mb-8 border-b pb-6">
          <div>
            <h1 className="text-xl font-bold">
              Zadant
            </h1>

            <p className="text-sm text-gray-500">
              Sample estate, Lagos
            </p>
          </div>

          <div className="text-right">
            <p className="text-sm text-gray-500">
              Receipt
            </p>

            <p className="font-mono text-sm font-semibold">
              {
                transaction.payment_code
              }
            </p>

            <p className="text-xs text-gray-500 mt-1 break-all">
              {transaction.provider ===
              'manual'
                ? 'Reference'
                : 'Gateway ref'}
              :{' '}
              {
                transaction.reference
              }
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8 text-sm">
          <div>
            <p className="text-gray-500">
              Paid by
            </p>

            <p className="font-medium">
              {
                resident.full_name
              }
            </p>
          </div>

          <div>
            <p className="text-gray-500">
              Resident ID
            </p>

            <p className="font-mono font-medium">
              {
                resident.resident_code
              }
            </p>
          </div>

          <div>
            <p className="text-gray-500">
              Residence
            </p>

            <p className="font-medium">
              {
                house?.address ??
                '—'
              }
            </p>
          </div>

          <div>
            <p className="text-gray-500">
              Date paid
            </p>

            <p className="font-medium">
              {transaction.paid_at
                ? formatDateTimeGb(
                    transaction.paid_at
                  )
                : '—'}
            </p>
          </div>

          <div>
            <p className="text-gray-500">
              Payment method
            </p>

            <p className="font-medium">
              {transaction.provider ===
              'manual'
                ? 'Recorded by estate office'
                : 'Paystack'}
            </p>
          </div>

          <div>
            <p className="text-gray-500">
              Status
            </p>

            <p className="font-medium text-green-700">
              Paid
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm mb-8">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="text-left pb-2 font-normal">
                  Description
                </th>

                <th className="text-right pb-2 font-normal">
                  Amount
                </th>
              </tr>
            </thead>

            <tbody>
              {allocations.map(
                (
                  allocation
                ) => (
                  <tr
                    key={
                      allocation.id
                    }
                    className="border-b"
                  >
                    <td className="py-3 pr-4">
                      {allocationDescription(
                        allocation
                      )}
                    </td>

                    <td className="py-3 text-right whitespace-nowrap">
                      {naira(
                        Number(
                          allocation.amount
                        )
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>

            <tfoot>
              <tr>
                <td className="pt-4 font-semibold">
                  Total Paid
                </td>

                <td className="pt-4 text-right font-semibold whitespace-nowrap">
                  {naira(
                    Number(
                      transaction.amount
                    )
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {allocations.length >
          1 && (
          <p className="text-xs text-gray-500 mb-6">
            This payment was allocated across{' '}
            {
              allocations.length
            }{' '}
            invoice items.
          </p>
        )}

        <p className="text-xs text-gray-400 text-center pt-6 border-t">
          This receipt was generated automatically and confirms a successful payment{' '}
          {transaction.provider ===
          'manual'
            ? 'recorded by the estate office.'
            : 'via Paystack.'}
        </p>
      </div>
    </div>
  )
}

export const metadata = {
  title:
    'Portal Payments Receipt',

  description:
    'Manage your estate account and workspace with Zadant.',

  robots: {
    index:
      false,

    follow:
      false,
  },
}