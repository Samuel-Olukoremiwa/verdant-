'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { friendlyDbError } from '@/lib/friendly-error'

const CATEGORIES = ['Maintenance', 'Salaries', 'Utilities', 'Security', 'Landscaping', 'Other']

export default function NewExpensePage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    category: 'Maintenance',
    category_other: '',
    description: '',
    amount: '',
    expense_date: new Date().toISOString().slice(0, 10),
  })

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const category = form.category === 'Other' ? form.category_other.trim() : form.category
      if (!category) throw new Error('Enter a category')
      if (!form.description.trim()) throw new Error('Enter a description')
      if (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) throw new Error('Enter an amount greater than zero')

      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { data: admin } = await supabase
        .from('admins')
        .select('id')
        .eq('auth_user_id', user?.id)
        .single()

      const { error } = await supabase.from('expenses').insert({
        category,
        description: form.description.trim(),
        amount: Number(form.amount),
        expense_date: form.expense_date,
        created_by: admin?.id ?? null,
      })
      if (error) throw error

      router.push('/admin/expenses')
      router.refresh()
    } catch (err) {
      setError(friendlyDbError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-wrap max-w-xl">
      <span className="eyebrow">Estate operations</span>
      <h1 className="page-title">Log an expense</h1>
      <p className="page-lead mb-8">Record money spent running the estate.</p>

      <form onSubmit={handleSubmit} className="form-card space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Category *</label>
          <select
            className="w-full border rounded-lg px-3 py-2"
            value={form.category}
            onChange={(e) => update('category', e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {form.category === 'Other' && (
          <div>
            <label className="block text-sm font-medium mb-1">Specify Category</label>
            <input
              required
              className="w-full border rounded-lg px-3 py-2"
              value={form.category_other}
              onChange={(e) => update('category_other', e.target.value)}
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Description *</label>
          <input
            required
            className="w-full border rounded-lg px-3 py-2"
            placeholder="e.g. Generator diesel refill"
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Amount (₦) *</label>
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            className="w-full border rounded-lg px-3 py-2"
            value={form.amount}
            onChange={(e) => update('amount', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Date *</label>
          <input
            required
            type="date"
            className="w-full border rounded-lg px-3 py-2"
            value={form.expense_date}
            onChange={(e) => update('expense_date', e.target.value)}
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button type="submit" disabled={loading} className="action disabled:opacity-50">
          {loading ? 'Saving...' : 'Save Expense'}
        </button>
      </form>
    </div>
  )
}
