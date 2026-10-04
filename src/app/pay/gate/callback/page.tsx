'use client'

import {
  useEffect,
  useState,
} from 'react'

import {
  useSearchParams,
} from 'next/navigation'

type Result = {
  status:
    string

  payment_code?:
    string

  charge_name?:
    string

  amount?:
    number

  payer_name?:
    string

  paid_at?:
    string

  error?:
    string
}

function naira(
  amount:
    number
) {
  return `₦${Number(
    amount
  ).toLocaleString(
    'en-NG',
    {
      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    }
  )}`
}

export default function GatePaymentCallbackPage() {
  const params =
    useSearchParams()

  const reference =
    params.get(
      'reference'
    ) ||
    params.get(
      'trxref'
    )

  const [
    result,
    setResult,
  ] =
    useState<
      Result | null
    >(
      null
    )

  useEffect(
    () => {
      if (!reference) {
        return
      }

      let active =
        true

      fetch(
        `/api/gate-payments/verify?reference=${encodeURIComponent(
          reference
        )}`,
        {
          cache:
            'no-store',
        }
      )
        .then(
          async (
            response
          ) => {
            const data =
              await response.json()

            if (
              !response.ok
            ) {
              throw new Error(
                data.error ??
                  'Verification failed'
              )
            }

            if (
              active
            ) {
              setResult(
                data
              )
            }
          }
        )
        .catch(
          (
            caught
          ) => {
            if (
              active
            ) {
              setResult({
                status:
                  'error',

                error:
                  caught instanceof
                    Error
                    ? caught.message
                    : 'Verification failed',
              })
            }
          }
        )

      return () => {
        active =
          false
      }
    },
    [
      reference,
    ]
  )

  const status =
    !reference
      ? 'missing'
      : result?.status ??
        'checking'

  const successful =
    status ===
    'success'

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-5 py-16">
        <div className="rounded-2xl border bg-white p-7 shadow-sm text-center">
          <span className="eyebrow">
            Zadant gate payment
          </span>

          <h1 className="text-2xl font-bold mt-3">
            {successful
              ? 'Payment verified'
              : status ===
                  'checking'
                ? 'Confirming your payment…'
                : status ===
                    'missing'
                  ? 'Payment reference missing'
                  : 'Payment not yet confirmed'}
          </h1>

          {successful &&
          result ? (
            <div className="mt-6 space-y-3">
              <div className="rounded-xl border border-green-200 bg-green-50 p-5">
                <strong className="block text-green-800">
                  PAYMENT VERIFIED
                </strong>

                <p className="mt-3">
                  {
                    result.payer_name
                  }
                </p>

                <p>
                  {
                    result.charge_name
                  }
                </p>

                {typeof result.amount ===
                  'number' && (
                  <p className="text-xl font-bold mt-2">
                    {naira(
                      result.amount
                    )}
                  </p>
                )}
              </div>

              <div className="rounded-xl border p-5">
                <span className="text-sm text-gray-500">
                  Gate payment ID
                </span>

                <strong className="block text-xl mt-1 font-mono break-all">
                  {
                    result.payment_code
                  }
                </strong>
              </div>

              <p className="text-sm text-gray-600">
                Show this payment
                confirmation to the
                gate officer. The
                estate system has
                independently
                verified the
                transaction.
              </p>
            </div>
          ) : (
            <div className="mt-5">
              {status ===
              'checking' ? (
                <p>
                  Please wait while
                  Zadant verifies the
                  transaction with
                  Paystack.
                </p>
              ) : (
                <>
                  <p>
                    If you were
                    charged, do not
                    make another
                    payment yet.
                  </p>

                  {result?.error && (
                    <p
                      role="alert"
                      className="mt-3 text-red-700"
                    >
                      {
                        result.error
                      }
                    </p>
                  )}

                  {reference && (
                    <button
                      type="button"
                      className="action secondary mt-5"
                      onClick={
                        () =>
                          window.location.reload()
                      }
                    >
                      Retry verification
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {reference && (
            <p className="mt-6 text-xs text-gray-500 break-all">
              Reference:{' '}
              {
                reference
              }
            </p>
          )}
        </div>
      </div>
    </main>
  )
}