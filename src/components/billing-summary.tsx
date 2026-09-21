'use client'

import { useState } from 'react'
import type { Summary } from '@/lib/dashboard'

const naira = (n: number) => `₦${n.toLocaleString()}`

export function BillingSummary({
  monthLabel,
  month,
  allTime,
}: {
  monthLabel: string
  month: Summary
  allTime: Summary
}) {
  const [view, setView] = useState<'month' | 'all'>('month')
  const data = view === 'month' ? month : allTime
  const label = view === 'month' ? monthLabel : 'All time'

  return (
    <section aria-label="Estate billing summary">
      <div style={{ display: 'flex', gap: '.4rem', marginBottom: '1rem' }}>
        <button
          onClick={() => setView('month')}
          className={view === 'month' ? 'action' : 'action secondary'}
          style={{ padding: '.45rem .9rem', fontSize: '.8rem' }}
        >
          This Month
        </button>
        <button
          onClick={() => setView('all')}
          className={view === 'all' ? 'action' : 'action secondary'}
          style={{ padding: '.45rem .9rem', fontSize: '.8rem' }}
        >
          All Time
        </button>
      </div>

      <div className="metrics">
        <article className="metric featured">
          <span className="metric-label">Estate billed — {label}</span>
          <strong className="metric-value">{naira(data.billed)}</strong>
          <p className="metric-note">Across {data.homes} homes {view === 'month' ? 'this period' : 'total'}</p>
        </article>
        <article className="metric">
          <span className="metric-label">Collected — {label}</span>
          <strong className="metric-value">{naira(data.collected)}</strong>
          <p className="metric-note">
            Successful payments received in this period
          </p>
        </article>
        <article className="metric">
          <span className="metric-label">Outstanding — {label}</span>
          <strong className="metric-value red">{naira(data.outstanding)}</strong>
          <p className="metric-note">{data.outstanding > 0 ? 'Needs a gentle follow-up' : 'All caught up'}</p>
        </article>
      </div>
      <div className="metrics mt-5">
        <article className="metric"><span className="metric-label">Money received — {label}</span><strong className="metric-value">{naira(data.collected)}</strong></article>
        <article className="metric"><span className="metric-label">Money spent — {label}</span><strong className="metric-value">{naira(data.spent)}</strong></article>
        <article className="metric"><span className="metric-label">Net balance — {label}</span><strong className="metric-value">{naira(data.balance)}</strong><p className="metric-note">Recorded collections minus expenses; excludes any opening bank balance.</p></article>
      </div>
      <article className="panel mt-5"><div className="panel-head"><h2>Charge breakdown — {label}</h2></div><div className="panel-body overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Charge</th><th className="p-2">Billed</th><th className="p-2">Collected</th><th className="p-2">Outstanding</th></tr></thead><tbody>{data.charges.map(c => <tr key={c.name} className="border-t"><td className="p-2">{c.name}</td><td className="p-2">{naira(c.billed)}</td><td className="p-2">{naira(c.collected)}</td><td className="p-2">{naira(c.outstanding)}</td></tr>)}</tbody></table><p className="text-xs mt-3">Billed and outstanding use invoice due dates. Collections use the date payment was received.</p></div></article>
    </section>
  )
}
