'use client'

import { useState } from 'react'
import {
  formatDateTimeGb,
} from '@/lib/date-format'

type Request = {
  id: string
  surname: string
  first_name: string

  other_names:
    | string
    | null

  phone: string
  email: string

  house_number: string

  block_number:
    | string
    | null

  flat_number:
    | string
    | null

  house_type:
    | string
    | null

  relationship: string

  vehicle_plate_numbers:
    | string[]
    | null

  emergency_contact_name:
    | string
    | null

  emergency_contact_phone:
    | string
    | null

  status: string

  move_in_date?:
    | string
    | null

  property_allocation_date?:
    | string
    | null

  decline_reason:
    | string
    | null

  created_at: string

  streets:
    | {
        name: string
      }
    | null
}

function CopyLinkButton() {
  const [
    copied,
    setCopied,
  ] = useState(false)

  async function handleCopy() {
    const url =
      `${window.location.origin}/register`

    await navigator
      .clipboard
      .writeText(url)

    setCopied(true)

    setTimeout(
      () => {
        setCopied(false)
      },
      2000
    )
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="action secondary"
    >
      {copied
        ? 'Copied!'
        : 'Copy registration link'}
    </button>
  )
}

function displayAddress(
  req: Request
) {
  const house =
    /^house\b/i.test(
      req.house_number
    )
      ? req.house_number
      : `House ${req.house_number}`

  return [
    house,

    req.block_number
      ? `Block ${req.block_number}`
      : null,

    req.flat_number
      ? `Flat ${req.flat_number}`
      : null,

    req.streets?.name ??
      null,
  ]
    .filter(Boolean)
    .join(', ')
}

function RequestRow({
  req,
}: {
  req: Request
}) {
  const [
    moveIn,
    setMoveIn,
  ] = useState(
    req.move_in_date ??
      ''
  )

  const [
    allocation,
    setAllocation,
  ] = useState(
    req
      .property_allocation_date ??
      ''
  )

  const [
    loading,
    setLoading,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null)

  const [
    credentials,
    setCredentials,
  ] = useState<{
    email: string

    sms?: {
      message: string
    }
  } | null>(null)

  const [
    declining,
    setDeclining,
  ] = useState(false)

  const [
    reason,
    setReason,
  ] = useState('')

  const [
    localStatus,
    setLocalStatus,
  ] = useState(
    req.status
  )

  const fullName =
    [
      req.first_name,
      req.other_names,
      req.surname,
    ]
      .filter(Boolean)
      .join(' ')

  async function approve() {
    const moveInIso =
      moveIn

    const allocationIso =
      allocation

    if (!moveInIso) {
      setError(
        'Select the move-in date.'
      )
      return
    }

    if (!allocationIso) {
      setError(
        'Select the property allocation date.'
      )
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response =
        await fetch(
          `/api/admin/registrations/${req.id}/approve`,
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                move_in_date:
                  moveInIso,

                property_allocation_date:
                  allocationIso,
              }),
          }
        )

      const data =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data.error ??
            'Could not approve registration'
        )
      }

      setCredentials(
        data
      )

      setLocalStatus(
        'approved'
      )
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Something went wrong'
      )
    } finally {
      setLoading(false)
    }
  }

  async function decline() {
    const cleanedReason =
      reason.trim()

    if (
      cleanedReason.length <
      3
    ) {
      setError(
        'Enter a reason for declining this registration.'
      )
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response =
        await fetch(
          `/api/admin/registrations/${req.id}/decline`,
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                reason:
                  cleanedReason,
              }),
          }
        )

      const data =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data.error ??
            'Could not decline registration'
        )
      }

      setReason(
        cleanedReason
      )

      setLocalStatus(
        'declined'
      )

      setDeclining(
        false
      )
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Something went wrong'
      )
    } finally {
      setLoading(false)
    }
  }

  function cancelDecline() {
    setDeclining(false)
    setReason('')
    setError(null)
  }

  const statusLabel =
    req.relationship ===
    'owner'
      ? 'Home Owner'
      : req.relationship ===
          'family_member'
        ? 'Family Member'
        : req.relationship ===
            'tenant'
          ? 'Tenant'
          : req.relationship

  return (
    <div className="border-t p-4 text-sm">
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="font-semibold">
            {fullName}
          </p>

          <p className="text-gray-500">
            {displayAddress(
              req
            )}
            {' · '}
            {req.house_type ??
              '—'}
          </p>

          <p className="text-gray-500">
            {req.email}
            {' · '}
            {req.phone}
            {' · '}
            {statusLabel}
          </p>

          {req
            .vehicle_plate_numbers
            ?.length ? (
            <p className="text-gray-500">
              Vehicle(s):{' '}
              {req
                .vehicle_plate_numbers
                .join(', ')}
            </p>
          ) : null}

          {req
            .emergency_contact_name ||
          req
            .emergency_contact_phone ? (
            <p className="text-gray-500">
              Emergency:{' '}
              {req
                .emergency_contact_name ||
                '—'}

              {req
                .emergency_contact_phone
                ? ` · ${req.emergency_contact_phone}`
                : ''}
            </p>
          ) : null}

          <p className="text-xs text-gray-400 mt-1">
            Submitted{' '}
            {formatDateTimeGb(
              req.created_at
            )}
          </p>
        </div>

        <span
          className={`pill${
            localStatus ===
            'approved'
              ? ' good'
              : ''
          }`}
        >
          {localStatus}
        </span>
      </div>

      {localStatus ===
        'pending' && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-3 mb-3">
            <label>
              Move-in date *

              <input
                type="date"
                required
                className="block border rounded-lg p-2"
                value={moveIn}
                onChange={(event) =>
                  setMoveIn(
                    event.target
                      .value
                  )
                }
              />
            </label>

            <label>
              Property allocation date *

              <input
                type="date"
                required
                className="block border rounded-lg p-2"
                value={
                  allocation
                }
                onChange={(event) =>
                  setAllocation(
                    event.target
                      .value
                  )
                }
              />
            </label>
          </div>

          {!declining ? (
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={
                  approve
                }
                disabled={
                  loading
                }
                className="action"
              >
                {loading
                  ? 'Approving...'
                  : 'Approve'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setDeclining(
                    true
                  )

                  setError(
                    null
                  )
                }}
                disabled={
                  loading
                }
                className="action danger"
              >
                Decline
              </button>
            </div>
          ) : (
            <div
              className="mt-3"
              style={{
                maxWidth:
                  '32rem',
              }}
            >
              <label className="block">
                <span className="block text-sm font-medium mb-1">
                  Reason for decline *
                </span>

                <textarea
                  required
                  minLength={3}
                  maxLength={500}
                  rows={4}
                  placeholder="Enter the reason this registration is being declined"
                  value={reason}
                  onChange={(
                    event
                  ) => {
                    setReason(
                      event.target
                        .value
                    )

                    if (
                      error
                    ) {
                      setError(
                        null
                      )
                    }
                  }}
                  className="border rounded-lg px-3 py-2 text-sm w-full"
                />

                <span className="block text-xs text-gray-500 mt-1">
                  Required. Minimum
                  3 characters,
                  maximum 500.
                </span>
              </label>

              <div className="flex items-center gap-2 flex-wrap mt-3">
                <button
                  type="button"
                  onClick={
                    decline
                  }
                  disabled={
                    loading ||
                    reason
                      .trim()
                      .length <
                      3
                  }
                  className="action danger"
                >
                  {loading
                    ? 'Declining...'
                    : 'Confirm decline'}
                </button>

                <button
                  type="button"
                  onClick={
                    cancelDecline
                  }
                  disabled={
                    loading
                  }
                  className="action secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {localStatus ===
        'declined' && (
        <div
          className="mt-3"
          style={{
            border:
              '1px solid #efd0ca',

            background:
              '#fff7f5',

            borderRadius:
              '.6rem',

            padding:
              '.75rem',
          }}
        >
          <p
            className="text-xs font-semibold"
            style={{
              color:
                '#a63e30',
            }}
          >
            Decline reason
          </p>

          <p
            className="text-sm mt-1"
            style={{
              color:
                '#7c3127',
            }}
          >
            {req
              .decline_reason ||
              reason ||
              'No reason recorded'}
          </p>
        </div>
      )}

      {credentials && (
        <div
          className="text-sm mt-3"
          style={{
            background:
              '#e7f5e9',

            border:
              '1px solid #bfe0c9',

            borderRadius:
              '.6rem',

            padding:
              '.85rem',
          }}
        >
          <p
            className="font-semibold mb-1"
            style={{
              color:
                '#276d4b',
            }}
          >
            Approved — an
            invite email was
            sent to{' '}
            {fullName}.
          </p>

          <p>
            Email:{' '}

            <span className="font-mono">
              {
                credentials.email
              }
            </span>
          </p>

          <p
            className="text-xs mt-2"
            style={{
              color:
                '#276d4b',
            }}
          >
            The resident can
            use the invitation
            to set their
            password and
            access the portal.
          </p>
        </div>
      )}

      {credentials?.sms && (
        <p
          role="status"
          className="text-sm mt-3"
        >
          {
            credentials
              .sms.message
          }
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="text-xs mt-3"
          style={{
            color:
              '#a63e30',
          }}
        >
          {error}
        </p>
      )}
    </div>
  )
}

export function RegistrationsTable({
  requests,
}: {
  requests: Request[]
}) {
  const pending =
    requests.filter(
      (request) =>
        request.status ===
        'pending'
    )

  const reviewed =
    requests.filter(
      (request) =>
        request.status !==
        'pending'
    )

  return (
    <div>
      <div className="mb-6">
        <CopyLinkButton />
      </div>

      <div
        className="panel"
        style={{
          marginBottom:
            '2rem',
        }}
      >
        <div className="panel-head">
          <h2>
            Pending review (
            {pending.length})
          </h2>
        </div>

        {pending.length >
        0 ? (
          pending.map(
            (request) => (
              <RequestRow
                key={
                  request.id
                }
                req={
                  request
                }
              />
            )
          )
        ) : (
          <p className="empty">
            No pending
            registrations right
            now.
          </p>
        )}
      </div>

      {reviewed.length >
        0 && (
        <div className="panel">
          <div className="panel-head">
            <h2>
              Previously reviewed
            </h2>
          </div>

          {reviewed.map(
            (request) => (
              <RequestRow
                key={
                  request.id
                }
                req={
                  request
                }
              />
            )
          )}
        </div>
      )}
    </div>
  )
}