'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { HouseBalance } from '@/lib/dashboard'
const naira = (n: number) => `₦${n.toLocaleString()}`
export function BalancesPanel({ houses }: { houses: HouseBalance[] }) {
  const [view, setView] = useState<'street' | 'house'>('street')
  const [street, setStreet] = useState('all')
  const [expanded, setExpanded] = useState(false)
  const streets = new Map<string, HouseBalance>()
  for (const h of houses) { const s = streets.get(h.streetId) ?? { ...h, id: h.streetId, address: h.street, owed: 0, paid: 0 }; s.owed += h.owed; s.paid += h.paid; streets.set(h.streetId, s) }
  const rows = view === 'street' ? [...streets.values()].filter(s => s.owed > s.paid).sort((a,b) => b.owed-b.paid-(a.owed-a.paid)) : houses.filter(h => h.owed > h.paid && (street === 'all' || h.streetId === street))
  return <article className="panel"><div className="panel-head"><h2>Balances needing attention</h2><Link href="/admin/residents?dues=yes">View residents →</Link></div><div className="panel-body"><div className="flex flex-wrap gap-2 mb-4"><button className={`action ${view === 'street' ? '' : 'secondary'}`} onClick={() => { setView('street'); setExpanded(false) }}>By street</button><button className={`action ${view === 'house' ? '' : 'secondary'}`} onClick={() => { setView('house'); setExpanded(false) }}>By house</button>{view === 'house' && <select aria-label="Filter balances by street" className="border rounded-lg p-2" value={street} onChange={e => { setStreet(e.target.value); setExpanded(false) }}><option value="all">All streets</option>{[...streets.values()].map(s => <option key={s.id} value={s.id}>{s.street}</option>)}</select>}</div>{rows.length ? (expanded ? rows : rows.slice(0,5)).map(h => <div className="house-row" key={h.id}><div><strong>{h.address}</strong><span>{naira(h.paid)} paid of {naira(h.owed)}</span></div><div><span className="pill">Outstanding</span></div><div className="amount red">{naira(h.owed-h.paid)}</div></div>) : <p className="empty">No outstanding balances in this view.</p>}{rows.length > 5 && <button className="action secondary mt-4" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer' : `View more (${rows.length})`}</button>}</div></article>
}
