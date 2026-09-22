'use client'

import { useState } from 'react'
import {
  ddMmYyyyToIso,
  formatDateTimeGb,
  isoToDdMmYyyy,
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
  const [copied, setCopied] =
    useState(false)

  async function handleCopy() {
    const url =
      `${window.location.origin}/register`

    await navigator
      .clipboard
      .writeText(url)

    setCopied(true)

    setTimeout(
      () =>
        setCopied(false),
      2000
    )
  }

  return (
    <button
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
  const [moveIn, setMoveIn] =
    useState(
      isoToDdMmYyyy(
        req.move_in_date
      )
    )

  const [
    allocation,
    setAllocation,
  ] =
    useState(
      isoToDdMmYyyy(
        req
          .property_allocation_date
      )
    )

  const [loading, setLoading] =
    useState(false)

  const [error, setError] =
    useState<string | null>(
      null
    )

  const [
    credentials,
    setCredentials,
  ] =
    useState<{
      email: string

      sms?: {
        message: string
      }
    } | null>(null)

  const [
    declining,
    setDeclining,
  ] =
    useState(false)

  const [reason, setReason] =
    useState('')

  const [
    localStatus,
    setLocalStatus,
  ] =
    useState(req.status)

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
      ddMmYyyyToIso(
        moveIn
      )

    const allocationIso =
      ddMmYyyyToIso(
        allocation
      )

    if (!moveInIso) {
      setError(
        'Enter the move-in date as DD/MM/YYYY.'
      )
      return
    }

    if (!allocationIso) {
      setError(
        'Enter the property allocation date as DD/MM/YYYY.'
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
            method: 'POST',

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
            'Could not approve'
        )
      }

      setCredentials(data)

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
    setLoading(true)
    setError(null)

    try {
      const response =
        await fetch(
          `/api/admin/registrations/${req.id}/decline`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                reason:
                  reason || null,
              }),
          }
        )

      const data =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data.error ??
            'Could not decline'
        )
      }

      setLocalStatus(
        'declined'
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

  const statusLabel =
    req.relationship ===
    'owner'
      ? 'Home Owner'
      : req.relationship ===
        'family_member'
        ? 'Family Member'
        : 'Tenant'

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
                type="text"
                inputMode="numeric"
                placeholder="DD/MM/YYYY"
                maxLength={10}
                required
                className="block border rounded-lg p-2"
                value={moveIn}
                onChange={(event) =>
                  setMoveIn(
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Property allocation date *

              <input
                type="text"
                inputMode="numeric"
                placeholder="DD/MM/YYYY"
                maxLength={10}
                required
                className="block border rounded-lg p-2"
                value={
                  allocation
                }
                onChange={(event) =>
                  setAllocation(
                    event.target.value
                  )
                }
              />
            </label>
          </div>

          {!declining ? (
            <div className="flex gap-2">
              <button
                onClick={approve}
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
                onClick={() =>
                  setDeclining(
                    true
                  )
                }
                disabled={
                  loading
                }
                className="action danger"
              >
                Decline
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                placeholder="Optional reason"
                value={reason}
                onChange={(event) =>
                  setReason(
                    event.target.value
                  )
                }
                className="border rounded-lg px-3 py-2 text-sm"
                style={{
                  minWidth:
                    '14rem',
                }}
              />

              <button
                onClick={
                  decline
                }
                disabled={
                  loading
                }
                className="action danger"
              >
                {loading
                  ? 'Declining...'
                  : 'Confirm decline'}
              </button>

              <button
                type="button"
                onClick={() =>
                  setDeclining(
                    false
                  )
                }
                className="action secondary"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {localStatus ===
        'declined' &&
        (
          req.decline_reason ||
          reason
        ) && (
        <p
          className="text-xs mt-2"
          style={{
            color:
              '#a63e30',
          }}
        >
          Reason:{' '}
          {req
            .decline_reason ||
            reason}
        </p>
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
            {fullName}:
          </p>

          <p>
            Email:{' '}
            <span className="font-mono">
              {
                credentials.email
              }
            </span>
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
          className="text-xs mt-2"
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