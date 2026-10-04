'use client'

import {
  useCallback,
  useEffect,
  useMemo,
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

  resident:
    | {
        id:
          string

        full_name:
          string

        phone:
          string | null

        emergency_contact_name:
          string | null

        emergency_contact_phone:
          string | null
      }
    | null

  house:
    | {
        id:
          string

        address:
          string
      }
    | null
}

function dateTime(
  value:
    string | null
) {
  if (!value) {
    return '—'
  }

  return `${new Intl.DateTimeFormat(
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
  )} WAT`
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
      return 'Responding'

    case 'resolved':
      return 'Resolved'

    default:
      return 'New emergency'
  }
}

export function EmergencyOperationsPanel() {
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
    updatingId,
    setUpdatingId,
  ] =
    useState<
      string | null
    >(
      null
    )

  const [
    notes,
    setNotes,
  ] =
    useState<
      Record<
        string,
        string
      >
    >(
      {}
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

  const load =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              '/api/emergencies?scope=staff',
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
                'Emergency incidents could not be loaded'
            )
          }

          setIncidents(
            data.incidents ??
              []
          )

          setError(
            null
          )
        } catch (
          caught
        ) {
          setError(
            caught instanceof
              Error
              ? caught.message
              : 'Emergency incidents could not be loaded'
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

  const active =
    useMemo(
      () =>
        incidents.filter(
          (
            incident
          ) =>
            incident.status !==
            'resolved'
        ),
      [
        incidents,
      ]
    )

  const resolved =
    useMemo(
      () =>
        incidents.filter(
          (
            incident
          ) =>
            incident.status ===
            'resolved'
        ),
      [
        incidents,
      ]
    )

  async function update(
    incident:
      Incident,

    status:
      'acknowledged' |
      'responding' |
      'resolved'
  ) {
    if (
      updatingId
    ) {
      return
    }

    const note =
      notes[
        incident.id
      ]?.trim() ??
      ''

    if (
      status ===
        'resolved' &&
      !note
    ) {
      setError(
        'Enter a resolution note before resolving the emergency.'
      )

      return
    }

    setUpdatingId(
      incident.id
    )

    setError(
      null
    )

    try {
      const response =
        await fetch(
          '/api/emergencies',
          {
            method:
              'PATCH',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                id:
                  incident.id,

                status,

                note,
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
            'Emergency could not be updated'
        )
      }

      if (
        status ===
        'resolved'
      ) {
        setNotes(
          (
            previous
          ) => ({
            ...previous,

            [
              incident.id
            ]:
              '',
          })
        )
      }

      await load()
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : 'Emergency could not be updated'
      )
    } finally {
      setUpdatingId(
        null
      )
    }
  }

  return (
    <div className="space-y-6">
      <section
        className="rounded-2xl border-2 p-5"
        style={{
          borderColor:
            active.length
              ? '#dc2626'
              : '#d1d5db',

          background:
            active.length
              ? '#fff7f7'
              : '#fff',
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span
              className="eyebrow"
              style={{
                color:
                  active.length
                    ? '#b91c1c'
                    : undefined,
              }}
            >
              Emergency operations
            </span>

            <h2 className="text-2xl font-bold mt-1">
              {active.length
                ? `${active.length} active emergency${
                    active.length ===
                    1
                      ? ''
                      : 'ies'
                  }`
                : 'No active emergencies'}
            </h2>

            <p className="mt-1 text-sm text-gray-600">
              This screen
              refreshes every five
              seconds.
            </p>
          </div>

          <button
            type="button"
            className="action secondary"
            onClick={
              () => {
                void load()
              }
            }
          >
            Refresh
          </button>
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700"
        >
          {error}
        </p>
      )}

      {loading ? (
        <section className="panel p-6">
          Loading emergency
          operations…
        </section>
      ) : active.length ? (
        <div className="space-y-5">
          {active.map(
            (
              incident
            ) => (
              <article
                key={
                  incident.id
                }
                className="rounded-2xl border-2 border-red-400 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span
                      className="eyebrow"
                      style={{
                        color:
                          '#b91c1c',
                      }}
                    >
                      {categoryLabel(
                        incident.category
                      )}
                    </span>

                    <h3 className="text-xl font-bold mt-1">
                      {incident.resident
                        ?.full_name ??
                        'Resident emergency'}
                    </h3>

                    <p className="mt-1 text-sm text-gray-600">
                      Raised{' '}
                      {dateTime(
                        incident.raised_at
                      )}
                    </p>
                  </div>

                  <span className="pill">
                    {statusLabel(
                      incident.status
                    )}
                  </span>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <small className="block text-gray-500">
                      Residence
                    </small>

                    <strong>
                      {incident.house
                        ?.address ??
                        'No house recorded'}
                    </strong>
                  </div>

                  <div>
                    <small className="block text-gray-500">
                      Resident phone
                    </small>

                    {incident.resident
                      ?.phone ? (
                      <a
                        className="font-semibold underline"
                        href={`tel:${incident.resident.phone}`}
                      >
                        {
                          incident.resident.phone
                        }
                      </a>
                    ) : (
                      <strong>
                        Not provided
                      </strong>
                    )}
                  </div>

                  <div>
                    <small className="block text-gray-500">
                      Emergency contact
                    </small>

                    <strong>
                      {incident.resident
                        ?.emergency_contact_name ??
                        'Not provided'}
                    </strong>
                  </div>

                  <div>
                    <small className="block text-gray-500">
                      Emergency contact
                      phone
                    </small>

                    {incident.resident
                      ?.emergency_contact_phone ? (
                      <a
                        className="font-semibold underline"
                        href={`tel:${incident.resident.emergency_contact_phone}`}
                      >
                        {
                          incident.resident.emergency_contact_phone
                        }
                      </a>
                    ) : (
                      <strong>
                        Not provided
                      </strong>
                    )}
                  </div>
                </div>

                <div className="mt-5 rounded-xl border bg-gray-50 p-4">
                  <small className="block text-gray-500">
                    Resident details
                  </small>

                  <p className="mt-1">
                    {incident.details ||
                      'No additional details supplied.'}
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  {incident.status ===
                    'open' && (
                    <button
                      type="button"
                      className="action"
                      disabled={
                        updatingId ===
                        incident.id
                      }
                      onClick={
                        () => {
                          void update(
                            incident,
                            'acknowledged'
                          )
                        }
                      }
                    >
                      Acknowledge
                    </button>
                  )}

                  {incident.status !==
                    'responding' && (
                    <button
                      type="button"
                      className="action secondary"
                      disabled={
                        updatingId ===
                        incident.id
                      }
                      onClick={
                        () => {
                          void update(
                            incident,
                            'responding'
                          )
                        }
                      }
                    >
                      Mark responding
                    </button>
                  )}
                </div>

                <div className="mt-5 border-t pt-5">
                  <label className="block text-sm font-semibold mb-2">
                    Resolution note
                  </label>

                  <textarea
                    rows={3}
                    maxLength={1000}
                    className="w-full border rounded-lg p-3"
                    placeholder="Describe the action taken and outcome before resolving."
                    value={
                      notes[
                        incident.id
                      ] ??
                      ''
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setNotes(
                          (
                            previous
                          ) => ({
                            ...previous,

                            [
                              incident.id
                            ]:
                              event.target.value,
                          })
                        )
                    }
                  />

                  <button
                    type="button"
                    className="action mt-3"
                    disabled={
                      updatingId ===
                      incident.id
                    }
                    onClick={
                      () => {
                        void update(
                          incident,
                          'resolved'
                        )
                      }
                    }
                  >
                    {updatingId ===
                    incident.id
                      ? 'Updating…'
                      : 'Resolve emergency'}
                  </button>
                </div>
              </article>
            )
          )}
        </div>
      ) : (
        <section className="panel p-6">
          <p className="empty">
            No active emergency
            incidents.
          </p>
        </section>
      )}

      {resolved.length >
        0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>
              Recently resolved
            </h2>

            <span className="pill">
              {
                resolved.length
              }{' '}
              shown
            </span>
          </div>

          <div className="panel-body space-y-3">
            {resolved
              .slice(
                0,
                20
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
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <strong>
                          {incident.resident
                            ?.full_name ??
                            'Resident'}
                        </strong>

                        <p className="text-sm text-gray-600">
                          {categoryLabel(
                            incident.category
                          )}

                          {' · '}

                          {incident.house
                            ?.address ??
                            'No address'}
                        </p>
                      </div>

                      <span className="pill">
                        Resolved
                      </span>
                    </div>

                    <p className="mt-2 text-sm">
                      Resolved{' '}
                      {dateTime(
                        incident.resolved_at
                      )}
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