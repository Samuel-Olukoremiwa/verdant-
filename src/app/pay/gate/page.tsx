import Link from 'next/link'

import {
  GatePaymentForm,
} from '@/components/gate-payment-form'

import {
  createServiceClient,
} from '@/lib/supabase/service'

export const dynamic =
  'force-dynamic'

export default async function GatePaymentPage() {
  const service =
    createServiceClient()

  const [
    chargeResult,
    houseResult,
  ] =
    await Promise.all([
      service
        .from(
          'gate_charge_types'
        )
        .select(`
          id,
          name,
          description,
          amount
        `)
        .eq(
          'active',
          true
        )
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

      service
        .from(
          'houses'
        )
        .select(`
          id,
          address
        `)
        .order(
          'address',
          {
            ascending:
              true,
          }
        ),
    ])

  const chargeTypes =
    (
      chargeResult.data ??
      []
    ).map(
      (
        charge
      ) => ({
        ...charge,

        amount:
          Number(
            charge.amount
          ),
      })
    )

  const houses =
    (
      houseResult.data ??
      []
    ).map(
      (
        house
      ) => ({
        id:
          house.id,

        address:
          house.address,
      })
    )

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-5 py-10">
        <div className="mb-8">
          <Link
            href="/"
            className="brand"
            style={{
              color:
                'var(--forest)',
            }}
          >
            <span className="brand-mark">
              Z
            </span>

            <span>
              Zadant

              <small
                style={{
                  color:
                    'var(--moss)',
                }}
              >
                Estate operations
              </small>
            </span>
          </Link>
        </div>

        <span className="eyebrow">
          Gate payment
        </span>

        <h1 className="page-title">
          Pay estate gate dues.
        </h1>

        <p className="page-lead mb-8">
          Select the applicable
          estate charge, enter
          your details and
          complete payment
          securely.
        </p>

        {chargeResult.error ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800"
          >
            Gate charges could
            not be loaded. Please
            ask the gate officer
            for assistance.
          </div>
        ) : (
          <GatePaymentForm
            chargeTypes={
              chargeTypes
            }
            houses={
              houses
            }
          />
        )}
      </div>
    </main>
  )
}

export const metadata = {
  title:
    'Pay Gate Dues | Zadant',

  description:
    'Secure estate gate payment.',

  robots: {
    index:
      false,

    follow:
      false,
  },
}