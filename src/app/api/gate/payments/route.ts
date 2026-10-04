import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  createClient,
} from '@/lib/supabase/server'

const STAFF_ROLES =
  new Set([
    'super_admin',
    'admin',
    'gate_staff',
  ])

const PAYMENT_CODE =
  /^GATE-\d{6}-\d{6}$/i

async function staffContext() {
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
      staff,
    error:
      staffError,
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
    staffError ||
    !staff ||
    !STAFF_ROLES.has(
      staff.role
    )
  ) {
    return {
      error:
        NextResponse.json(
          {
            error:
              'Only estate staff can verify gate payments',
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
    staff,
  }
}

function normalizeCode(
  value:
    unknown
) {
  if (
    typeof value !==
    'string'
  ) {
    return null
  }

  const code =
    value
      .trim()
      .toUpperCase()

  return PAYMENT_CODE.test(
    code
  )
    ? code
    : null
}

const SELECT_FIELDS = `
  id,
  payment_code,
  reference,
  charge_name,
  amount,
  currency,
  payer_name,
  payer_phone,
  company_name,
  vehicle_plate,
  host_reference,
  purpose_note,
  status,
  paid_at,
  admitted_at,
  created_at
`

export async function GET() {
  const context =
    await staffContext()

  if (
    context.error
  ) {
    return context.error
  }

  const {
    data,
    error,
  } =
    await context.db
      .from(
        'gate_payments'
      )
      .select(
        SELECT_FIELDS
      )
      .eq(
        'status',
        'success'
      )
      .is(
        'admitted_at',
        null
      )
      .order(
        'paid_at',
        {
          ascending:
            false,
        }
      )
      .limit(
        20
      )

  if (error) {
    return NextResponse.json(
      {
        error:
          'Could not load gate payments',
      },
      {
        status:
          500,
      }
    )
  }

  return NextResponse.json(
    {
      payments:
        data ??
        [],
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
  req:
    NextRequest
) {
  const context =
    await staffContext()

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

  const code =
    normalizeCode(
      body?.code
    )

  if (!code) {
    return NextResponse.json(
      {
        error:
          'Enter a valid gate payment code',
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
    await context.db
      .from(
        'gate_payments'
      )
      .select(
        SELECT_FIELDS
      )
      .eq(
        'payment_code',
        code
      )
      .maybeSingle()

  if (error) {
    return NextResponse.json(
      {
        error:
          'Could not verify this gate payment',
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
          'Gate payment not found',
      },
      {
        status:
          404,
      }
    )
  }

  return NextResponse.json(
    {
      payment:
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

export async function PATCH(
  req:
    NextRequest
) {
  const context =
    await staffContext()

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

  const code =
    normalizeCode(
      body?.code
    )

  if (!code) {
    return NextResponse.json(
      {
        error:
          'Enter a valid gate payment code',
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
      'admit_gate_payment',
      {
        p_reference:
          code,
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

  if (
    !data?.ok
  ) {
    return NextResponse.json(
      {
        error:
          'Entry could not be admitted',
      },
      {
        status:
          500,
      }
    )
  }

  return NextResponse.json(
    {
      payment:
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