import {
  createHash,
} from 'crypto'

import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  createServiceClient,
} from '@/lib/supabase/service'

import {
  initializeTransaction,
} from '@/lib/paystack'

function validUuid(
  value:
    unknown
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
  value:
    unknown
) {
  return typeof value ===
    'string'
    ? value.trim()
    : ''
}

function optionalText(
  value:
    unknown,
  maximum:
    number
) {
  const valueText =
    text(
      value
    )

  if (!valueText) {
    return null
  }

  if (
    valueText.length >
    maximum
  ) {
    throw new Error(
      'One of the supplied fields is too long'
    )
  }

  return valueText
}

function requestIp(
  req:
    NextRequest
) {
  const forwarded =
    req.headers
      .get(
        'x-forwarded-for'
      )
      ?.split(
        ','
      )[0]
      ?.trim()

  return (
    forwarded ||
    req.headers.get(
      'x-real-ip'
    ) ||
    'unknown'
  )
}

export async function POST(
  req:
    NextRequest
) {
  let body:
    Record<
      string,
      unknown
    >

  try {
    body =
      await req.json()
  } catch {
    return NextResponse.json(
      {
        error:
          'Invalid payment request',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    !validUuid(
      body.chargeTypeId
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Choose what you are paying for',
      },
      {
        status:
          400,
      }
    )
  }

  const payerName =
    text(
      body.payerName
    )

  const payerEmail =
    text(
      body.payerEmail
    ).toLowerCase()

  const payerPhone =
    text(
      body.payerPhone
    )

  if (
    payerName.length <
      2 ||
    payerName.length >
      120
  ) {
    return NextResponse.json(
      {
        error:
          'Enter your name',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      payerEmail
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Enter a valid email address',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    !/^[0-9+\s-]{7,20}$/.test(
      payerPhone
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Enter a valid phone number',
      },
      {
        status:
          400,
      }
    )
  }

  let companyName:
    string | null

  let vehiclePlate:
    string | null

  let purposeNote:
    string | null

  try {
    companyName =
      optionalText(
        body.companyName,
        160
      )

    vehiclePlate =
      optionalText(
        body.vehiclePlate,
        40
      )

    purposeNote =
      optionalText(
        body.purposeNote,
        500
      )
  } catch (
    caught
  ) {
    return NextResponse.json(
      {
        error:
          caught instanceof
            Error
            ? caught.message
            : 'Invalid payment details',
      },
      {
        status:
          400,
      }
    )
  }

  const service =
    createServiceClient()

  /*
   * Resolve the selected house on the server.
   *
   * The browser sends only the house UUID. We do not trust
   * a client-provided address or resident/host name.
   */
  let hostReference:
    string | null =
      null

  if (
    body.houseId !==
      null &&
    body.houseId !==
      undefined &&
    body.houseId !==
      ''
  ) {
    if (
      !validUuid(
        body.houseId
      )
    ) {
      return NextResponse.json(
        {
          error:
            'Choose a valid house',
        },
        {
          status:
            400,
        }
      )
    }

    const {
      data:
        house,
      error:
        houseError,
    } =
      await service
        .from(
          'houses'
        )
        .select(
          'id, address'
        )
        .eq(
          'id',
          body.houseId
        )
        .maybeSingle()

    if (
      houseError
    ) {
      return NextResponse.json(
        {
          error:
            'Could not verify the selected house',
        },
        {
          status:
            500,
        }
      )
    }

    if (!house) {
      return NextResponse.json(
        {
          error:
            'The selected house could not be found',
        },
        {
          status:
            400,
        }
      )
    }

    hostReference =
      house.address
  }

  /*
   * Reuse Zadant's persistent one-hour limiter.
   *
   * Raw IP/email values are not stored. Only their SHA-256
   * rate-limit bucket is persisted.
   */
  const rateKey =
    createHash(
      'sha256'
    )
      .update(
        [
          'gate-payment',
          requestIp(
            req
          ),
          payerEmail,
        ].join(
          '|'
        )
      )
      .digest(
        'hex'
      )

  const {
    data:
      allowed,
    error:
      limitError,
  } =
    await service.rpc(
      'consume_registration_limit',
      {
        p_key:
          rateKey,
      }
    )

  if (
    limitError
  ) {
    return NextResponse.json(
      {
        error:
          'Payment service is temporarily unavailable. Please try again.',
      },
      {
        status:
          503,
      }
    )
  }

  if (
    allowed !==
    true
  ) {
    return NextResponse.json(
      {
        error:
          'Too many payment attempts. Please wait before trying again.',
      },
      {
        status:
          429,
      }
    )
  }

  const {
    data,
    error,
  } =
    await service.rpc(
      'prepare_gate_payment',
      {
        p_charge_type:
          body.chargeTypeId,

        p_payer_name:
          payerName,

        p_payer_email:
          payerEmail,

        p_payer_phone:
          payerPhone,

        p_company_name:
          companyName,

        p_vehicle_plate:
          vehiclePlate,

        p_host_reference:
          hostReference,

        p_purpose_note:
          purposeNote,
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

  const amountKobo =
    Number(
      data?.amount_kobo
    )

  if (
    !data ||
    typeof data.reference !==
      'string' ||
    typeof data.payment_code !==
      'string' ||
    typeof data.payer_email !==
      'string' ||
    !Number.isSafeInteger(
      amountKobo
    ) ||
    amountKobo <=
      0
  ) {
    return NextResponse.json(
      {
        error:
          'Could not prepare the gate payment',
      },
      {
        status:
          500,
      }
    )
  }

  try {
    const transaction =
      await initializeTransaction({
        email:
          data.payer_email,

        amountKobo,

        reference:
          data.reference,

        callbackUrl:
          `${req.nextUrl.origin}/pay/gate/callback`,

        metadata: {
          payment_type:
            'gate',

          gate_payment_id:
            data.id,

          payment_code:
            data.payment_code,

          charge_name:
            data.charge_name,

          host_reference:
            hostReference,
        },
      })

    return NextResponse.json({
      authorization_url:
        transaction
          .authorization_url,

      reference:
        data.reference,

      payment_code:
        data.payment_code,
    })
  } catch {
    /*
     * Keep the pending row because Paystack may have created
     * the transaction even if our request timed out.
     */
    return NextResponse.json(
      {
        error:
          'Could not start checkout. Please try again.',
      },
      {
        status:
          502,
      }
    )
  }
}