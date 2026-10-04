'use client'

import {
  useState,
} from 'react'

import {
  useRouter,
} from 'next/navigation'

type Announcement = {
  id:
    string

  title:
    string

  body:
    string

  priority:
    string

  audience:
    string

  street_id:
    string | null

  house_id:
    string | null

  pinned:
    boolean

  publish_at:
    string

  expires_at:
    string | null

  created_at:
    string
}

type Street = {
  id:
    string

  name:
    string
}

type House = {
  id:
    string

  address:
    string

  house_number:
    string
}

type FormState = {
  title:
    string

  body:
    string

  priority:
    string

  audience:
    string

  streetId:
    string

  houseId:
    string

  pinned:
    boolean

  publishAt:
    string

  expiresAt:
    string
}

function toLagosInput(
  value: string
) {
  const parts =
    new Intl.DateTimeFormat(
      'en-GB',
      {
        timeZone:
          'Africa/Lagos',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',

        hour:
          '2-digit',

        minute:
          '2-digit',

        hourCycle:
          'h23',
      }
    )
      .formatToParts(
        new Date(
          value
        )
      )
      .reduce<
        Record<
          string,
          string
        >
      >(
        (
          result,
          part
        ) => {
          if (
            part.type !==
            'literal'
          ) {
            result[
              part.type
            ] =
              part.value
          }

          return result
        },
        {}
      )

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

function lagosInputToIso(
  value: string
) {
  if (!value) {
    return ''
  }

  return new Date(
    `${value}:00+01:00`
  ).toISOString()
}

function displayDate(
  value:
    string | null
) {
  if (!value) {
    return 'No expiry'
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

function blankForm():
  FormState {
  return {
    title:
      '',

    body:
      '',

    priority:
      'normal',

    audience:
      'all',

    streetId:
      '',

    houseId:
      '',

    pinned:
      false,

    publishAt:
      toLagosInput(
        new Date()
          .toISOString()
      ),

    expiresAt:
      '',
  }
}

function announcementStatus(
  announcement:
    Announcement,

  asOf:
    string
) {
  const now =
    Date.parse(
      asOf
    )

  if (
    Date.parse(
      announcement
        .publish_at
    ) >
    now
  ) {
    return 'Scheduled'
  }

  if (
    announcement
      .expires_at &&
    Date.parse(
      announcement
        .expires_at
    ) <=
      now
  ) {
    return 'Expired'
  }

  return 'Published'
}

export function AnnouncementManager({
  announcements,
  streets,
  houses,
  asOf,
}: {
  announcements:
    Announcement[]

  streets:
    Street[]

  houses:
    House[]

  asOf:
    string
}) {
  const router =
    useRouter()

  const [
    editingId,
    setEditingId,
  ] =
    useState<
      string | null
    >(
      null
    )

  const [
    form,
    setForm,
  ] =
    useState<FormState>(
      blankForm
    )

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

  const [
    success,
    setSuccess,
  ] =
    useState<
      string | null
    >(
      null
    )

  function change<
    K extends
      keyof FormState
  >(
    key: K,
    value:
      FormState[K]
  ) {
    setForm(
      (
        previous
      ) => ({
        ...previous,

        [key]:
          value,
      })
    )

    setError(
      null
    )

    setSuccess(
      null
    )
  }

  function reset() {
    setEditingId(
      null
    )

    setForm(
      blankForm()
    )

    setError(
      null
    )
  }

  function edit(
    announcement:
      Announcement
  ) {
    setEditingId(
      announcement.id
    )

    setForm({
      title:
        announcement.title,

      body:
        announcement.body,

      priority:
        announcement.priority,

      audience:
        announcement.audience,

      streetId:
        announcement.street_id ??
        '',

      houseId:
        announcement.house_id ??
        '',

      pinned:
        announcement.pinned,

      publishAt:
        toLagosInput(
          announcement
            .publish_at
        ),

      expiresAt:
        announcement
          .expires_at
          ? toLagosInput(
              announcement
                .expires_at
            )
          : '',
    })

    setError(
      null
    )

    setSuccess(
      null
    )

    window.scrollTo({
      top:
        0,

      behavior:
        'smooth',
    })
  }

  async function save(
    event:
      React.FormEvent
  ) {
    event.preventDefault()

    if (busy) {
      return
    }

    setBusy(
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
          '/api/admin/announcements',
          {
            method:
              editingId
                ? 'PATCH'
                : 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                ...(editingId
                  ? {
                      id:
                        editingId,
                    }
                  : {}),

                title:
                  form.title,

                body:
                  form.body,

                priority:
                  form.priority,

                audience:
                  form.audience,

                streetId:
                  form.audience ===
                  'street'
                    ? form.streetId
                    : null,

                houseId:
                  form.audience ===
                  'household'
                    ? form.houseId
                    : null,

                pinned:
                  form.pinned,

                publishAt:
                  lagosInputToIso(
                    form.publishAt
                  ),

                expiresAt:
                  form.expiresAt
                    ? lagosInputToIso(
                        form.expiresAt
                      )
                    : null,
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
            'Announcement could not be saved'
        )
      }

      setSuccess(
        editingId
          ? 'Announcement updated.'
          : 'Announcement published.'
      )

      setEditingId(
        null
      )

      setForm(
        blankForm()
      )

      router.refresh()
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : 'Announcement could not be saved'
      )
    } finally {
      setBusy(
        false
      )
    }
  }

  async function remove(
    announcement:
      Announcement
  ) {
    if (
      !window.confirm(
        `Delete "${announcement.title}"?`
      )
    ) {
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
          '/api/admin/announcements',
          {
            method:
              'DELETE',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                id:
                  announcement.id,
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
            'Announcement could not be deleted'
        )
      }

      if (
        editingId ===
        announcement.id
      ) {
        reset()
      }

      setSuccess(
        'Announcement deleted.'
      )

      router.refresh()
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : 'Announcement could not be deleted'
      )
    } finally {
      setBusy(
        false
      )
    }
  }

  return (
    <div>
      <section className="panel mb-6">
        <div className="panel-head">
          <div>
            <span className="eyebrow">
              Communication
            </span>

            <h2>
              {editingId
                ? 'Edit announcement'
                : 'Create announcement'}
            </h2>
          </div>

          {editingId && (
            <button
              type="button"
              className="action secondary"
              onClick={
                reset
              }
            >
              Cancel edit
            </button>
          )}
        </div>

        <div className="panel-body">
          <form
            onSubmit={
              save
            }
            className="space-y-5"
          >
            <div>
              <label
                className="block text-sm font-semibold mb-2"
                htmlFor="announcement-title"
              >
                Title
              </label>

              <input
                id="announcement-title"
                required
                maxLength={160}
                className="w-full border rounded-lg p-3"
                value={
                  form.title
                }
                onChange={
                  (
                    event
                  ) =>
                    change(
                      'title',
                      event
                        .target
                        .value
                    )
                }
                placeholder="e.g. Scheduled power maintenance"
              />
            </div>

            <div>
              <label
                className="block text-sm font-semibold mb-2"
                htmlFor="announcement-body"
              >
                Message
              </label>

              <textarea
                id="announcement-body"
                required
                maxLength={5000}
                rows={6}
                className="w-full border rounded-lg p-3"
                value={
                  form.body
                }
                onChange={
                  (
                    event
                  ) =>
                    change(
                      'body',
                      event
                        .target
                        .value
                    )
                }
                placeholder="Enter the message residents or staff should see."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  className="block text-sm font-semibold mb-2"
                  htmlFor="announcement-priority"
                >
                  Priority
                </label>

                <select
                  id="announcement-priority"
                  className="w-full border rounded-lg p-3"
                  value={
                    form.priority
                  }
                  onChange={
                    (
                      event
                    ) =>
                      change(
                        'priority',
                        event
                          .target
                          .value
                      )
                  }
                >
                  <option value="normal">
                    Normal
                  </option>

                  <option value="important">
                    Important
                  </option>

                  <option value="urgent">
                    Urgent
                  </option>

                  <option value="emergency">
                    Emergency
                  </option>
                </select>
              </div>

              <div>
                <label
                  className="block text-sm font-semibold mb-2"
                  htmlFor="announcement-audience"
                >
                  Audience
                </label>

                <select
                  id="announcement-audience"
                  className="w-full border rounded-lg p-3"
                  value={
                    form.audience
                  }
                  onChange={
                    (
                      event
                    ) =>
                      change(
                        'audience',
                        event
                          .target
                          .value
                      )
                  }
                >
                  <option value="all">
                    Everyone
                  </option>

                  <option value="residents">
                    All residents
                  </option>

                  <option value="staff">
                    Estate staff only
                  </option>

                  <option value="street">
                    Specific street
                  </option>

                  <option value="household">
                    Specific household
                  </option>
                </select>
              </div>
            </div>

            {form.audience ===
              'street' && (
              <div>
                <label
                  className="block text-sm font-semibold mb-2"
                  htmlFor="announcement-street"
                >
                  Street
                </label>

                <select
                  id="announcement-street"
                  required
                  className="w-full border rounded-lg p-3"
                  value={
                    form.streetId
                  }
                  onChange={
                    (
                      event
                    ) =>
                      change(
                        'streetId',
                        event
                          .target
                          .value
                      )
                  }
                >
                  <option value="">
                    Select a street
                  </option>

                  {streets.map(
                    (
                      street
                    ) => (
                      <option
                        key={
                          street.id
                        }
                        value={
                          street.id
                        }
                      >
                        {
                          street.name
                        }
                      </option>
                    )
                  )}
                </select>
              </div>
            )}

            {form.audience ===
              'household' && (
              <div>
                <label
                  className="block text-sm font-semibold mb-2"
                  htmlFor="announcement-house"
                >
                  Household
                </label>

                <select
                  id="announcement-house"
                  required
                  className="w-full border rounded-lg p-3"
                  value={
                    form.houseId
                  }
                  onChange={
                    (
                      event
                    ) =>
                      change(
                        'houseId',
                        event
                          .target
                          .value
                      )
                  }
                >
                  <option value="">
                    Select a household
                  </option>

                  {houses.map(
                    (
                      house
                    ) => (
                      <option
                        key={
                          house.id
                        }
                        value={
                          house.id
                        }
                      >
                        {
                          house.address ||
                          `House ${house.house_number}`
                        }
                      </option>
                    )
                  )}
                </select>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  className="block text-sm font-semibold mb-2"
                  htmlFor="announcement-publish"
                >
                  Publish date & time
                </label>

                <input
                  id="announcement-publish"
                  required
                  type="datetime-local"
                  className="w-full border rounded-lg p-3"
                  value={
                    form.publishAt
                  }
                  onChange={
                    (
                      event
                    ) =>
                      change(
                        'publishAt',
                        event
                          .target
                          .value
                      )
                  }
                />
              </div>

              <div>
                <label
                  className="block text-sm font-semibold mb-2"
                  htmlFor="announcement-expiry"
                >
                  Expiry date & time
                </label>

                <input
                  id="announcement-expiry"
                  type="datetime-local"
                  className="w-full border rounded-lg p-3"
                  value={
                    form.expiresAt
                  }
                  onChange={
                    (
                      event
                    ) =>
                      change(
                        'expiresAt',
                        event
                          .target
                          .value
                      )
                  }
                />

                <small className="block mt-1 text-gray-500">
                  Leave blank to keep
                  the announcement
                  active indefinitely.
                </small>
              </div>
            </div>

            <label className="flex items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={
                  form.pinned
                }
                onChange={
                  (
                    event
                  ) =>
                    change(
                      'pinned',
                      event
                        .target
                        .checked
                    )
                }
              />

              Pin this announcement
              to the top
            </label>

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
                className="text-green-700"
              >
                {success}
              </p>
            )}

            <button
              className="action"
              disabled={
                busy
              }
            >
              {busy
                ? 'Saving…'
                : editingId
                  ? 'Save changes'
                  : 'Publish announcement'}
            </button>
          </form>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>
              Announcement history
            </h2>

            <p className="text-sm mt-1">
              Published, scheduled
              and expired estate
              communications.
            </p>
          </div>

          <span className="pill">
            {
              announcements.length
            }{' '}
            total
          </span>
        </div>

        <div className="panel-body">
          {announcements.length ? (
            <div className="space-y-4">
              {announcements.map(
                (
                  announcement
                ) => {
                  const status =
                    announcementStatus(
                      announcement,
                      asOf
                    )

                  return (
                    <article
                      key={
                        announcement.id
                      }
                      className="rounded-xl border p-4"
                    >
                      <div className="flex flex-wrap justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap gap-2 mb-2">
                            <span className="pill capitalize">
                              {
                                announcement.priority
                              }
                            </span>

                            <span className="pill capitalize">
                              {
                                announcement.audience
                              }
                            </span>

                            <span className="pill">
                              {
                                status
                              }
                            </span>

                            {announcement.pinned && (
                              <span className="pill">
                                Pinned
                              </span>
                            )}
                          </div>

                          <h3 className="font-bold text-lg">
                            {
                              announcement.title
                            }
                          </h3>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="action secondary"
                            onClick={
                              () =>
                                edit(
                                  announcement
                                )
                            }
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="action secondary"
                            disabled={
                              busy
                            }
                            onClick={
                              () =>
                                remove(
                                  announcement
                                )
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <p
                        className="mt-3 text-sm"
                        style={{
                          whiteSpace:
                            'pre-wrap',
                        }}
                      >
                        {
                          announcement.body
                        }
                      </p>

                      <div className="mt-3 text-xs text-gray-500">
                        <span>
                          Publish:{' '}
                          {displayDate(
                            announcement
                              .publish_at
                          )}
                        </span>

                        {' · '}

                        <span>
                          Expiry:{' '}
                          {displayDate(
                            announcement
                              .expires_at
                          )}
                        </span>
                      </div>
                    </article>
                  )
                }
              )}
            </div>
          ) : (
            <p className="empty">
              No announcements
              have been created yet.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}