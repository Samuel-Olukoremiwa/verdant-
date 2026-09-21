'use client'

import { useMemo, useState } from 'react'

type DueType = { id: string; name: string; amount: number }
type Item = { due_type_id: string; month: string }
type Quote = { total_kobo: number; lines: { charge: string; period: string; amount_kobo: number }[] }
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`

export function AdvancePaymentPanel({ dueTypes }: { dueTypes: DueType[] }) {
  const months = useMemo(() => {
    const now = new Date()
    const current = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit' }).formatToParts(now)
    const year = Number(current.find(p => p.type === 'year')?.value)
    const month = Number(current.find(p => p.type === 'month')?.value) - 1
    return Array.from({ length: 60 }, (_, i) => {
      const d = new Date(Date.UTC(year, month + i, 1))
      return { value: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }
    })
  }, [])
  const [from, setFrom] = useState(months[0].value)
  const [to, setTo] = useState(months[0].value)
  const [selected, setSelected] = useState(() => dueTypes.map(d => d.id))
  const [review, setReview] = useState<{ items: Item[]; quote: Quote } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const items = months.filter(m => m.value >= from && m.value <= to).flatMap(m => selected.map(id => ({ due_type_id: id, month: m.value })))

  async function requestPayment(confirm: boolean) {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/payments/initialize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirm && review
          ? { items: review.items, expected_total_kobo: review.quote.total_kobo }
          : { items, quote_only: true }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not review this payment')
      if (confirm) window.location.assign(data.authorization_url)
      else setReview({ items, quote: data })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start payment')
      if (confirm) setReview(null)
    } finally { setLoading(false) }
  }

  if (!dueTypes.length) return <article className="panel p-5"><h2>Pay in advance</h2><p>Fixed monthly charges are not available yet. Please contact the estate office.</p></article>
  return <article className="panel">
    <div className="panel-head"><h2>Pay in advance</h2><span className="eyebrow">Fixed monthly charges</span></div>
    <div className="p-5 space-y-4">
      <p>Select up to five years of monthly charges. Review the exact balance before checkout; paid months are excluded.</p>
      <fieldset disabled={loading} className="space-y-4">
        <legend className="font-semibold">Charges to include</legend>
        {dueTypes.map(d => <label key={d.id} className="block"><input type="checkbox" checked={selected.includes(d.id)} onChange={e => { setSelected(ids => e.target.checked ? [...ids, d.id] : ids.filter(id => id !== d.id)); setReview(null) }} /> {d.name} ({naira(Number(d.amount) * 100)}/month)</label>)}
        <div className="flex flex-wrap gap-4">
          <label>From <select value={from} onChange={e => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); setReview(null) }} className="border rounded p-2">{months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
          <label>To <select value={to} onChange={e => { setTo(e.target.value); setReview(null) }} className="border rounded p-2">{months.filter(m => m.value >= from).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
        </div>
      </fieldset>
      {review && <div aria-live="polite" className="border rounded p-4 space-y-2">
        <h3 className="font-semibold">Payment review</h3>
        <ul>{review.quote.lines.map((line, i) => <li key={i}>{line.charge} — {line.period}: {line.amount_kobo === 0 ? 'Already paid' : naira(line.amount_kobo)}</li>)}</ul>
        <p className="font-semibold">Total to pay: {naira(review.quote.total_kobo)}</p>
        {review.quote.total_kobo === 0 && <p>These months are already paid. Nothing further is due.</p>}
      </div>}
      <button disabled={loading || !items.length || review?.quote.total_kobo === 0} onClick={() => requestPayment(Boolean(review))} className="action disabled:opacity-50">{loading ? 'Please wait…' : review ? `Continue to pay ${naira(review.quote.total_kobo)}` : 'Review payment'}</button>
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </div>
  </article>
}
