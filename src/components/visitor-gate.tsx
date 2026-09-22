'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type VisitorResult = {
  visitor: string
  visitor_phone:
    | string
    | null
  host: string
  address: string
  message: string
  has_outstanding:
    boolean
  balance: number
  alert_queued:
    boolean
}

function naira(
  amount: number
) {
  return `₦${Number(
    amount
  ).toLocaleString(
    'en-NG',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  )}`
}

export function VisitorGate() {
  const router =
    useRouter()

  const [code, setCode] =
    useState('')

  const [busy, setBusy] =
    useState(false)

  const [error, setError] =
    useState('')

  const [
    result,
    setResult,
  ] =
    useState<
      VisitorResult | null
    >(null)

  async function submit(
    event:
      React.FormEvent
  ) {
    event.preventDefault()

    setBusy(true)
    setError('')
    setResult(null)

    try {
      const response =
        await fetch(
          '/api/gate/visitors',
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
                  code.trim(),
              }),
          }
        )

      const data =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data.error ??
            'Could not verify visitor'
        )
      }

      setResult(
        data as VisitorResult
      )

      setCode('')

      router.refresh()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not verify visitor'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel p-5 mb-5">
      <h2 className="text-xl mb-2">
        Visitor entry
      </h2>

      <p className="mb-3 text-sm">
        Verify the invitation
        and record entry. A
        valid code is used
        immediately.
      </p>

      <form
        onSubmit={submit}
        className="flex flex-wrap gap-3"
      >
        <input
          aria-label="Visitor entry code"
          required
          maxLength={10}
          pattern="[A-Fa-f0-9]{10}"
          autoComplete="off"
          className="border rounded-lg p-3 uppercase font-mono"
          placeholder="10-character code"
          value={code}
          onChange={(event) => {
            setCode(
              event.target.value
            )

            setResult(null)
            setError('')
          }}
        />

        <button
          className="action"
          disabled={busy}
        >
          {busy
            ? 'Checking…'
            : 'Verify & record entry'}
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

      {result && (
        <div className="mt-4 space-y-3">
          <div
            role="status"
            className="rounded-lg bg-green-50 border border-green-200 p-4"
          >
            <strong className="text-green-800">
              Entry approved:{' '}
              {result.visitor}
            </strong>

            {result.visitor_phone && (
              <p className="mt-1">
                Visitor phone:{' '}
                {
                  result.visitor_phone
                }
              </p>
            )}

            <p className="mt-1">
              Host:{' '}
              {result.host}
            </p>

            <p>
              Address:{' '}
              {result.address}
            </p>

            <p className="text-sm mt-1">
              {result.message}
            </p>
          </div>

          {result.has_outstanding && (
            <div
              role="alert"
              className="rounded-lg border-2 border-amber-500 bg-amber-50 p-4"
            >
              <strong className="block text-amber-900">
                ⚠ Household has
                outstanding bills
              </strong>

              <p className="mt-1 text-amber-900">
                Current balance:{' '}
                <strong>
                  {naira(
                    result.balance
                  )}
                </strong>
              </p>

              <p className="mt-2 text-sm text-amber-800">
                Visitor entry remains
                approved. Outstanding
                dues do not block
                access.
              </p>

              <p className="mt-1 text-sm text-amber-800">
                {result.alert_queued
                  ? 'The host resident, designated payee where different, and estate administration have been queued for notification.'
                  : 'No billing alert was required.'}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}