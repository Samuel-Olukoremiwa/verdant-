'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function GenerateInvoicesPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<{ created: number; skipped: number } | null>(null)
  const [dueTypes, setDueTypes] = useState<{ id: string; name: string; amount: number }[]>([])
  const [form, setForm] = useState({
    due_type_id: '',
    period_label: '',
    due_date: '',
  })

  useEffect(() => {
    supabase
      .from('due_types')
      .select('*')
      .then(({ data }) => setDueTypes(data ?? []))
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSummary(null)
    try {
      const dueType = dueTypes.find((d) => d.id === form.due_type_id)
      if (!dueType) throw new Error('Select a due type')

      // Get every house
      const { data: houses, error: housesError } = await supabase
        .from('houses')
        .select('id')
      if (housesError) throw housesError
      if (!houses || houses.length === 0)
        throw new Error('No houses found. Add residents first.')

      // Find houses already invoiced for this exact due type + period,
      // so re-running this form (e.g. by accident) never double-bills anyone.
      const { data: existing, error: existingError } = await supabase
        .from('invoices')
        .select('house_id')
        .eq('due_type_id', form.due_type_id)
        .eq('period_label', form.period_label)
      if (existingError) throw existingError

      const alreadyInvoicedHouseIds = new Set((existing ?? []).map((i) => i.house_id))
      const housesToInvoice = houses.filter((h) => !alreadyInvoicedHouseIds.has(h.id))
      const skipped = houses.length - housesToInvoice.length

      if (housesToInvoice.length === 0) {
        setSummary({ created: 0, skipped })
        return
      }

      const rows = housesToInvoice.map((h) => ({
        house_id: h.id,
        due_type_id: form.due_type_id,
        period_label: form.period_label,
        amount: dueType.amount,
        due_date: form.due_date || null,
        status: 'unpaid',
      }))

      const { error: invoiceError } = await supabase.from('invoices').insert(rows)
      if (invoiceError) throw invoiceError

      setSummary({ created: rows.length, skipped })
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
      <h1 className="page-title">Issue estate dues</h1>
      <p className="page-lead mb-8">
        This creates an unpaid invoice for this due type for every house in the estate.
      </p>
      <form onSubmit={handleSubmit} className="form-card space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Due Type *</label>
          <select
            required
            className="w-full border rounded-lg px-3 py-2"
            value={form.due_type_id}
            onChange={(e) => setForm({ ...form, due_type_id: e.target.value })}
          >
            <option value="">Select a due type</option>
            {dueTypes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} (₦{Number(d.amount).toLocaleString()})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Period Label *</label>
          <input
            required
            className="w-full border rounded-lg px-3 py-2"
            placeholder="e.g. March 2027"
            value={form.period_label}
            onChange={(e) => setForm({ ...form, period_label: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Due Date</label>
          <input
            type="date"
            className="w-full border rounded-lg px-3 py-2"
            value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {summary && (
          <p className="text-sm bg-green-50 text-green-700 px-3 py-2 rounded-lg">
            {summary.created} invoice{summary.created === 1 ? '' : 's'} created.
            {summary.skipped > 0 &&
              ` ${summary.skipped} house${
                summary.skipped === 1 ? '' : 's'
              } already had an invoice for this period and ${
                summary.skipped === 1 ? 'was' : 'were'
              } skipped.`}{' '}
            <Link href="/admin" className="underline font-medium">
              Back to dashboard
            </Link>
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="action disabled:opacity-50"
        >
          {loading ? 'Generating...' : 'Generate Invoices for All Houses'}
        </button>
      </form>
    </div>
  )
}
