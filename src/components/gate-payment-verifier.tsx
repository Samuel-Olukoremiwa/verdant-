'use client'

import {
  useCallback,
  useEffect,
  useState,
} from 'react'

type GatePayment = {
  id?:
    string

  payment_code:
    string

  reference?:
    string

  charge_name:
    string

  amount:
    number | string

  currency?:
    string

  payer_name:
    string

  payer_phone?:
    string | null

  company_name:
    string | null

  vehicle_plate:
    string | null

  host_reference:
    string | null

  purpose_note?:
    string | null

  status?:
    string

  paid_at:
    string | null

  admitted_at:
    string | null

  already_admitted?:
    boolean
}

function naira(
  amount:
    number | string
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

function dateTime(
  value:
    string | null
) {
  if (!value) {
    return '—'
  }

  return new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone:
        'Africa/Lagos',

      dateStyle:
        'medium',

      timeStyle:
        'short',
    }
  ).format(
    new Date(
      value
    )
  )
}

export function GatePaymentVerifier() {
  const [
    code,
    setCode,
  ] =
    useState(
      ''
    )

  const [
    payment,
    setPayment,
  ] =
    useState<
      GatePayment | null
    >(
      null
    )

  const [
    waiting,
    setWaiting,
  ] =
    useState<
      GatePayment[]
    >(
      []
    )

  const [
    checking,
    setChecking,
  ] =
    useState(
      false
    )

  const [
    admitting,
    setAdmitting,
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

  const loadWaiting =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              '/api/gate/payments',
              {
                method:
                  'GET',

                cache:
                  'no-store',
              }
            )

          if (
            !response.ok
          ) {
            return
          }

          const data =
            await response.json()

          setWaiting(
            data.payments ??
              []
          )
        } catch {
          /*
           * Automatic polling
           * should never interrupt
           * normal gate activity.
           */
        }
      },
      []
    )

  useEffect(
    () => {
      /*
       * Schedule the initial fetch
       * instead of synchronously
       * triggering state updates
       * from the effect body.
       */
      const initialTimer =
        window.setTimeout(
          () => {
            void loadWaiting()
          },
          0
        )

      const pollingTimer =
        window.setInterval(
          () => {
            void loadWaiting()
          },
          5000
        )

      return () => {
        window.clearTimeout(
          initialTimer
        )

        window.clearInterval(
          pollingTimer
        )
      }
    },
    [
      loadWaiting,
    ]
  )

  async function verify(
    event:
      React.FormEvent
  ) {
    event.preventDefault()

    if (checking) {
      return
    }

    setChecking(
      true
    )

    setError(
      null
    )

    setPayment(
      null
    )

    try {
      const normalizedCode =
        code
          .trim()
          .toUpperCase()

      const response =
        await fetch(
          '/api/gate/payments',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                code:
                  normalizedCode,
              }),
          }
        )

      const data =
        await response.json()

      if (
        !response.ok
      ) {
        throw new Error(
          data.error ??
            'Could not verify payment'
        )
      }

      setPayment(
        data.payment
      )

      setCode(
        data.payment
          .payment_code ??
          normalizedCode
      )
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : 'Could not verify payment'
      )
    } finally {
      setChecking(
        false
      )
    }
  }

  async function admit() {
    if (
      !payment ||
      admitting
    ) {
      return
    }

    setAdmitting(
      true
    )

    setError(
      null
    )

    try {
      const response =
        await fetch(
          '/api/gate/payments',
          {
            method:
              'PATCH',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                code:
                  payment
                    .payment_code,
              }),
          }
        )

      const data =
        await response.json()

      if (
        !response.ok
      ) {
        throw new Error(
          data.error ??
            'Could not admit entry'
        )
      }

      setPayment(
        data.payment
      )

      await loadWaiting()
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : 'Could not admit entry'
      )
    } finally {
      setAdmitting(
        false
      )
    }
  }

  function selectPayment(
    selected:
      GatePayment
  ) {
    setPayment(
      selected
    )

    setCode(
      selected
        .payment_code
    )

    setError(
      null
    )
  }

  const successful =
    payment?.status ===
      'success' ||
    Boolean(
      payment?.paid_at
    )

  return (
    <section className="panel p-5 mb-5">
      <div className="panel-head">
        <div>
          <span className="eyebrow">
            Gate revenue
          </span>

          <h2>
            Verify gate payment
          </h2>

          <p className="text-sm mt-1">
            Enter the payment ID
            shown on the
            payer&apos;s phone.
          </p>
        </div>

        <span className="pill">
          {
            waiting.length
          }{' '}
          awaiting entry
        </span>
      </div>

      <div className="panel-body">
        <form
          onSubmit={
            verify
          }
          className="flex flex-wrap gap-3"
        >
          <input
            required
            maxLength={18}
            autoComplete="off"
            className="border rounded-lg p-3 uppercase font-mono min-w-[260px]"
            aria-label="Gate payment code"
            placeholder="GATE-202610-000001"
            value={
              code
            }
            onChange={
              (
                event
              ) => {
                setCode(
                  event
                    .target
                    .value
                    .toUpperCase()
                )

                setError(
                  null
                )
              }
            }
          />

          <button
            type="submit"
            className="action"
            disabled={
              checking
            }
          >
            {checking
              ? 'Checking…'
              : 'Verify payment'}
          </button>
        </form>

        {error && (
          <p
            role="alert"
            className="mt-3 text-red-700"
          >
            {error}
          </p>
        )}

        {payment && (
          <div className="mt-5">
            {successful ? (
              <div className="rounded-xl border-2 border-green-500 bg-green-50 p-5">
                <span className="eyebrow">
                  Payment status
                </span>

                <h3 className="mt-1 text-xl font-bold text-green-800">
                  ✓ PAYMENT VERIFIED
                </h3>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <small className="block text-gray-500">
                      Payment ID
                    </small>

                    <strong className="font-mono">
                      {
                        payment.payment_code
                      }
                    </strong>
                  </div>

                  <div>
                    <small className="block text-gray-500">
                      Amount
                    </small>

                    <strong>
                      {naira(
                        payment.amount
                      )}
                    </strong>
                  </div>

                  <div>
                    <small className="block text-gray-500">
                      Payment for
                    </small>

                    <strong>
                      {
                        payment.charge_name
                      }
                    </strong>
                  </div>

                  <div>
                    <small className="block text-gray-500">
                      Payer
                    </small>

                    <strong>
                      {
                        payment.payer_name
                      }
                    </strong>
                  </div>

                  {payment.payer_phone && (
                    <div>
                      <small className="block text-gray-500">
                        Phone
                      </small>

                      <strong>
                        {
                          payment.payer_phone
                        }
                      </strong>
                    </div>
                  )}

                  {payment.company_name && (
                    <div>
                      <small className="block text-gray-500">
                        Company
                      </small>

                      <strong>
                        {
                          payment.company_name
                        }
                      </strong>
                    </div>
                  )}

                  {payment.vehicle_plate && (
                    <div>
                      <small className="block text-gray-500">
                        Vehicle
                      </small>

                      <strong>
                        {
                          payment.vehicle_plate
                        }
                      </strong>
                    </div>
                  )}

                  {payment.host_reference && (
                    <div>
                      <small className="block text-gray-500">
                        House / host
                      </small>

                      <strong>
                        {
                          payment.host_reference
                        }
                      </strong>
                    </div>
                  )}

                  <div>
                    <small className="block text-gray-500">
                      Paid
                    </small>

                    <strong>
                      {dateTime(
                        payment.paid_at
                      )}{' '}
                      WAT
                    </strong>
                  </div>
                </div>

                {payment.purpose_note && (
                  <div className="mt-4 rounded-lg border border-green-200 bg-white p-3">
                    <small className="block text-gray-500">
                      Purpose / note
                    </small>

                    <p className="mt-1">
                      {
                        payment.purpose_note
                      }
                    </p>
                  </div>
                )}

                {payment.admitted_at ? (
                  <div
                    role="status"
                    className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4"
                  >
                    <strong>
                      Entry already
                      admitted
                    </strong>

                    <p className="mt-1 text-sm">
                      {dateTime(
                        payment.admitted_at
                      )}{' '}
                      WAT
                    </p>

                    <p className="mt-1 text-sm">
                      This payment
                      cannot be used
                      for another
                      admission.
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="action mt-5"
                    disabled={
                      admitting
                    }
                    onClick={
                      admit
                    }
                  >
                    {admitting
                      ? 'Admitting…'
                      : 'Admit entry'}
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-5">
                <strong className="text-amber-900">
                  Payment is not
                  verified
                </strong>

                <p className="mt-2">
                  Current status:{' '}
                  <strong>
                    {
                      payment.status ??
                      'pending'
                    }
                  </strong>
                </p>

                <p className="mt-2 text-sm">
                  Do not admit this
                  payment until
                  Zadant shows
                  PAYMENT VERIFIED.
                </p>
              </div>
            )}
          </div>
        )}

        {waiting.length >
          0 && (
          <div className="mt-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold">
                  Paid — awaiting
                  entry
                </h3>

                <p className="text-sm text-gray-600">
                  This list
                  refreshes
                  automatically.
                </p>
              </div>

              <button
                type="button"
                className="action secondary"
                onClick={
                  () => {
                    void loadWaiting()
                  }
                }
              >
                Refresh
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {waiting.map(
                (
                  item
                ) => (
                  <button
                    key={
                      item.payment_code
                    }
                    type="button"
                    className="w-full rounded-xl border p-4 text-left hover:bg-gray-50"
                    onClick={
                      () =>
                        selectPayment(
                          item
                        )
                    }
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="font-mono">
                        {
                          item.payment_code
                        }
                      </strong>

                      <strong>
                        {naira(
                          item.amount
                        )}
                      </strong>
                    </div>

                    <p className="mt-1">
                      {
                        item.payer_name
                      }{' '}
                      ·{' '}
                      {
                        item.charge_name
                      }
                    </p>

                    <small className="block mt-1 text-gray-500">
                      Paid{' '}
                      {dateTime(
                        item.paid_at
                      )}{' '}
                      WAT
                    </small>
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}