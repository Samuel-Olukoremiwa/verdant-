import crypto from 'crypto'

import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  verifyTransaction,
} from '@/lib/paystack'

import {
  applyConfirmedPayment,
} from '@/lib/payment-processing'

import {
  applyConfirmedGatePayment,
} from '@/lib/gate-payment-processing'

function validSignature(
  rawBody:
    string,

  supplied:
    string | null,

  secret:
    string
) {
  if (!supplied) {
    return false
  }

  const expected =
    crypto
      .createHmac(
        'sha512',
        secret
      )
      .update(
        rawBody
      )
      .digest(
        'hex'
      )

  const suppliedBuffer =
    Buffer.from(
      supplied,
      'utf8'
    )

  const expectedBuffer =
    Buffer.from(
      expected,
      'utf8'
    )

  return (
    suppliedBuffer.length ===
      expectedBuffer.length &&
    crypto.timingSafeEqual(
      suppliedBuffer,
      expectedBuffer
    )
  )
}

export async function POST(
  req:
    NextRequest
) {
  const secret =
    process.env
      .PAYSTACK_SECRET_KEY

  if (!secret) {
    return NextResponse.json(
      {
        error:
          'Payment service unavailable',
      },
      {
        status:
          503,
      }
    )
  }

  const rawBody =
    await req.text()

  const signature =
    req.headers.get(
      'x-paystack-signature'
    )

  if (
    !validSignature(
      rawBody,
      signature,
      secret
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Invalid signature',
      },
      {
        status:
          401,
      }
    )
  }

  let event:
    {
      event?:
        string

      data?: {
        reference?:
          string
      }
    }

  try {
    event =
      JSON.parse(
        rawBody
      )
  } catch {
    return NextResponse.json(
      {
        error:
          'Invalid payload',
      },
      {
        status:
          400,
      }
    )
  }

  try {
    if (
      event.event ===
      'charge.success'
    ) {
      const reference =
        event.data
          ?.reference

      if (
        !reference
      ) {
        throw new Error(
          'Payment reference missing'
        )
      }

      /*
       * Never trust the webhook payload as the source of truth.
       * Re-verify the transaction with Paystack.
       */
      const verified =
        await verifyTransaction(
          reference
        )

      if (
        verified.status !==
        'success'
      ) {
        return NextResponse.json({
          received:
            true,

          note:
            'not successful on verify',
        })
      }

      if (
        verified.reference !==
        reference
      ) {
        throw new Error(
          'Payment reference mismatch'
        )
      }

      if (
        reference.startsWith(
          'GATE-'
        )
      ) {
        await applyConfirmedGatePayment({
          id:
            verified.id,

          reference:
            verified.reference,

          amount:
            verified.amount,

          currency:
            verified.currency,

          paid_at:
            verified.paid_at,
        })
      } else {
        await applyConfirmedPayment(
          verified
        )
      }
    }

    return NextResponse.json({
      received:
        true,
    })
  } catch {
    return NextResponse.json(
      {
        error:
          'Payment confirmation failed; retry required',
      },
      {
        status:
          500,
      }
    )
  }
}