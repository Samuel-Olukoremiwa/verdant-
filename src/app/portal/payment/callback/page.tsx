'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function PaymentCallbackPage() {
  const router = useRouter()
  const params = useSearchParams()
  const reference = params.get('reference') || params.get('trxref')
  const [result, setResult] = useState<{ reference: string; status: string; error?: string } | null>(null)
  useEffect(() => {
    if (!reference) return
    let active = true
    fetch(`/api/payments/verify?reference=${encodeURIComponent(reference)}`, { cache: 'no-store' })
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Verification failed')
        if (active) { setResult({ reference, status: data.status }); if (data.status === 'success') router.refresh() }
      })
      .catch(err => { if (active) setResult({ reference, status: 'error', error: err.message }) })
    return () => { active = false }
  }, [reference, router])
  const status = !reference ? 'missing' : result?.reference === reference ? result.status : 'checking'
  return <div className="max-w-lg mx-auto p-10 text-center space-y-4" aria-live="polite">
    <h1 className="text-xl font-semibold">{status === 'success' ? 'Payment confirmed' : status === 'checking' ? 'Confirming your payment…' : status === 'missing' ? 'Payment reference missing' : 'Payment not yet confirmed'}</h1>
    <p>{status === 'success' ? 'Your invoice balances have been updated.' : status === 'checking' ? 'Please wait while we verify and record your payment.' : 'If you were charged, do not pay again. Retry verification or contact the estate office with your reference.'}</p>
    {reference && <p className="break-all">Reference: {reference}</p>}
    {result?.error && <p role="alert" className="text-red-700">{result.error}</p>}
    {reference && status !== 'success' && status !== 'checking' && <button className="action secondary" onClick={() => window.location.reload()}>Retry verification</button>}
    <button className="action" onClick={() => { router.replace('/portal'); router.refresh() }}>Back to portal</button>
  </div>
}
