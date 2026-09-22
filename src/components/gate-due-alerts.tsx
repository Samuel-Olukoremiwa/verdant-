'use client'

import {
  useEffect,
  useState,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import type { GateDueDetails } from '@/lib/gate-due-emails'

type Alert = {
  id: string

  details:
    GateDueDetails

  gate_due_emails: {
    status: string
  }[]
}

export function GateDueAlerts() {
  const [
    alerts,
    setAlerts,
  ] = useState<Alert[]>([])

  const [
    error,
    setError,
  ] = useState('')

  const [
    loaded,
    setLoaded,
  ] = useState(false)

  useEffect(() => {
    let active = true

    const db =
      createClient()

    async function refresh() {
      const {
        data,
        error,
      } = await db
        .from(
          'gate_due_alerts'
        )
        .select(
          'id, details, gate_due_emails(status)'
        )
        .order(
          'created_at',
          {
            ascending: false,
          }
        )
        .limit(20)

      if (!active) return

      setLoaded(true)

      setError(
        error
          ? 'Gate dues alerts could not be loaded. Check that the gate-alert migration has been applied.'
          : ''
      )

      if (data) {
        setAlerts(
          data as unknown as Alert[]
        )
      }
    }

    void refresh()

    const timer =
      setInterval(
        () =>
          void refresh(),
        30000
      )

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  return (
    <section
      className="panel mb-6"
      aria-label="Unpaid dues entry alerts"
    >
      <div className="panel-head">
        <h2>
          Unpaid-dues entry alerts
        </h2>

        <span className="text-xs">
          Latest 20 · updates every 30 seconds
        </span>
      </div>

      <div className="p-4">
        {error ? (
          <p role="alert">
            {error}
          </p>
        ) : !loaded ? (
          <p role="status">
            Loading entry alerts…
          </p>
        ) : !alerts.length ? (
          <p>
            No unpaid-dues entry alerts.
          </p>
        ) : (
          alerts.map(
            (alert) => {
              const details =
                alert.details

              const isVisitor =
                details.source_type ===
                'visitor'

              const sent =
                alert.gate_due_emails.filter(
                  (email) =>
                    email.status ===
                    'sent'
                ).length

              const queued =
                alert.gate_due_emails.filter(
                  (email) =>
                    [
                      'pending',
                      'sending',
                    ].includes(
                      email.status
                    )
                ).length

              const failed =
                alert.gate_due_emails.filter(
                  (email) =>
                    email.status ===
                    'failed'
                ).length

              return (
                <article
                  key={alert.id}
                  className="border-b py-4"
                >
                  <strong>
                    {isVisitor
                      ? `${details.name} entered as a visitor for ${details.host || 'a resident'}`
                      : `${details.name} entered the estate`}
                  </strong>

                  <p className="text-sm">
                    {details.address}
                    {' · '}
                    {new Date(
                      details.entered_at
                    ).toLocaleString(
                      'en-GB',
                      {
                        timeZone:
                          'Africa/Lagos',
                      }
                    )}
                    {' WAT'}
                  </p>

                  <p className="text-sm mt-1">
                    Household balance at entry:{' '}
                    <strong className="red">
                      ₦
                      {Number(
                        details.balance
                      ).toLocaleString(
                        'en-NG',
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }
                      )}
                    </strong>
                  </p>

                  <p className="text-sm mt-1">
                    Billing contact:{' '}
                    <strong>
                      {details.billing_contact_name ||
                        'Not assigned'}
                    </strong>
                  </p>

                  <p className="text-sm">
                    {details.email ||
                      'No billing email'}
                    {' · '}
                    {details.phone ||
                      'No billing phone'}
                  </p>

                  {isVisitor && (
                    <p className="text-xs text-amber-700 mt-2">
                      Visitor entry was approved. Outstanding
                      dues did not block access.
                    </p>
                  )}

                  <p className="text-xs text-gray-500 mt-2">
                    Emails accepted by provider: {sent};
                    {' '}
                    queued: {queued};
                    {' '}
                    needs review: {failed}.
                    {' '}
                    Acceptance does not confirm inbox delivery.
                  </p>
                </article>
              )
            }
          )
        )}
      </div>
    </section>
  )
}