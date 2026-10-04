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

const ADMIN_ROLES =
  new Set([
    'admin',
    'super_admin',
  ])

const PAYMENT_STATUSES =
  new Set([
    'all',
    'pending',
    'success',
    'failed',
    'abandoned',
  ])

const PAGE_SIZE =
  50

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

function validDate(
  value: string
) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(
      value
    ) &&
    Number.isFinite(
      Date.parse(
        value
      )
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

function dateWindow(
  from: string,
  to: string
) {
  const start =
    new Date(
      `${from}T00:00:00+01:00`
    )

  const end =
    new Date(
      `${to}T00:00:00+01:00`
    )

  end.setDate(
    end.getDate() +
      1
  )

  return {
    fromIso:
      start.toISOString(),

    toExclusiveIso:
      end.toISOString(),
  }
}

async function adminContext() {
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

  const {
    data:
      admin,
  } =
    await db
      .from(
        'admins'
      )
      .select(
        'id, role, full_name'
      )
      .eq(
        'auth_user_id',
        user.id
      )
      .maybeSingle()

  if (
    !admin ||
    !ADMIN_ROLES.has(
      admin.role
    )
  ) {
    return {
      error:
        NextResponse.json(
          {
            error:
              'Only estate administrators can manage gate revenue',
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
    admin,
    service:
      createServiceClient(),
  }
}

export async function GET(
  req: NextRequest
) {
  const context =
    await adminContext()

  if (
    context.error
  ) {
    return context.error
  }

  const now =
    new Date()

  const fallbackFrom =
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        1
      )
    )
      .toISOString()
      .slice(
        0,
        10
      )

  const fallbackTo =
    now
      .toISOString()
      .slice(
        0,
        10
      )

  const from =
    req.nextUrl
      .searchParams
      .get(
        'from'
      ) ??
    fallbackFrom

  const to =
    req.nextUrl
      .searchParams
      .get(
        'to'
      ) ??
    fallbackTo

  const status =
    req.nextUrl
      .searchParams
      .get(
        'status'
      ) ??
    'all'

  const chargeTypeId =
    req.nextUrl
      .searchParams
      .get(
        'chargeTypeId'
      ) ??
    ''

  const payer =
    (
      req.nextUrl
        .searchParams
        .get(
          'payer'
        ) ??
      ''
    )
      .trim()
      .slice(
        0,
        120
      )

  const paymentCode =
    (
      req.nextUrl
        .searchParams
        .get(
          'paymentCode'
        ) ??
      ''
    )
      .trim()
      .slice(
        0,
        30
      )

  const rawPage =
    Number(
      req.nextUrl
        .searchParams
        .get(
          'page'
        ) ??
        '1'
    )

  const page =
    Number.isInteger(
      rawPage
    ) &&
    rawPage >
      0
      ? rawPage
      : 1

  if (
    !validDate(
      from
    ) ||
    !validDate(
      to
    ) ||
    from >
      to
  ) {
    return NextResponse.json(
      {
        error:
          'Choose a valid date range',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    !PAYMENT_STATUSES.has(
      status
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Choose a valid payment status',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    chargeTypeId &&
    !validUuid(
      chargeTypeId
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Choose a valid gate charge',
      },
      {
        status:
          400,
      }
    )
  }

  const {
    fromIso,
    toExclusiveIso,
  } =
    dateWindow(
      from,
      to
    )

  let paymentsQuery =
    context.db
      .from(
        'gate_payments'
      )
      .select(`
        id,
        payment_code,
        reference,
        gate_charge_type_id,
        charge_name,
        amount,
        currency,
        payer_name,
        payer_email,
        payer_phone,
        company_name,
        vehicle_plate,
        host_reference,
        purpose_note,
        status,
        paid_at,
        admitted_at,
        created_at
      `, {
        count:
          'exact',
      })
      .gte(
        'created_at',
        fromIso
      )
      .lt(
        'created_at',
        toExclusiveIso
      )

  if (
    status !==
    'all'
  ) {
    paymentsQuery =
      paymentsQuery.eq(
        'status',
        status
      )
  }

  if (
    chargeTypeId
  ) {
    paymentsQuery =
      paymentsQuery.eq(
        'gate_charge_type_id',
        chargeTypeId
      )
  }

  if (
    payer
  ) {
    paymentsQuery =
      paymentsQuery.ilike(
        'payer_name',
        `%${payer}%`
      )
  }

  if (
    paymentCode
  ) {
    paymentsQuery =
      paymentsQuery.ilike(
        'payment_code',
        `%${paymentCode}%`
      )
  }

  const [
    paymentResult,
    chargeResult,
    revenueResult,
    awaitingResult,
  ] =
    await Promise.all([
      paymentsQuery
        .order(
          'created_at',
          {
            ascending:
              false,
          }
        )
        .range(
          (
            page -
            1
          ) *
            PAGE_SIZE,

          page *
            PAGE_SIZE -
            1
        ),

      context.db
        .from(
          'gate_charge_types'
        )
        .select(`
          id,
          name,
          description,
          amount,
          active,
          sort_order,
          created_at,
          updated_at
        `)
        .order(
          'sort_order',
          {
            ascending:
              true,
          }
        )
        .order(
          'name',
          {
            ascending:
              true,
          }
        ),

      context.db.rpc(
        'admin_gate_revenue_page',
        {
          p_from:
            from,

          p_to:
            to,

          p_limit:
            1,

          p_offset:
            0,
        }
      ),

      context.db
        .from(
          'gate_payments'
        )
        .select(
          'id',
          {
            count:
              'exact',

            head:
              true,
          }
        )
        .eq(
          'status',
          'success'
        )
        .is(
          'admitted_at',
          null
        )
        .gte(
          'paid_at',
          fromIso
        )
        .lt(
          'paid_at',
          toExclusiveIso
        ),
    ])

  if (
    paymentResult.error
  ) {
    return NextResponse.json(
      {
        error:
          'Gate payments could not be loaded',
      },
      {
        status:
          500,
      }
    )
  }

  if (
    chargeResult.error
  ) {
    return NextResponse.json(
      {
        error:
          'Gate charges could not be loaded',
      },
      {
        status:
          500,
      }
    )
  }

  if (
    revenueResult.error
  ) {
    return NextResponse.json(
      {
        error:
          'Gate revenue totals could not be loaded',
      },
      {
        status:
          500,
      }
    )
  }

  const revenue =
    revenueResult.data &&
    typeof revenueResult.data ===
      'object'
      ? revenueResult.data as {
          total?:
            unknown

          total_amount?:
            unknown
        }
      : {}

  const successfulCount =
    Number(
      revenue.total ??
        0
    )

  const totalRevenue =
    Number(
      revenue.total_amount ??
        0
    )

  return NextResponse.json(
    {
      payments:
        paymentResult.data ??
        [],

      charges:
        chargeResult.data ??
        [],

      totalCount:
        paymentResult.count ??
        0,

      successfulCount,

      awaitingAdmissionCount:
        awaitingResult.count ??
        0,

      admittedCount:
        Math.max(
          0,
          successfulCount -
            (
              awaitingResult.count ??
              0
            )
        ),

      totalRevenue,

      page,

      pageSize:
        PAGE_SIZE,

      from,

      to,
    },
    {
      headers: {
        'Cache-Control':
          'no-store',
      },
    }
  )
}

export async function POST(
  req: NextRequest
) {
  const context =
    await adminContext()

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
    typeof body !==
      'object'
  ) {
    return NextResponse.json(
      {
        error:
          'Invalid gate charge request',
      },
      {
        status:
          400,
      }
    )
  }

  const name =
    text(
      body.name
    )

  const description =
    text(
      body.description
    )

  const amount =
    Number(
      body.amount
    )

  const sortOrder =
    Number(
      body.sortOrder ??
        0
    )

  if (
    !name ||
    name.length >
      120
  ) {
    return NextResponse.json(
      {
        error:
          'Enter a gate charge name of 120 characters or fewer',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    description.length >
    500
  ) {
    return NextResponse.json(
      {
        error:
          'Description must be 500 characters or fewer',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <=
      0
  ) {
    return NextResponse.json(
      {
        error:
          'Enter a valid charge amount',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    !Number.isInteger(
      sortOrder
    ) ||
    sortOrder <
      0
  ) {
    return NextResponse.json(
      {
        error:
          'Sort order must be zero or greater',
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
        'gate_charge_types'
      )
      .insert({
        name,

        description:
          description ||
          null,

        amount,

        active:
          body.active !==
          false,

        sort_order:
          sortOrder,

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
          error.code ===
          '23505'
            ? 'A gate charge with this name already exists'
            : 'Gate charge could not be created',
      },
      {
        status:
          400,
      }
    )
  }

  return NextResponse.json(
    {
      charge:
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
    await adminContext()

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
          'Choose a valid gate charge',
      },
      {
        status:
          400,
      }
    )
  }

  const name =
    text(
      body.name
    )

  const description =
    text(
      body.description
    )

  const amount =
    Number(
      body.amount
    )

  const sortOrder =
    Number(
      body.sortOrder ??
        0
    )

  if (
    !name ||
    name.length >
      120
  ) {
    return NextResponse.json(
      {
        error:
          'Enter a valid gate charge name',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    description.length >
    500
  ) {
    return NextResponse.json(
      {
        error:
          'Description must be 500 characters or fewer',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <=
      0
  ) {
    return NextResponse.json(
      {
        error:
          'Enter a valid charge amount',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    !Number.isInteger(
      sortOrder
    ) ||
    sortOrder <
      0
  ) {
    return NextResponse.json(
      {
        error:
          'Sort order must be zero or greater',
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
        'gate_charge_types'
      )
      .update({
        name,

        description:
          description ||
          null,

        amount,

        active:
          body.active ===
          true,

        sort_order:
          sortOrder,

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
          error.code ===
          '23505'
            ? 'A gate charge with this name already exists'
            : 'Gate charge could not be updated',
      },
      {
        status:
          400,
      }
    )
  }

  if (!data) {
    return NextResponse.json(
      {
        error:
          'Gate charge not found',
      },
      {
        status:
          404,
      }
    )
  }

  return NextResponse.json({
    charge:
      data,
  })
}