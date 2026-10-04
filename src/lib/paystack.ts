import 'server-only'

// Server-only helper for talking to Paystack's REST API.
// Never import this from a Client Component — it uses the secret key.

const PAYSTACK_BASE =
  'https://api.paystack.co'

function secretKey() {
  const key =
    process.env
      .PAYSTACK_SECRET_KEY

  if (!key) {
    throw new Error(
      'PAYSTACK_SECRET_KEY is not set'
    )
  }

  return key
}

export async function initializeTransaction(
  params: {
    email:
      string

    amountKobo:
      number

    reference:
      string

    callbackUrl:
      string

    metadata?:
      Record<
        string,
        unknown
      >
  }
) {
  const response =
    await fetch(
      `${PAYSTACK_BASE}/transaction/initialize`,
      {
        method:
          'POST',

        headers: {
          Authorization:
            `Bearer ${secretKey()}`,

          'Content-Type':
            'application/json',
        },

        body:
          JSON.stringify({
            email:
              params.email,

            amount:
              params.amountKobo,

            reference:
              params.reference,

            currency:
              'NGN',

            callback_url:
              params.callbackUrl,

            metadata:
              params.metadata ??
              {},
          }),
      }
    )

  const data =
    await response.json()

  if (
    !response.ok ||
    !data.status
  ) {
    throw new Error(
      data.message ??
        'Failed to initialize Paystack transaction'
    )
  }

  return data.data as {
    authorization_url:
      string

    access_code:
      string

    reference:
      string
  }
}

export async function verifyTransaction(
  reference:
    string
) {
  const response =
    await fetch(
      `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        headers: {
          Authorization:
            `Bearer ${secretKey()}`,
        },
      }
    )

  const data =
    await response.json()

  if (
    !response.ok ||
    !data.status
  ) {
    throw new Error(
      data.message ??
        'Failed to verify Paystack transaction'
    )
  }

  return data.data as {
    id:
      number

    status:
      string

    reference:
      string

    currency:
      string

    amount:
      number

    paid_at:
      string | null

    metadata:
      Record<
        string,
        unknown
      >
  }
}