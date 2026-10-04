import {
  createClient,
} from '@/lib/supabase/server'

import {
  formatDateTimeGb,
} from '@/lib/date-format'

type Announcement = {
  id:
    string

  title:
    string

  body:
    string

  priority:
    string

  pinned:
    boolean

  publish_at:
    string
}

function priorityLabel(
  priority: string
) {
  switch (
    priority
  ) {
    case 'emergency':
      return 'Emergency'

    case 'urgent':
      return 'Urgent'

    case 'important':
      return 'Important'

    default:
      return 'Notice'
  }
}

function priorityStyle(
  priority: string
): React.CSSProperties {
  if (
    priority ===
    'emergency'
  ) {
    return {
      border:
        '2px solid #b91c1c',

      background:
        '#fef2f2',
    }
  }

  if (
    priority ===
    'urgent'
  ) {
    return {
      border:
        '2px solid #ea580c',

      background:
        '#fff7ed',
    }
  }

  if (
    priority ===
    'important'
  ) {
    return {
      border:
        '1px solid #d97706',

      background:
        '#fffbeb',
    }
  }

  return {
    border:
      '1px solid #e5e7eb',

    background:
      '#ffffff',
  }
}

export async function AnnouncementFeed() {
  const db =
    await createClient()

  const {
    data,
    error,
  } =
    await db
      .from(
        'announcements'
      )
      .select(`
        id,
        title,
        body,
        priority,
        pinned,
        publish_at
      `)
      .order(
        'pinned',
        {
          ascending:
            false,
        }
      )
      .order(
        'publish_at',
        {
          ascending:
            false,
        }
      )
      .limit(
        6
      )

  if (
    error ||
    !data?.length
  ) {
    return null
  }

  const announcements =
    data as
      Announcement[]

  return (
    <section
      style={{
        width:
          '100%',

        maxWidth:
          '1200px',

        margin:
          '0 auto',

        padding:
          '1.25rem 1.25rem 0',
      }}
    >
      <div className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">
              Estate notices
            </span>

            <h2>
              Announcements
            </h2>
          </div>

          <span className="pill">
            {
              announcements.length
            }{' '}
            active
          </span>
        </div>

        <div className="panel-body">
          <div className="space-y-3">
            {announcements.map(
              (
                announcement
              ) => (
                <article
                  key={
                    announcement.id
                  }
                  className="rounded-xl p-4"
                  style={
                    priorityStyle(
                      announcement.priority
                    )
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>
                      {
                        announcement.title
                      }
                    </strong>

                    <span className="pill">
                      {priorityLabel(
                        announcement.priority
                      )}
                    </span>

                    {announcement.pinned && (
                      <span className="pill">
                        Pinned
                      </span>
                    )}
                  </div>

                  <p
                    className="mt-2 text-sm"
                    style={{
                      whiteSpace:
                        'pre-wrap',
                    }}
                  >
                    {
                      announcement.body
                    }
                  </p>

                  <small className="block mt-2 text-gray-500">
                    Published{' '}
                    {formatDateTimeGb(
                      announcement
                        .publish_at
                    )}{' '}
                    WAT
                  </small>
                </article>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  )
}