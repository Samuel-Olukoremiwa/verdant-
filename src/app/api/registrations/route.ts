import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'

const schema = z
  .object({
    surname: z
      .string()
      .trim()
      .min(1)
      .max(80),

    first_name: z
      .string()
      .trim()
      .min(1)
      .max(80),

    other_names: z
      .string()
      .trim()
      .max(100)
      .nullable(),

    phone: z
      .string()
      .trim()
      .regex(
        /^(?:\+?234|0)[789]\d{9}$/
      ),

    email: z
      .email()
      .max(254),

    street_id: z.uuid(),

    house_number: z
      .string()
      .trim()
      .min(1)
      .max(40),

    house_type: z
      .string()
      .trim()
      .max(80)
      .nullable(),

    relationship: z.enum([
      'owner',
      'tenant',
      'family_member',
    ]),

    move_in_date: z.iso.date(),

    property_allocation_date:
      z.iso.date(),

    consent: z.literal(true),

    website: z.string().max(0),
  })
  .strict()

function cleanHouseNumber(
  value: string
) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
}

export async function POST(
  req: NextRequest
) {
  const text = await req.text()

  if (text.length > 8192) {
    return NextResponse.json(
      {
        error:
          'Submission is too large',
      },
      {
        status: 413,
      }
    )
  }

  let json: unknown

  try {
    json = JSON.parse(text)
  } catch {
    return NextResponse.json(
      {
        error:
          'Invalid submission',
      },
      {
        status: 400,
      }
    )
  }

  const result =
    schema.safeParse(json)

  if (!result.success) {
    return NextResponse.json(
      {
        error:
          'Check your details, address, phone number and consent before submitting.',
      },
      {
        status: 400,
      }
    )
  }

  const secret =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY

  if (!secret) {
    return NextResponse.json(
      {
        error:
          'Registration is currently unavailable.',
      },
      {
        status: 503,
      }
    )
  }

  const service =
    createServiceClient()

  // Vercel overwrites this header.
  // Other hosts use a shared restrictive bucket.
  const ip =
    process.env.VERCEL === '1'
      ? req.headers.get(
          'x-vercel-forwarded-for'
        ) || 'unknown'
      : 'local'

  const key = createHmac(
    'sha256',
    secret
  )
    .update(
      'registration:' + ip
    )
    .digest('hex')

  const {
    data: allowed,
    error: limitError,
  } = await service.rpc(
    'consume_registration_limit',
    {
      p_key: key,
    }
  )

  if (limitError) {
    return NextResponse.json(
      {
        error:
          'Registration is currently unavailable. Please contact your inviting administrator.',
      },
      {
        status: 503,
      }
    )
  }

  if (!allowed) {
    return NextResponse.json(
      {
        error:
          'Too many submissions. Please try again later.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': '3600',
        },
      }
    )
  }

  const email =
    result.data.email
      .trim()
      .toLowerCase()

  // Do not allow somebody who is
  // already an active resident to
  // submit another resident identity.
  const {
    data: existingResident,
    error: residentLookupError,
  } = await service
    .from('residents')
    .select('id')
    .eq('is_active', true)
    .ilike('email', email)
    .limit(1)
    .maybeSingle()

  if (residentLookupError) {
    return NextResponse.json(
      {
        error:
          'Registration is currently unavailable. Please contact the estate administrator.',
      },
      {
        status: 503,
      }
    )
  }

  if (existingResident) {
    return NextResponse.json(
      {
        error:
          'An active resident already uses this email address. Please sign in or contact the estate administrator.',
      },
      {
        status: 409,
      }
    )
  }

  const {
    consent: acknowledged,
    website: honeypot,
    ...submittedFields
  } = result.data

  void acknowledged
  void honeypot

  const fields = {
    ...submittedFields,
    email,
    house_number:
      cleanHouseNumber(
        submittedFields.house_number
      ),
    consent_version:
      'demo-2026-09-21',
    consent_at:
      new Date().toISOString(),
  }

  const { error } = await service
    .from('registration_requests')
    .insert(fields)

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        {
          error:
            'A pending registration already exists for this email address.',
        },
        {
          status: 409,
        }
      )
    }

    return NextResponse.json(
      {
        error:
          'Could not submit your request. Please check your details or contact the estate administrator.',
      },
      {
        status: 400,
      }
    )
  }

  return NextResponse.json(
    {
      ok: true,
    },
    {
      status: 201,
    }
  )
}