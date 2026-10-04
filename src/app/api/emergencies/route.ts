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

const STAFF_ROLES =
  new Set([
    'super_admin',
    'admin',
    'gate_staff',
  ])

const CATEGORIES =
  new Set([
    'security',
    'medical',
    'fire',
    'other',
  ])

const UPDATE_STATUSES =
  new Set([
    'acknowledged',
    'responding',
    'resolved',
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

function text(
  value: unknown
) {
  return typeof value ===
    'string'
    ? value.trim()
    : ''
}

async function identity() {
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
              'Please sign in',
          },
          {
            status:
              401,
          }
        ),
    }
  }

  const service =
    createServiceClient()

  const [
    staffResult,
    residentResult,
  ] =
    await Promise.all([
      service
        .from(
          'admins'
        )
        .select(
          'id, full_name, role'
        )
        .eq(
          'auth_user_id',
          user.id
        )
        .maybeSingle(),

      service
        .from(
          'residents'
        )
        .select(`
          id,
          house_id,
          full_name,
          phone,
          emergency_contact_name,
          emergency_contact_phone
        `)
        .eq(
          'auth_user_id',
          user.id
        )
        .eq(
          'is_active',
          true
        )
        .maybeSingle(),
    ])

  const staff =
    staffResult.data

  const resident =
    residentResult.data

  if (
    !staff &&
    !resident
  ) {
    return {
      error:
        NextResponse.json(
          {
            error:
              'Your account is not linked to an active estate profile',
          },
          {
            status:
              403,
          }
        ),
    }
  }

  return {
    db,
    service,
    user,
    staff,
    resident,
  }
}

async function enrichedIncidents(
  service:
    ReturnType<
      typeof createServiceClient
    >,

  options: {
    residentId?:
      string

    limit:
      number
  }
) {
  let query =
    service
      .from(
        'emergency_incidents'
      )
      .select(`
        id,
        resident_id,
        house_id,
        category,
        details,
        status,
        raised_at,
        acknowledged_at,
        acknowledged_by,
        responding_at,
        responding_by,
        resolved_at,
        resolved_by,
        resolution_note,
        updated_at
      `)
      .order(
        'raised_at',
        {
          ascending:
            false,
        }
      )
      .limit(
        options.limit
      )

  if (
    options.residentId
  ) {
    query =
      query.eq(
        'resident_id',
        options.residentId
      )
  }

  const {
    data:
      incidents,
    error,
  } =
    await query

  if (error) {
    throw error
  }

  const rows =
    incidents ??
    []

  const residentIds =
    [
      ...new Set(
        rows
          .map(
            (
              incident
            ) =>
              incident.resident_id
          )
          .filter(
            (
              id
            ): id is string =>
              Boolean(
                id
              )
          )
      ),
    ]

  const houseIds =
    [
      ...new Set(
        rows
          .map(
            (
              incident
            ) =>
              incident.house_id
          )
          .filter(
            (
              id
            ): id is string =>
              Boolean(
                id
              )
          )
      ),
    ]

  const [
    residentsResult,
    housesResult,
  ] =
    await Promise.all([
      residentIds.length >
      0
        ? service
            .from(
              'residents'
            )
            .select(`
              id,
              full_name,
              phone,
              emergency_contact_name,
              emergency_contact_phone
            `)
            .in(
              'id',
              residentIds
            )
        : Promise.resolve({
            data:
              [],
            error:
              null,
          }),

      houseIds.length >
      0
        ? service
            .from(
              'houses'
            )
            .select(
              'id, address'
            )
            .in(
              'id',
              houseIds
            )
        : Promise.resolve({
            data:
              [],
            error:
              null,
          }),
    ])

  if (
    residentsResult.error
  ) {
    throw residentsResult.error
  }

  if (
    housesResult.error
  ) {
    throw housesResult.error
  }

  const residentMap =
    new Map(
      (
        residentsResult.data ??
        []
      ).map(
        (
          resident
        ) => [
          resident.id,
          resident,
        ]
      )
    )

  const houseMap =
    new Map(
      (
        housesResult.data ??
        []
      ).map(
        (
          house
        ) => [
          house.id,
          house,
        ]
      )
    )

  return rows.map(
    (
      incident
    ) => ({
      ...incident,

      resident:
        incident.resident_id
          ? residentMap.get(
              incident.resident_id
            ) ??
            null
          : null,

      house:
        incident.house_id
          ? houseMap.get(
              incident.house_id
            ) ??
            null
          : null,
    })
  )
}

export async function GET(
  req:
    NextRequest
) {
  const context =
    await identity()

  if (
    context.error
  ) {
    return context.error
  }

  const scope =
    req.nextUrl
      .searchParams
      .get(
        'scope'
      ) ??
    'resident'

  try {
    if (
      scope ===
      'staff'
    ) {
      if (
        !context.staff ||
        !STAFF_ROLES.has(
          context.staff.role
        )
      ) {
        return NextResponse.json(
          {
            error:
              'Only estate staff can view estate emergency operations',
          },
          {
            status:
              403,
          }
        )
      }

      const incidents =
        await enrichedIncidents(
          context.service,
          {
            limit:
              100,
          }
        )

      return NextResponse.json(
        {
          incidents,
        },
        {
          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      )
    }

    if (
      !context.resident
    ) {
      return NextResponse.json(
        {
          error:
            'Resident profile not found',
        },
        {
          status:
            403,
        }
      )
    }

    const incidents =
      await enrichedIncidents(
        context.service,
        {
          residentId:
            context.resident.id,

          limit:
            20,
        }
      )

    return NextResponse.json(
      {
        incidents,
      },
      {
        headers: {
          'Cache-Control':
            'no-store',
        },
      }
    )
  } catch {
    return NextResponse.json(
      {
        error:
          'Emergency information could not be loaded',
      },
      {
        status:
          500,
      }
    )
  }
}

export async function POST(
  req:
    NextRequest
) {
  const context =
    await identity()

  if (
    context.error
  ) {
    return context.error
  }

  if (
    !context.resident
  ) {
    return NextResponse.json(
      {
        error:
          'Only an active resident can raise a resident emergency alert',
      },
      {
        status:
          403,
      }
    )
  }

  const body =
    await req
      .json()
      .catch(
        () =>
          null
      )

  const category =
    text(
      body?.category
    ).toLowerCase()

  const details =
    text(
      body?.details
    )

  if (
    !CATEGORIES.has(
      category
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Choose a valid emergency category',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    details.length >
    1000
  ) {
    return NextResponse.json(
      {
        error:
          'Emergency details must be 1,000 characters or fewer',
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
    await context.db.rpc(
      'raise_emergency_incident',
      {
        p_category:
          category,

        p_details:
          details ||
          null,
      }
    )

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status:
          400,
      }
    )
  }

  return NextResponse.json(
    {
      incident:
        data,
    },
    {
      status:
        201,

      headers: {
        'Cache-Control':
          'no-store',
      },
    }
  )
}

export async function PATCH(
  req:
    NextRequest
) {
  const context =
    await identity()

  if (
    context.error
  ) {
    return context.error
  }

  if (
    !context.staff ||
    !STAFF_ROLES.has(
      context.staff.role
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Only estate staff can update emergency incidents',
      },
      {
        status:
          403,
      }
    )
  }

  const body =
    await req
      .json()
      .catch(
        () =>
          null
      )

  const id =
    body?.id

  const status =
    text(
      body?.status
    ).toLowerCase()

  const note =
    text(
      body?.note
    )

  if (
    !validUuid(
      id
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Choose a valid emergency incident',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    !UPDATE_STATUSES.has(
      status
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Choose a valid emergency status',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    note.length >
    1000
  ) {
    return NextResponse.json(
      {
        error:
          'Emergency note must be 1,000 characters or fewer',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    status ===
      'resolved' &&
    !note
  ) {
    return NextResponse.json(
      {
        error:
          'Enter a resolution note before resolving the emergency',
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
    await context.db.rpc(
      'update_emergency_incident',
      {
        p_id:
          id,

        p_status:
          status,

        p_note:
          note ||
          null,
      }
    )

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status:
          error.code ===
            '42501'
            ? 403
            : 400,
      }
    )
  }

  return NextResponse.json(
    {
      incident:
        data,
    },
    {
      headers: {
        'Cache-Control':
          'no-store',
      },
    }
  )
}