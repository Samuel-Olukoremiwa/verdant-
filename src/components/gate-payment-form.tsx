'use client'

import {
  useState,
} from 'react'

type ChargeType = {
  id:
    string

  name:
    string

  description:
    string | null

  amount:
    number
}

type House = {
  id:
    string

  address:
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

export function GatePaymentForm({
  chargeTypes,
  houses,
}: {
  chargeTypes:
    ChargeType[]

  houses:
    House[]
}) {
  const [
    chargeTypeId,
    setChargeTypeId,
  ] =
    useState(
      chargeTypes[0]
        ?.id ??
        ''
    )

  const [
    payerName,
    setPayerName,
  ] =
    useState(
      ''
    )

  const [
    payerEmail,
    setPayerEmail,
  ] =
    useState(
      ''
    )

  const [
    payerPhone,
    setPayerPhone,
  ] =
    useState(
      ''
    )

  const [
    companyName,
    setCompanyName,
  ] =
    useState(
      ''
    )

  const [
    vehiclePlate,
    setVehiclePlate,
  ] =
    useState(
      ''
    )

  const [
    houseId,
    setHouseId,
  ] =
    useState(
      ''
    )

  const [
    purposeNote,
    setPurposeNote,
  ] =
    useState(
      ''
    )

  const [
    busy,
    setBusy,
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

  const selected =
    chargeTypes.find(
      (
        charge
      ) =>
        charge.id ===
        chargeTypeId
    )

  async function submit(
    event:
      React.FormEvent
  ) {
    event.preventDefault()

    if (busy) {
      return
    }

    setBusy(
      true
    )

    setError(
      null
    )

    try {
      const response =
        await fetch(
          '/api/gate-payments/initialize',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                chargeTypeId,

                payerName,

                payerEmail,

                payerPhone,

                companyName,

                vehiclePlate,

                houseId:
                  houseId ||
                  null,

                purposeNote,
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
            'Could not start payment'
        )
      }

      if (
        typeof data.authorization_url !==
        'string'
      ) {
        throw new Error(
          'Payment checkout URL was not returned'
        )
      }

      window.location.assign(
        data.authorization_url
      )
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : 'Could not start payment'
      )

      setBusy(
        false
      )
    }
  }

  if (
    chargeTypes.length ===
    0
  ) {
    return (
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-xl font-semibold">
          Gate payments are not
          available yet.
        </h2>

        <p className="mt-2 text-gray-600">
          The estate has not
          configured any active
          gate charges.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={
        submit
      }
      className="form-card space-y-6"
    >
      <div>
        <label
          htmlFor="gate-charge"
          className="block text-sm font-semibold mb-2"
        >
          What are you paying
          for? *
        </label>

        <select
          id="gate-charge"
          required
          className="w-full border rounded-lg p-3"
          value={
            chargeTypeId
          }
          onChange={
            (
              event
            ) =>
              setChargeTypeId(
                event
                  .target
                  .value
              )
          }
        >
          {chargeTypes.map(
            (
              charge
            ) => (
              <option
                value={
                  charge.id
                }
                key={
                  charge.id
                }
              >
                {
                  charge.name
                }{' '}
                —{' '}
                {naira(
                  charge.amount
                )}
              </option>
            )
          )}
        </select>

        {selected
          ?.description && (
          <p className="mt-2 text-sm text-gray-600">
            {
              selected.description
            }
          </p>
        )}

        {selected && (
          <div className="mt-4 rounded-xl border bg-gray-50 p-4">
            <span className="text-sm text-gray-600">
              Amount to pay
            </span>

            <strong className="block mt-1 text-2xl">
              {naira(
                selected.amount
              )}
            </strong>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold mb-2">
          Full name *
        </label>

        <input
          required
          maxLength={120}
          className="w-full border rounded-lg p-3"
          value={
            payerName
          }
          onChange={
            (
              event
            ) =>
              setPayerName(
                event
                  .target
                  .value
              )
          }
          placeholder="Your full name"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold mb-2">
            Phone number *
          </label>

          <input
            required
            maxLength={20}
            inputMode="tel"
            className="w-full border rounded-lg p-3"
            value={
              payerPhone
            }
            onChange={
              (
                event
              ) =>
                setPayerPhone(
                  event
                    .target
                    .value
                )
            }
            placeholder="080..."
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2">
            Email address *
          </label>

          <input
            required
            type="email"
            maxLength={254}
            className="w-full border rounded-lg p-3"
            value={
              payerEmail
            }
            onChange={
              (
                event
              ) =>
                setPayerEmail(
                  event
                    .target
                    .value
                )
            }
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold mb-2">
            Company
          </label>

          <input
            maxLength={160}
            className="w-full border rounded-lg p-3"
            value={
              companyName
            }
            onChange={
              (
                event
              ) =>
                setCompanyName(
                  event
                    .target
                    .value
                )
            }
            placeholder="Optional"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2">
            Vehicle plate
          </label>

          <input
            maxLength={40}
            className="w-full border rounded-lg p-3 uppercase"
            value={
              vehiclePlate
            }
            onChange={
              (
                event
              ) =>
                setVehiclePlate(
                  event
                    .target
                    .value
                    .toUpperCase()
                )
            }
            placeholder="ABC-123XY"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="gate-house"
          className="block text-sm font-semibold mb-2"
        >
          House / host
        </label>

        <select
          id="gate-house"
          className="w-full border rounded-lg p-3"
          value={
            houseId
          }
          onChange={
            (
              event
            ) =>
              setHouseId(
                event
                  .target
                  .value
              )
          }
        >
          <option value="">
            Not applicable /
            no host
          </option>

          {houses.map(
            (
              house
            ) => (
              <option
                key={
                  house.id
                }
                value={
                  house.id
                }
              >
                {
                  house.address
                }
              </option>
            )
          )}
        </select>

        <p className="mt-1 text-xs text-gray-500">
          Select the property
          you are visiting or
          working at, where
          applicable.
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-2">
          Purpose / note
        </label>

        <textarea
          rows={3}
          maxLength={500}
          className="w-full border rounded-lg p-3"
          value={
            purposeNote
          }
          onChange={
            (
              event
            ) =>
              setPurposeNote(
                event
                  .target
                  .value
              )
          }
          placeholder="Optional"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="text-red-700"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={
          busy ||
          !chargeTypeId
        }
        className="action disabled:opacity-50"
      >
        {busy
          ? 'Starting payment…'
          : 'Proceed to secure payment'}
      </button>

      <p className="text-xs text-gray-500">
        The amount is determined
        by the estate&apos;s
        configured charge and
        cannot be changed from
        this page.
      </p>
    </form>
  )
}