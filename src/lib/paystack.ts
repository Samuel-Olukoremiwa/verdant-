// Server-only helper for talking to Paystack's REST API.
// Never import this from a Client Component — it uses the secret key.

const PAYSTACK_BASE = 'https://api.paystack.co'

function secretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not set')
  return key
}

export async function initializeTransaction(params: {
  email: string
  amountKobo: number // Paystack expects the smallest currency unit (kobo for NGN)
  reference: string
  callbackUrl: string
  metadata?: Record<string, unknown>
}) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountKobo,
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata ?? {},
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.status) {
    throw new Error(data.message ?? 'Failed to initialize Paystack transaction')
  }
  return data.data as { authorization_url: string; access_code: string; reference: string }
}

export async function verifyTransaction(reference: string) {
  const res = await fetch(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secretKey()}` } }
  )
  const data = await res.json()
  if (!res.ok || !data.status) {
    throw new Error(data.message ?? 'Failed to verify Paystack transaction')
  }
  return data.data as {
    status: string // 'success' | 'failed' | 'abandoned'
    reference: string
    amount: number // kobo
    paid_at: string | null
    metadata: Record<string, unknown>
  }
}
