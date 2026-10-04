import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  createClient,
} from '@/lib/supabase/server'

import {
  createServiceClient,
} from '@/lib/supabase/service'

const PRIORITIES =
  new Set([
    'normal',
    'important',
    'urgent',
    'emergency',
  ])

const AUDIENCES =
  new Set([
    'all',
    'residents',
    'staff',
    'street',
    'household',
  ])

function validUuid(
  value: unknown
): value is string {
  return (
    typeof value ===
      'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  )
}

function validDateTime(
  value: unknown
): value is string {
  return (
    typeof value ===
      'string' &&
    Number.isFinite(
      Date.parse(
        value
      )
    )
  )
}

async function getAdminContext() {
  const db =
    await createClient()

  const {
    data: {
      user,
    },
  } =
    await db.auth.getUser()

  if (!user) {
    return {
      error:
        NextResponse.json(
          {
            error:
              'Not signed in',
          },
          {
            status:
              401,
          }
        ),
    }
  }

  const {
    data:
      admin,
  } =
    await db
      .from(
        'admins'
      )
      .select(
        'id, role'
      )
      .eq(
        'auth_user_id',
        user.id
      )
      .maybeSingle()

  if (
    !admin ||
    ![
      'admin',
      'super_admin',
    ].includes(
      admin.role
    )
  ) {
    return {
      error:
        NextResponse.json(
          {
            error:
              'Only estate administrators can manage announcements',
          },
          {
            status:
              403,
          }
        ),
    }
  }

  return {
    admin,
    service:
      createServiceClient(),
  }
}

function normalizeAnnouncement(
  input: unknown
) {
  if (
    !input ||
    typeof input !==
      'object'
  ) {
    return {
      error:
        'Invalid announcement request',
    }
  }

  const body =
    input as
      Record<
        string,
        unknown
      >

  const title =
    typeof body.title ===
      'string'
      ? body.title.trim()
      : ''

  const message =
    typeof body.body ===
      'string'
      ? body.body.trim()
      : ''

  const priority =
    typeof body.priority ===
      'string'
      ? body.priority
      : 'normal'

  const audience =
    typeof body.audience ===
      'string'
      ? body.audience
      : 'all'

  if (
    !title ||
    title.length >
      160
  ) {
    return {
      error:
        'Enter an announcement title of 160 characters or fewer',
    }
  }

  if (
    !message ||
    message.length >
      5000
  ) {
    return {
      error:
        'Enter an announcement message of 5,000 characters or fewer',
    }
  }

  if (
    !PRIORITIES.has(
      priority
    )
  ) {
    return {
      error:
        'Choose a valid announcement priority',
    }
  }

  if (
    !AUDIENCES.has(
      audience
    )
  ) {
    return {
      error:
        'Choose a valid announcement audience',
    }
  }

  const publishAt =
    validDateTime(
      body.publishAt
    )
      ? new Date(
          body.publishAt
        ).toISOString()
      : new Date()
          .toISOString()

  let expiresAt:
    | string
    | null =
      null

  if (
    body.expiresAt
  ) {
    if (
      !validDateTime(
        body.expiresAt
      )
    ) {
      return {
        error:
          'Choose a valid announcement expiry time',
      }
    }

    expiresAt =
      new Date(
        body.expiresAt
      ).toISOString()

    if (
      Date.parse(
        expiresAt
      ) <=
      Date.parse(
        publishAt
      )
    ) {
      return {
        error:
          'Expiry must be after the publish time',
      }
    }
  }

  let streetId:
    | string
    | null =
      null

  let houseId:
    | string
    | null =
      null

  if (
    audience ===
    'street'
  ) {
    if (
      !validUuid(
        body.streetId
      )
    ) {
      return {
        error:
          'Choose the street that should receive this announcement',
      }
    }

    streetId =
      body.streetId
  }

  if (
    audience ===
    'household'
  ) {
    if (
      !validUuid(
        body.houseId
      )
    ) {
      return {
        error:
          'Choose the household that should receive this announcement',
      }
    }

    houseId =
      body.houseId
  }

  return {
    value: {
      title,

      body:
        message,

      priority,

      audience,

      street_id:
        streetId,

      house_id:
        houseId,

      pinned:
        body.pinned ===
        true,

      publish_at:
        publishAt,

      expires_at:
        expiresAt,
    },
  }
}

export async function POST(
  req: NextRequest
) {
  const context =
    await getAdminContext()

  if (
    context.error
  ) {
    return context.error
  }

  const raw =
    await req
      .json()
      .catch(
        () =>
          null
      )

  const normalized =
    normalizeAnnouncement(
      raw
    )

  if (
    'error' in
    normalized
  ) {
    return NextResponse.json(
      {
        error:
          normalized.error,
      },
      {
        status:
          400,
      }
    )
  }

  const {
    data,
    error,
  } =
    await context.service
      .from(
        'announcements'
      )
      .insert({
        ...normalized.value,

        created_by:
          context.admin.id,

        updated_by:
          context.admin.id,
      })
      .select(
        '*'
      )
      .single()

  if (error) {
    return NextResponse.json(
      {
        error:
          'Announcement could not be created',
      },
      {
        status:
          500,
      }
    )
  }

  return NextResponse.json(
    {
      announcement:
        data,
    },
    {
      status:
        201,
    }
  )
}

export async function PATCH(
  req: NextRequest
) {
  const context =
    await getAdminContext()

  if (
    context.error
  ) {
    return context.error
  }

  const raw =
    await req
      .json()
      .catch(
        () =>
          null
      )

  if (
    !raw ||
    typeof raw !==
      'object'
  ) {
    return NextResponse.json(
      {
        error:
          'Invalid announcement request',
      },
      {
        status:
          400,
      }
    )
  }

  const body =
    raw as
      Record<
        string,
        unknown
      >

  if (
    !validUuid(
      body.id
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Choose a valid announcement',
      },
      {
        status:
          400,
      }
    )
  }

  const normalized =
    normalizeAnnouncement(
      body
    )

  if (
    'error' in
    normalized
  ) {
    return NextResponse.json(
      {
        error:
          normalized.error,
      },
      {
        status:
          400,
      }
    )
  }

  const {
    data,
    error,
  } =
    await context.service
      .from(
        'announcements'
      )
      .update({
        ...normalized.value,

        updated_by:
          context.admin.id,
      })
      .eq(
        'id',
        body.id
      )
      .select(
        '*'
      )
      .maybeSingle()

  if (error) {
    return NextResponse.json(
      {
        error:
          'Announcement could not be updated',
      },
      {
        status:
          500,
      }
    )
  }

  if (!data) {
    return NextResponse.json(
      {
        error:
          'Announcement not found',
      },
      {
        status:
          404,
      }
    )
  }

  return NextResponse.json({
    announcement:
      data,
  })
}

export async function DELETE(
  req: NextRequest
) {
  const context =
    await getAdminContext()

  if (
    context.error
  ) {
    return context.error
  }

  const body =
    await req
      .json()
      .catch(
        () =>
          null
      )

  if (
    !body ||
    !validUuid(
      body.id
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Choose a valid announcement',
      },
      {
        status:
          400,
      }
    )
  }

  const {
    data,
    error,
  } =
    await context.service
      .from(
        'announcements'
      )
      .delete()
      .eq(
        'id',
        body.id
      )
      .select(
        'id'
      )
      .maybeSingle()

  if (error) {
    return NextResponse.json(
      {
        error:
          'Announcement could not be deleted',
      },
      {
        status:
          500,
      }
    )
  }

  if (!data) {
    return NextResponse.json(
      {
        error:
          'Announcement not found',
      },
      {
        status:
          404,
      }
    )
  }

  return NextResponse.json({
    ok:
      true,
  })
}