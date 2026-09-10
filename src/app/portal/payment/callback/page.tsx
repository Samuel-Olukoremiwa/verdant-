'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function PaymentCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'checking' | 'success' | 'failed' | 'error'>(
    'checking'
  )

  useEffect(() => {
    const reference = searchParams.get('reference') || searchParams.get('trxref')
    if (!reference) {
      setStatus('error')
      return
    }
    fetch(`/api/payments/verify?reference=${encodeURIComponent(reference)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'success') setStatus('success')
        else if (data.error) setStatus('error')
        else setStatus('failed')
      })
      .catch(() => setStatus('error'))
  }, [searchParams])

  return (
    <div className="max-w-md mx-auto p-10 text-center">
      {status === 'checking' && (
        <>
          <p className="text-lg font-medium">Confirming your payment...</p>
          <p className="text-sm text-gray-500 mt-2">This only takes a moment.</p>
        </>
      )}
      {status === 'success' && (
        <>
          <p className="text-2xl mb-2">✅</p>
          <p className="text-lg font-medium text-green-700">Payment confirmed!</p>
          <p className="text-sm text-gray-500 mt-2">
            Your invoice has been updated.
          </p>
        </>
      )}
      {status === 'failed' && (
        <>
          <p className="text-lg font-medium text-orange-700">Payment not completed</p>
          <p className="text-sm text-gray-500 mt-2">
            It looks like the payment wasn&apos;t successful. You can try again.
          </p>
        </>
      )}
      {status === 'error' && (
        <>
          <p className="text-lg font-medium text-red-700">Something went wrong</p>
          <p className="text-sm text-gray-500 mt-2">
            We couldn&apos;t confirm this payment automatically. Please contact the
            estate office with your reference number if you were charged.
          </p>
        </>
      )}
      <button
        onClick={() => router.push('/portal')}
        className="mt-6 bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700"
      >
        Back to Portal
      </button>
    </div>
  )
}
