import {
  NextRequest,
  NextResponse,
} from 'next/server'
import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'

const houseNumberSchema =
  z.string().regex(
    /^(?:[1-9]|[1-4][0-9]|50)$/
  )

const optionalBlockFlat =
  z
    .string()
    .regex(/^(?:[1-9]|10)$/)
    .nullable()

const phoneSchema =
  z
    .string()
    .trim()
    .min(11)
    .max(16)
    .regex(
      /^\+?[0-9]{10,15}$/
    )

const schema =
  z
    .object({
      surname:
        z
          .string()
          .trim()
          .min(1)
          .max(80),

      first_name:
        z
          .string()
          .trim()
          .min(1)
          .max(80),

      other_names:
        z
          .string()
          .trim()
          .max(100)
          .nullable(),

      phone:
        phoneSchema,

      email:
        z
          .email()
          .max(254),

      street_id:
        z.uuid(),

      house_number:
        houseNumberSchema,

      block_number:
        optionalBlockFlat,

      flat_number:
        optionalBlockFlat,

      house_type:
        z
          .string()
          .trim()
          .max(80)
          .nullable(),

      relationship:
        z.enum([
          'owner',
          'tenant',
          'family_member',
        ]),

      move_in_date:
        z.iso.date(),

      property_allocation_date:
        z.iso.date(),

      vehicle_plate_numbers:
        z
          .array(
            z
              .string()
              .trim()
              .min(1)
              .max(30)
          )
          .max(10),

      emergency_contact_name:
        z
          .string()
          .trim()
          .max(120)
          .nullable(),

      emergency_contact_phone:
        phoneSchema.nullable(),

      consent:
        z.literal(true),

      website:
        z.string().max(0),
    })
    .strict()

export async function POST(
  req: NextRequest
) {
  const text =
    await req.text()

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
    json =
      JSON.parse(text)
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
          'Check your name, address, status, phone number, email, dates and consent before submitting.',
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

  const ip =
    process.env.VERCEL ===
    '1'
      ? req.headers.get(
          'x-vercel-forwarded-for'
        ) || 'unknown'
      : 'local'

  const key =
    createHmac(
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
  } =
    await service.rpc(
      'consume_registration_limit',
      {
        p_key: key,
      }
    )

  if (limitError) {
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

  if (!allowed) {
    return NextResponse.json(
      {
        error:
          'Too many submissions. Please try again later.',
      },
      {
        status: 429,

        headers: {
          'Retry-After':
            '3600',
        },
      }
    )
  }

  const email =
    result.data.email
      .trim()
      .toLowerCase()

  const {
    data: existingResident,
    error: residentLookupError,
  } =
    await service
      .from('residents')
      .select('id')
      .eq(
        'is_active',
        true
      )
      .ilike(
        'email',
        email
      )
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
    ...fields
  } = result.data

  void acknowledged
  void honeypot

  const { error } =
    await service
      .from(
        'registration_requests'
      )
      .insert({
        ...fields,

        email,

        consent_version:
          'demo-2026-09-22',

        consent_at:
          new Date()
            .toISOString(),
      })

  if (error) {
    if (
      error.code ===
      '23505'
    ) {
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
          'Could not submit your registration. Please check your details or contact the estate administrator.',
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