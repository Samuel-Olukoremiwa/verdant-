'use client'

import { useState } from 'react'
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
      // Manual/offline payments (cash, bank transfer without Paystack) are recorded
      // with a MANUAL- reference so they're distinguishable from gateway payments.
      const reference = `MANUAL-${Date.now()}`
      const { error: payError } = await supabase.from('payments').insert({
        invoice_id: invoiceId,
        resident_id: residentId,
        amount: amt,
        paystack_reference: reference,
        status: 'success',
        paid_at: new Date().toISOString(),
      })
      if (payError) throw payError

      const { data: invoice, error: invoiceFetchError } = await supabase
        .from('invoices')
        .select('amount, amount_paid')
        .eq('id', invoiceId)
        .single()
      if (invoiceFetchError || !invoice) {
        throw invoiceFetchError ?? new Error('Invoice not found')
      }

      const newAmountPaid = Number(invoice.amount_paid ?? 0) + amt
      const newStatus = newAmountPaid >= Number(invoice.amount) ? 'paid' : 'partial'

      const { error: invoiceUpdateError } = await supabase
        .from('invoices')
        .update({ amount_paid: newAmountPaid, status: newStatus })
        .eq('id', invoiceId)
      if (invoiceUpdateError) throw invoiceUpdateError

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
        min="0"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
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
