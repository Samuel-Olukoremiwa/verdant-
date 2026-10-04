import {
  AnnouncementManager,
} from '@/components/announcement-manager'

import {
  createClient,
} from '@/lib/supabase/server'

export const dynamic =
  'force-dynamic'

function ErrorMessage({
  title,
  message,
}: {
  title:
    string

  message:
    string
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800"
    >
      <strong className="block">
        {title}
      </strong>

      <p className="mt-2">
        {message}
      </p>
    </div>
  )
}

export default async function AnnouncementsPage() {
  const db =
    await createClient()

  const [
    announcementResult,
    streetResult,
    houseResult,
  ] =
    await Promise.all([
      db
        .from(
          'announcements'
        )
        .select(`
          id,
          title,
          body,
          priority,
          audience,
          street_id,
          house_id,
          pinned,
          publish_at,
          expires_at,
          created_at
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
        ),

      db
        .from(
          'streets'
        )
        .select(
          'id, name'
        )
        .order(
          'name',
          {
            ascending:
              true,
          }
        ),

      db
        .from(
          'houses'
        )
        .select(
          'id, address, house_number'
        )
        .order(
          'address',
          {
            ascending:
              true,
          }
        ),
    ])

  if (
    announcementResult.error
  ) {
    console.error(
      'Announcements query failed:',
      announcementResult.error
    )
  }

  if (
    streetResult.error
  ) {
    console.error(
      'Announcement streets query failed:',
      streetResult.error
    )
  }

  if (
    houseResult.error
  ) {
    console.error(
      'Announcement houses query failed:',
      houseResult.error
    )
  }

  const error =
    announcementResult.error ??
    streetResult.error ??
    houseResult.error

  const developmentError =
    process.env.NODE_ENV ===
      'development' &&
    error
      ? `${error.message}${
          error.code
            ? ` (${error.code})`
            : ''
        }${
          error.details
            ? ` — ${error.details}`
            : ''
        }`
      : null

  return (
    <div className="page-wrap max-w-7xl">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">
            Estate communication
          </span>

          <h1 className="page-title">
            Announcements
          </h1>

          <p className="page-lead">
            Publish estate-wide,
            resident, staff, street
            or household notices
            from one place.
          </p>
        </div>
      </div>

      {error ? (
        <ErrorMessage
          title="Announcements could not be loaded."
          message={
            developmentError ??
            'Please reload the page or contact the system administrator.'
          }
        />
      ) : (
        <AnnouncementManager
          announcements={
            announcementResult
              .data ??
            []
          }
          streets={
            streetResult
              .data ??
            []
          }
          houses={
            houseResult
              .data ??
            []
          }
          asOf={
            new Date()
              .toISOString()
          }
        />
      )}
    </div>
  )
}

export const metadata = {
  title:
    'Admin Announcements',

  description:
    'Manage estate announcements with Zadant.',

  robots: {
    index:
      false,

    follow:
      false,
  },
}