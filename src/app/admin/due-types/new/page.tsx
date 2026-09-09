'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NewDueTypePage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', amount: '', frequency: 'monthly' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase.from('due_types').insert({
        name: form.name,
        amount: Number(form.amount),
        frequency: form.frequency,
      })
      if (error) throw error
      router.push('/admin/due-types')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-wrap max-w-2xl">
      <span className="eyebrow">Dues & billing</span>
      <h1 className="page-title">Create a due type</h1>
      <p className="page-lead mb-8">Set the recurring charge once, then issue it to the estate when you’re ready.</p>
      <form onSubmit={handleSubmit} className="form-card space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input
            required
            className="w-full border rounded-lg px-3 py-2"
            placeholder="e.g. Monthly Service Charge"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Amount (₦) *</label>
          <input
            required
            type="number"
            min="0"
            step="0.01"
            className="w-full border rounded-lg px-3 py-2"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Frequency</label>
          <select
            className="w-full border rounded-lg px-3 py-2"
            value={form.frequency}
            onChange={(e) => setForm({ ...form, frequency: e.target.value })}
          >
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
            <option value="one-time">One-time</option>
          </select>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="action disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Due Type'}
        </button>
      </form>
    </div>
  )
}
