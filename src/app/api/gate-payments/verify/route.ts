import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  createServiceClient,
} from '@/lib/supabase/service'

import {
  verifyTransaction,
} from '@/lib/paystack'

import {
  applyConfirmedGatePayment,
} from '@/lib/gate-payment-processing'

export async function GET(
  req:
    NextRequest
) {
  const reference =
    req.nextUrl
      .searchParams
      .get(
        'reference'
      )
      ?.trim()

  if (
    !reference ||
    !/^GATE-[a-f0-9]{32}$/i.test(
      reference
    )
  ) {
    return NextResponse.json(
      {
        error:
          'A valid gate payment reference is required',
      },
      {
        status:
          400,
      }
    )
  }

  const service =
    createServiceClient()

  const {
    data:
      existing,
    error:
      lookupError,
  } =
    await service
      .from(
        'gate_payments'
      )
      .select(`
        reference,
        payment_code,
        charge_name,
        amount,
        payer_name,
        status,
        paid_at,
        admitted_at
      `)
      .eq(
        'reference',
        reference
      )
      .maybeSingle()

  if (
    lookupError
  ) {
    return NextResponse.json(
      {
        error:
          'Could not look up this payment',
      },
      {
        status:
          500,
      }
    )
  }

  if (!existing) {
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

  if (
    existing.status ===
    'success'
  ) {
    return NextResponse.json(
      {
        status:
          'success',

        payment_code:
          existing.payment_code,

        charge_name:
          existing.charge_name,

        amount:
          existing.amount,

        payer_name:
          existing.payer_name,

        paid_at:
          existing.paid_at,

        admitted_at:
          existing.admitted_at,
      },
      {
        headers: {
          'Cache-Control':
            'no-store',
        },
      }
    )
  }

  try {
    const verified =
      await verifyTransaction(
        reference
      )

    if (
      verified.reference !==
      reference
    ) {
      throw new Error(
        'Payment reference mismatch'
      )
    }

    if (
      verified.status !==
      'success'
    ) {
      if (
        [
          'failed',
          'abandoned',
        ].includes(
          verified.status
        )
      ) {
        await service
          .from(
            'gate_payments'
          )
          .update({
            status:
              verified.status,
          })
          .eq(
            'reference',
            reference
          )
          .eq(
            'status',
            'pending'
          )
      }

      return NextResponse.json(
        {
          status:
            verified.status,
        },
        {
          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      )
    }

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

    const {
      data:
        confirmed,
      error:
        confirmedError,
    } =
      await service
        .from(
          'gate_payments'
        )
        .select(`
          payment_code,
          charge_name,
          amount,
          payer_name,
          paid_at,
          admitted_at
        `)
        .eq(
          'reference',
          reference
        )
        .single()

    if (
      confirmedError ||
      !confirmed
    ) {
      throw new Error(
        'Payment was verified but its confirmation could not be loaded'
      )
    }

    return NextResponse.json(
      {
        status:
          'success',

        ...confirmed,
      },
      {
        headers: {
          'Cache-Control':
            'no-store',
        },
      }
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
            : 'Verification failed',
      },
      {
        status:
          500,
      }
    )
  }
}