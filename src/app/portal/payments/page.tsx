import Link from 'next/link'

import {
  requireRole,
} from '@/lib/auth'

import {
  formatDateGb,
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
  transaction_id: string

  amount: number

  invoices:
    | InvoiceDetails
    | null
}

type PaymentTransaction = {
  id: string

  payment_code: string

  reference: string

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

function transactionDescription(
  allocations:
    PaymentAllocation[]
) {
  if (
    allocations.length ===
    0
  ) {
    return 'Estate payment'
  }

  const first =
    allocationDescription(
      allocations[0]
    )

  if (
    allocations.length ===
    1
  ) {
    return first
  }

  return (
    `${first} + ` +
    `${allocations.length - 1} more`
  )
}

function statusLabel(
  status:
    PaymentTransaction['status']
) {
  if (
    status ===
    'success'
  ) {
    return 'Paid'
  }

  if (
    status ===
    'pending'
  ) {
    return 'Pending'
  }

  return 'Failed'
}

function statusClass(
  status:
    PaymentTransaction['status']
) {
  if (
    status ===
    'success'
  ) {
    return (
      'bg-green-100 ' +
      'text-green-700'
    )
  }

  if (
    status ===
    'pending'
  ) {
    return (
      'bg-yellow-100 ' +
      'text-yellow-700'
    )
  }

  return (
    'bg-red-100 ' +
    'text-red-700'
  )
}

export default async function PaymentHistoryPage() {
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
        'id'
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
    residentRow as
      | {
          id: string
        }
      | null

  if (
    !resident
  ) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">
            Payment History
          </h1>

          <Link
            href="/portal"
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to portal
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow border p-6 text-center text-gray-500">
          Resident account unavailable.
        </div>
      </div>
    )
  }

  const {
    data:
      transactionRows,
    error:
      transactionError,
  } =
    await supabase
      .from(
        'payment_transactions'
      )
      .select(
        'id, payment_code, reference, provider, amount, currency, status, paid_at, created_at'
      )
      .eq(
        'resident_id',
        resident.id
      )
      .order(
        'created_at',
        {
          ascending:
            false,
        }
      )

  if (
    transactionError
  ) {
    throw new Error(
      'Could not load payment history'
    )
  }

  const transactions =
    (
      transactionRows ??
      []
    ) as unknown as
      PaymentTransaction[]

  const transactionIds =
    transactions.map(
      (
        transaction
      ) =>
        transaction.id
    )

  let allocations:
    PaymentAllocation[] =
      []

  if (
    transactionIds.length >
    0
  ) {
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
          'transaction_id, amount, invoices ( period_label, due_types ( name ) )'
        )
        .in(
          'transaction_id',
          transactionIds
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
        'Could not load payment details'
      )
    }

    allocations =
      (
        allocationRows ??
        []
      ) as unknown as
        PaymentAllocation[]
  }

  const allocationsByTransaction =
    new Map<
      string,
      PaymentAllocation[]
    >()

  for (
    const allocation
    of allocations
  ) {
    const existing =
      allocationsByTransaction.get(
        allocation.transaction_id
      ) ??
      []

    existing.push(
      allocation
    )

    allocationsByTransaction.set(
      allocation.transaction_id,
      existing
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            Payment History
          </h1>

          <p className="text-sm text-gray-500 mt-1">
            Each row represents one payment transaction.
          </p>
        </div>

        <Link
          href="/portal"
          className="text-sm text-blue-600 hover:underline shrink-0"
        >
          ← Back to portal
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm text-left">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="p-3">
                  Payment ID
                </th>

                <th className="p-3">
                  Date
                </th>

                <th className="p-3">
                  Description
                </th>

                <th className="p-3">
                  Amount
                </th>

                <th className="p-3">
                  Status
                </th>

                <th className="p-3" />
              </tr>
            </thead>

            <tbody>
              {transactions.length >
              0 ? (
                transactions.map(
                  (
                    transaction
                  ) => {
                    const transactionAllocations =
                      allocationsByTransaction.get(
                        transaction.id
                      ) ??
                      []

                    return (
                      <tr
                        key={
                          transaction.id
                        }
                        className="border-t align-top"
                      >
                        <td className="p-3">
                          <div className="font-mono text-xs font-medium">
                            {
                              transaction.payment_code
                            }
                          </div>

                          <div className="text-[11px] text-gray-400 mt-1">
                            {
                              transaction.provider ===
                              'manual'
                                ? 'Manual'
                                : 'Paystack'
                            }
                          </div>
                        </td>

                        <td className="p-3 whitespace-nowrap">
                          {formatDateGb(
                            transaction.paid_at ??
                              transaction.created_at
                          )}
                        </td>

                        <td className="p-3">
                          {transactionDescription(
                            transactionAllocations
                          )}

                          {transactionAllocations.length >
                            1 && (
                            <div className="text-xs text-gray-400 mt-1">
                              {
                                transactionAllocations.length
                              }{' '}
                              invoice items
                            </div>
                          )}
                        </td>

                        <td className="p-3 whitespace-nowrap font-medium">
                          {naira(
                            Number(
                              transaction.amount
                            )
                          )}
                        </td>

                        <td className="p-3">
                          <span
                            className={
                              `inline-flex px-2 py-1 rounded-full text-xs font-medium ` +
                              statusClass(
                                transaction.status
                              )
                            }
                          >
                            {statusLabel(
                              transaction.status
                            )}
                          </span>
                        </td>

                        <td className="p-3 whitespace-nowrap">
                          {transaction.status ===
                            'success' && (
                            <Link
                              href={
                                `/portal/payments/` +
                                `${transaction.id}/receipt`
                              }
                              className="text-blue-600 hover:underline"
                            >
                              View receipt
                            </Link>
                          )}
                        </td>
                      </tr>
                    )
                  }
                )
              ) : (
                <tr>
                  <td
                    colSpan={
                      6
                    }
                    className="p-8 text-center text-gray-500"
                  >
                    No payments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export const metadata = {
  title:
    'Portal Payments',

  description:
    'Manage your estate account and workspace with Zadant.',

  robots: {
    index:
      false,

    follow:
      false,
  },
}