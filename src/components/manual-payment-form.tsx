'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function ManualPaymentForm({
  invoiceId,
  residentId,
  outstanding,
}: {
  invoiceId: string
  residentId: string
  outstanding: number
}) {
  const referenceRef = useRef<string | null>(null)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(outstanding))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amt = Number(amount)
    if (!amt || amt <= 0) {
      setError('Enter a valid amount')
      return
    }
    setLoading(true)
    try {
      const reference = referenceRef.current ?? `MANUAL-${crypto.randomUUID()}`
      referenceRef.current = reference
      const { error: paymentError } = await supabase.rpc('record_estate_manual_payment', {
        p_invoice: invoiceId, p_resident: residentId, p_amount: amt, p_reference: reference,
      })
      if (paymentError) throw new Error(paymentError.message)
      referenceRef.current = null

      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-blue-600 hover:underline"
      >
        Record manual payment
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-1">
      <input
        type="number"
        min="0.01"
        max={outstanding}
        step="0.01"
        value={amount}
        onChange={(e) => { setAmount(e.target.value); referenceRef.current = null }}
        className="border rounded px-2 py-1 text-xs w-24"
      />
      <button
        type="submit"
        disabled={loading}
        className="text-xs bg-green-600 text-white px-2 py-1 rounded disabled:opacity-50"
      >
        {loading ? 'Saving...' : 'Confirm'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-gray-500"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  )
}
