'use client'

import { useState } from 'react'

export function PayButton({
  invoiceId,
  outstanding,
}: {
  invoiceId: string
  outstanding: number
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(outstanding))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePay() {
    setLoading(true)
    setError(null)
    try {
      const value = Number(amount)
      if (!Number.isFinite(value) || value <= 0 || value > outstanding || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) throw new Error('Enter a valid amount with at most two decimal places')
      const res = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ invoice_id: invoiceId, amount: Number(amount) }], expected_total_kobo: Math.round(Number(amount) * 100) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not start payment')
      window.location.assign(data.authorization_url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-green-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-green-700"
      >
        Pay now
      </button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">₦</span>
        <input
          type="number"
          min="0.01"
          step="0.01"
          max={outstanding}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="border rounded-lg px-2 py-1 text-sm w-24"
        />
        <button
          onClick={handlePay}
          disabled={loading}
          className="bg-green-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? 'Starting...' : 'Pay'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-gray-500 hover:underline"
        >
          Cancel
        </button>
      </div>
      <span className="text-xs text-gray-400">Up to ₦{outstanding.toLocaleString()} — partial payment allowed</span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
