import {
  VisitorCheckoutButton,
} from '@/components/visitor-checkout-button'

import {
  createClient,
} from '@/lib/supabase/server'

import {
  formatDateTimeGb,
} from '@/lib/date-format'

type VisitorRecord = {
  id:
    string

  visitor_name:
    string

  visitor_phone:
    | string
    | null

  address:
    string

  redeemed_at:
    string

  checked_out_at:
    | string
    | null
}

function visitDuration(
  checkedIn:
    string,

  checkedOut:
    string
) {
  const start =
    new Date(
      checkedIn
    ).getTime()

  const end =
    new Date(
      checkedOut
    ).getTime()

  if (
    !Number.isFinite(
      start
    ) ||
    !Number.isFinite(
      end
    )
  ) {
    return ''
  }

  const totalMinutes =
    Math.max(
      0,
      Math.floor(
        (
          end -
          start
        ) /
          60000
      )
    )

  const hours =
    Math.floor(
      totalMinutes /
        60
    )

  const minutes =
    totalMinutes %
    60

  if (
    hours ===
    0
  ) {
    return `${minutes} min`
  }

  if (
    minutes ===
    0
  ) {
    return `${hours} hr${hours === 1 ? '' : 's'}`
  }

  return `${hours} hr${hours === 1 ? '' : 's'} ${minutes} min`
}

export async function VisitorEntryLog() {
  const db =
    await createClient()

  const {
    data,
    error,
  } =
    await db
      .from(
        'visitor_passes'
      )
      .select(`
        id,
        visitor_name,
        visitor_phone,
        address,
        redeemed_at,
        checked_out_at
      `)
      .not(
        'redeemed_at',
        'is',
        null
      )
      .order(
        'redeemed_at',
        {
          ascending:
            false,
        }
      )
      .limit(
        50
      )

  const visitors =
    (
      data ??
      []
    ) as unknown as
      VisitorRecord[]

  const inside =
    visitors.filter(
      (
        visitor
      ) =>
        !visitor
          .checked_out_at
    )

  return (
    <>
      <section className="panel mt-5">
        <div className="panel-head">
          <div>
            <h2>
              Visitors currently inside
            </h2>

            <p className="text-sm mt-1">
              Visitors who have
              checked in but have
              not yet been checked
              out.
            </p>
          </div>

          <span className="pill">
            {
              inside.length
            }{' '}
            inside
          </span>
        </div>

        <div className="panel-body">
          {error ? (
            <p role="alert">
              Visitor records
              could not be loaded.
            </p>
          ) : inside.length ? (
            inside.map(
              (
                visitor
              ) => (
                <div
                  className="activity"
                  key={
                    visitor.id
                  }
                >
                  <span className="activity-symbol">
                    ↘
                  </span>

                  <div
                    style={{
                      flex:
                        1,
                    }}
                  >
                    <strong>
                      {
                        visitor
                          .visitor_name
                      }
                    </strong>

                    {visitor.visitor_phone && (
                      <p>
                        Phone:{' '}
                        {
                          visitor
                            .visitor_phone
                        }
                      </p>
                    )}

                    <p>
                      {
                        visitor
                          .address
                      }
                    </p>

                    <small>
                      Checked in{' '}
                      {formatDateTimeGb(
                        visitor
                          .redeemed_at
                      )}{' '}
                      WAT
                    </small>
                  </div>

                  <VisitorCheckoutButton
                    id={
                      visitor.id
                    }
                    visitorName={
                      visitor
                        .visitor_name
                    }
                  />
                </div>
              )
            )
          ) : (
            <p className="empty">
              No visitors are
              currently recorded
              inside the estate.
            </p>
          )}
        </div>
      </section>

      <section className="panel mt-5">
        <div className="panel-head">
          <h2>
            Recent visitor activity
          </h2>

          <span className="eyebrow">
            Check-in / check-out
          </span>
        </div>

        <div className="panel-body">
          {error ? (
            <p role="alert">
              Visitor activity
              could not be loaded.
            </p>
          ) : visitors.length ? (
            visitors.map(
              (
                visitor
              ) => {
                const duration =
                  visitor
                    .checked_out_at
                    ? visitDuration(
                        visitor
                          .redeemed_at,

                        visitor
                          .checked_out_at
                      )
                    : null

                return (
                  <div
                    className="activity"
                    key={
                      visitor.id
                    }
                  >
                    <span
                      className={`activity-symbol ${
                        visitor
                          .checked_out_at
                          ? 'exit'
                          : ''
                      }`}
                    >
                      {visitor
                        .checked_out_at
                        ? '↗'
                        : '↘'}
                    </span>

                    <div>
                      <strong>
                        {
                          visitor
                            .visitor_name
                        }
                      </strong>

                      {visitor.visitor_phone && (
                        <p>
                          Phone:{' '}
                          {
                            visitor
                              .visitor_phone
                          }
                        </p>
                      )}

                      <p>
                        {
                          visitor
                            .address
                        }
                      </p>

                      <small>
                        Entered{' '}
                        {formatDateTimeGb(
                          visitor
                            .redeemed_at
                        )}{' '}
                        WAT
                      </small>

                      {visitor
                        .checked_out_at ? (
                        <small
                          style={{
                            display:
                              'block',
                          }}
                        >
                          Exited{' '}
                          {formatDateTimeGb(
                            visitor
                              .checked_out_at
                          )}{' '}
                          WAT
                          {duration
                            ? ` · ${duration}`
                            : ''}
                        </small>
                      ) : (
                        <small
                          style={{
                            display:
                              'block',
                          }}
                        >
                          Currently
                          inside
                        </small>
                      )}
                    </div>
                  </div>
                )
              }
            )
          ) : (
            <p className="empty">
              No visitor activity
              has been recorded yet.
            </p>
          )}
        </div>
      </section>
    </>
  )
}