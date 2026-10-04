import QRCode from 'qrcode'

import {
  VisitorGate,
} from '@/components/visitor-gate'

import {
  VisitorEntryLog,
} from '@/components/visitor-entry-log'

import {
  GateScanner,
} from '@/components/gate-scanner'

import {
  GatePaymentVerifier,
} from '@/components/gate-payment-verifier'

import {
  createClient,
} from '@/lib/supabase/server'

import {
  getCurrentUser,
} from '@/lib/auth'

import {
  siteUrl,
} from '@/lib/site-url'

import {
  formatDateTimeGb,
} from '@/lib/date-format'

type Log = {
  id:
    string

  direction:
    string

  scanned_at:
    string

  scanned_by:
    string | null

  residents: {
    full_name:
      string
  } | null
}

export default async function GatePage() {
  const supabase =
    await createClient()

  const user =
    await getCurrentUser()

  const {
    data,
  } =
    await supabase
      .from(
        'access_logs'
      )
      .select(`
        id,
        direction,
        scanned_at,
        scanned_by,
        residents (
          full_name
        )
      `)
      .order(
        'scanned_at',
        {
          ascending:
            false,
        }
      )
      .limit(
        30
      )

  const logs =
    (
      data ??
      []
    ) as unknown as
      Log[]

  const today =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'Africa/Lagos',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',
      }
    ).format(
      new Date()
    )

  const paymentUrl =
    new URL(
      '/pay/gate',
      siteUrl()
    ).toString()

  const paymentQr =
    await QRCode.toDataURL(
      paymentUrl,
      {
        width:
          520,

        margin:
          4,

        errorCorrectionLevel:
          'H',
      }
    )

  return (
    <div className="gate-wrap">
      <span className="eyebrow">
        Gate workspace
      </span>

      <h1>
        Access activity.
      </h1>

      <p className="page-lead">
        Resident access,
        visitors and external gate
        payments in one place.
      </p>

      <section className="gate-metric">
        <span>
          Recorded today
        </span>

        <strong>
          {
            logs.filter(
              (
                log
              ) => {
                const date =
                  new Intl.DateTimeFormat(
                    'en-CA',
                    {
                      timeZone:
                        'Africa/Lagos',

                      year:
                        'numeric',

                      month:
                        '2-digit',

                      day:
                        '2-digit',
                    }
                  ).format(
                    new Date(
                      log.scanned_at
                    )
                  )

                return (
                  date ===
                  today
                )
              }
            ).length
          }
        </strong>

        <small>
          resident entry and exit
          scans
        </small>
      </section>

      <section className="panel p-5 mb-5">
        <div className="grid gap-6 md:grid-cols-[220px_1fr] md:items-center">
          <div className="rounded-xl border bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                paymentQr
              }
              alt="QR code for estate gate payments"
              className="w-full h-auto"
            />
          </div>

          <div>
            <span className="eyebrow">
              Gate revenue
            </span>

            <h2 className="text-xl font-bold mt-1">
              Pay Gate Dues
            </h2>

            <p className="mt-2 text-sm">
              Contractors,
              vendors, artisans
              and other chargeable
              visitors can scan
              this QR code with
              their phone.
            </p>

            <p className="mt-3 text-sm">
              They select the
              applicable estate
              charge and complete
              payment through
              Paystack.
            </p>

            <p className="mt-4 text-xs text-gray-500 break-all">
              {
                paymentUrl
              }
            </p>

            <p className="mt-3 text-xs text-gray-500">
              The QR contains only
              the public payment
              page URL. Amounts
              are always resolved
              by Zadant on the
              server.
            </p>
          </div>
        </div>
      </section>

      <GatePaymentVerifier />

      <VisitorGate />

      <section
        style={{
          marginBottom:
            '1.5rem',
        }}
      >
        <GateScanner
          scannedByLabel={
            user?.name ??
            'Gate staff'
          }
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>
            Latest resident scans
          </h2>

          <span className="eyebrow">
            Live record
          </span>
        </div>

        <div className="panel-body">
          {logs.length ? (
            logs.map(
              (
                log
              ) => (
                <div
                  className="activity"
                  key={
                    log.id
                  }
                >
                  <span
                    className={`activity-symbol ${
                      log.direction ===
                      'exit'
                        ? 'exit'
                        : ''
                    }`}
                  >
                    {log.direction ===
                    'exit'
                      ? '↗'
                      : '↘'}
                  </span>

                  <div>
                    <strong>
                      {log.residents
                        ?.full_name ??
                        'Unknown resident'}
                    </strong>

                    <small>
                      {log.direction ===
                      'exit'
                        ? 'Exited'
                        : 'Entered'}

                      {' · '}

                      {formatDateTimeGb(
                        log.scanned_at
                      )}

                      {' WAT'}

                      {log.scanned_by
                        ? ` · scanned by ${log.scanned_by}`
                        : ''}
                    </small>
                  </div>
                </div>
              )
            )
          ) : (
            <p className="empty">
              No resident access
              activity has been
              recorded yet.
            </p>
          )}
        </div>
      </section>

      <VisitorEntryLog />
    </div>
  )
}

export const metadata = {
  title:
    'Gate',

  description:
    'Manage estate gate access and payments with Zadant.',

  robots: {
    index:
      false,

    follow:
      false,
  },
}