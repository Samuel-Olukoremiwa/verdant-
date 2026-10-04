'use client'

import {
  useState,
} from 'react'

import {
  useRouter,
} from 'next/navigation'

export function VisitorCheckoutButton({
  id,
  visitorName,
}: {
  id:
    string

  visitorName:
    string
}) {
  const router =
    useRouter()

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

  async function checkout() {
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
          '/api/gate/visitors',
          {
            method:
              'PATCH',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                id,
              }),
          }
        )

      const data =
        await response.json()

      if (
        !response.ok
      ) {
        throw new Error(
          data.error ||
            'Could not check visitor out'
        )
      }

      router.refresh()
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof
          Error
          ? caughtError.message
          : 'Could not check visitor out'
      )
    } finally {
      setBusy(
        false
      )
    }
  }

  return (
    <div>
      <button
        type="button"
        className="action secondary"
        disabled={busy}
        onClick={
          checkout
        }
        aria-label={`Check ${visitorName} out`}
      >
        {busy
          ? 'Checking out…'
          : 'Check out'}
      </button>

      {error && (
        <p
          role="alert"
          className="mt-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  )
}