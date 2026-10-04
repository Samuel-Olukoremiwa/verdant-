'use client'

import {
  useCallback,
  useEffect,
  useState,
} from 'react'

type Incident = {
  id:
    string

  category:
    string

  details:
    string | null

  status:
    string

  raised_at:
    string

  acknowledged_at:
    string | null

  responding_at:
    string | null

  resolved_at:
    string | null

  resolution_note:
    string | null
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

function statusLabel(
  status:
    string
) {
  switch (
    status
  ) {
    case 'acknowledged':
      return 'Acknowledged'

    case 'responding':
      return 'Response in progress'

    case 'resolved':
      return 'Resolved'

    default:
      return 'Emergency raised'
  }
}

function categoryLabel(
  category:
    string
) {
  switch (
    category
  ) {
    case 'security':
      return 'Security'

    case 'medical':
      return 'Medical'

    case 'fire':
      return 'Fire'

    default:
      return 'Other emergency'
  }
}

export function ResidentEmergencyPanel() {
  const [
    category,
    setCategory,
  ] =
    useState(
      'security'
    )

  const [
    details,
    setDetails,
  ] =
    useState(
      ''
    )

  const [
    incidents,
    setIncidents,
  ] =
    useState<
      Incident[]
    >(
      []
    )

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    )

  const [
    sending,
    setSending,
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

  const [
    success,
    setSuccess,
  ] =
    useState<
      string | null
    >(
      null
    )

  const load =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              '/api/emergencies?scope=resident',
              {
                cache:
                  'no-store',
              }
            )

          const data =
            await response.json()

          if (
            !response.ok
          ) {
            throw new Error(
              data.error ||
                'Emergency status could not be loaded'
            )
          }

          setIncidents(
            data.incidents ??
              []
          )
        } catch (
          caught
        ) {
          setError(
            caught instanceof
              Error
              ? caught.message
              : 'Emergency status could not be loaded'
          )
        } finally {
          setLoading(
            false
          )
        }
      },
      []
    )

  useEffect(
    () => {
      const initial =
        window.setTimeout(
          () => {
            void load()
          },
          0
        )

      const timer =
        window.setInterval(
          () => {
            void load()
          },
          5000
        )

      return () => {
        window.clearTimeout(
          initial
        )

        window.clearInterval(
          timer
        )
      }
    },
    [
      load,
    ]
  )

  async function raiseEmergency(
    event:
      React.FormEvent
  ) {
    event.preventDefault()

    if (
      sending
    ) {
      return
    }

    setSending(
      true
    )

    setError(
      null
    )

    setSuccess(
      null
    )

    try {
      const response =
        await fetch(
          '/api/emergencies',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                category,
                details,
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
            'Emergency alert could not be raised'
        )
      }

      setDetails(
        ''
      )

      setSuccess(
        'Emergency alert sent to estate staff and gate operations.'
      )

      await load()
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : 'Emergency alert could not be raised'
      )
    } finally {
      setSending(
        false
      )
    }
  }

  const active =
    incidents.filter(
      (
        incident
      ) =>
        incident.status !==
        'resolved'
    )

  const resolved =
    incidents.filter(
      (
        incident
      ) =>
        incident.status ===
        'resolved'
    )

  return (
    <div className="space-y-6">
      <section
        className="rounded-2xl border-2 p-6"
        style={{
          borderColor:
            '#dc2626',

          background:
            '#fff7f7',
        }}
      >
        <span
          className="eyebrow"
          style={{
            color:
              '#b91c1c',
          }}
        >
          Estate emergency
        </span>

        <h1 className="page-title">
          Request immediate estate
          assistance.
        </h1>

        <p className="page-lead">
          This immediately creates
          an emergency incident
          visible to authorised
          estate and gate staff.
        </p>

        <p
          className="mt-4 rounded-lg p-3 text-sm"
          style={{
            background:
              '#fee2e2',

            color:
              '#7f1d1d',
          }}
        >
          For a life-threatening
          situation, contact the
          appropriate official
          emergency service
          directly as well. Zadant
          alerts estate personnel;
          it is not a replacement
          for public emergency
          services.
        </p>

        <form
          onSubmit={
            raiseEmergency
          }
          className="mt-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-semibold mb-2">
              Emergency type
            </label>

            <select
              className="w-full border rounded-lg p-3 bg-white"
              value={
                category
              }
              onChange={
                (
                  event
                ) =>
                  setCategory(
                    event.target.value
                  )
              }
            >
              <option value="security">
                Security
              </option>

              <option value="medical">
                Medical
              </option>

              <option value="fire">
                Fire
              </option>

              <option value="other">
                Other emergency
              </option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              What is happening?
            </label>

            <textarea
              rows={4}
              maxLength={1000}
              className="w-full border rounded-lg p-3 bg-white"
              value={
                details
              }
              onChange={
                (
                  event
                ) =>
                  setDetails(
                    event.target.value
                  )
              }
              placeholder="Give staff any useful details, location information or instructions."
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

          {success && (
            <p
              role="status"
              className="rounded-lg border border-green-300 bg-green-50 p-3 text-green-800"
            >
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={
              sending
            }
            className="action"
            style={{
              background:
                '#b91c1c',

              borderColor:
                '#b91c1c',
            }}
          >
            {sending
              ? 'Sending emergency alert…'
              : 'Raise emergency alert'}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">
              Current status
            </span>

            <h2>
              Active emergencies
            </h2>
          </div>

          <span className="pill">
            {
              active.length
            }{' '}
            active
          </span>
        </div>

        <div className="panel-body">
          {loading ? (
            <p>
              Loading emergency
              status…
            </p>
          ) : active.length ? (
            <div className="space-y-4">
              {active.map(
                (
                  incident
                ) => (
                  <article
                    key={
                      incident.id
                    }
                    className="rounded-xl border border-red-200 bg-red-50 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <strong className="block text-lg">
                          {categoryLabel(
                            incident.category
                          )}
                        </strong>

                        <span className="text-sm text-gray-600">
                          Raised{' '}
                          {dateTime(
                            incident.raised_at
                          )}{' '}
                          WAT
                        </span>
                      </div>

                      <span className="pill">
                        {statusLabel(
                          incident.status
                        )}
                      </span>
                    </div>

                    {incident.details && (
                      <p className="mt-3">
                        {
                          incident.details
                        }
                      </p>
                    )}

                    {incident.acknowledged_at && (
                      <p className="mt-3 text-sm">
                        ✓ Estate staff
                        acknowledged this
                        alert at{' '}
                        {dateTime(
                          incident.acknowledged_at
                        )}{' '}
                        WAT.
                      </p>
                    )}

                    {incident.responding_at && (
                      <p className="mt-2 text-sm font-semibold text-green-800">
                        Response is in
                        progress.
                      </p>
                    )}
                  </article>
                )
              )}
            </div>
          ) : (
            <p className="empty">
              You have no active
              emergency incidents.
            </p>
          )}
        </div>
      </section>

      {resolved.length >
        0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>
              Recent resolved
              emergencies
            </h2>
          </div>

          <div className="panel-body space-y-3">
            {resolved
              .slice(
                0,
                10
              )
              .map(
                (
                  incident
                ) => (
                  <article
                    key={
                      incident.id
                    }
                    className="rounded-xl border p-4"
                  >
                    <div className="flex justify-between gap-3">
                      <strong>
                        {categoryLabel(
                          incident.category
                        )}
                      </strong>

                      <span className="pill">
                        Resolved
                      </span>
                    </div>

                    <p className="mt-2 text-sm">
                      Resolved{' '}
                      {dateTime(
                        incident.resolved_at
                      )}{' '}
                      WAT
                    </p>

                    {incident.resolution_note && (
                      <p className="mt-2 text-sm text-gray-600">
                        {
                          incident.resolution_note
                        }
                      </p>
                    )}
                  </article>
                )
              )}
          </div>
        </section>
      )}
    </div>
  )
}