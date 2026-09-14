'use client'

import { useState } from 'react'

const naira = (n: number) => `₦${n.toLocaleString()}`

export function BillingSummary({
  monthLabel,
  month,
  allTime,
}: {
  monthLabel: string
  month: { billed: number; collected: number; outstanding: number; homes: number }
  allTime: { billed: number; collected: number; outstanding: number; homes: number }
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
            <span className="trend">↑ On track</span> with your collection target
          </p>
        </article>
        <article className="metric">
          <span className="metric-label">Outstanding — {label}</span>
          <strong className="metric-value red">{naira(data.outstanding)}</strong>
          <p className="metric-note">{data.outstanding > 0 ? 'Needs a gentle follow-up' : 'All caught up'}</p>
        </article>
      </div>
    </section>
  )
}
