'use client'

import { useMemo, useState } from 'react'

const naira = (n: number) => `₦${n.toLocaleString()}`

type Invoice = {
  id: string
  period_label: string | null
  amount: number
  amount_paid: number | null
  status: string
  due_date: string | null
  houses: { address: string } | null
  due_types: { name: string } | null
}

export function InvoicesTable({ invoices }: { invoices: Invoice[] }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [columns, setColumns] = useState<Record<string, string>>({})
  const value = (inv: Invoice, column: string) => column === 'House' ? inv.houses?.address ?? '—' : column === 'Charge' ? inv.due_types?.name ?? 'Estate charge' : column === 'Period' ? inv.period_label ?? '—' : inv.due_date ?? '—'
  const headings = ['House', 'Charge', 'Period', 'Due date']

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return invoices.filter((inv) => {
      for (const column of ['House', 'Charge', 'Period', 'Due date']) if (columns[column] && value(inv, column) !== columns[column]) return false
      const balance = Math.max(0, Number(inv.amount)-Number(inv.amount_paid ?? 0))
      if (columns.Outstanding === 'zero' && balance !== 0) return false
      if (columns.Outstanding === 'positive' && balance <= 0) return false
      if (columns.Outstanding === 'under5000' && !(balance > 0 && balance < 5000)) return false
      if (columns.Outstanding === '5000plus' && balance < 5000) return false
      if (status !== 'all' && inv.status !== status) return false
      if (!q) return true
      return (
        (inv.houses?.address ?? '').toLowerCase().includes(q) ||
        (inv.due_types?.name ?? '').toLowerCase().includes(q) ||
        (inv.period_label ?? '').toLowerCase().includes(q)
      )
    })
  }, [invoices, query, status, columns])

  const totalBilled = filtered.reduce((sum, inv) => sum + Number(inv.amount), 0)
  const totalOutstanding = filtered.reduce(
    (sum, inv) => sum + Math.max(0, Number(inv.amount) - Number(inv.amount_paid ?? 0)),
    0
  )

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by house, due type, or period..."
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <button className="action secondary" onClick={() => { setQuery(''); setStatus('all'); setColumns({}) }}>Clear filters</button>
      </div>

      <p className="text-xs text-gray-500 mb-2">
        Showing {filtered.length} of {invoices.length} invoice
        {invoices.length === 1 ? '' : 's'} — {naira(totalOutstanding)} outstanding in this
        view
      </p>

      <div className="bg-white rounded-xl shadow overflow-x-auto border">
        <table className="w-full text-left">
          <thead className="bg-gray-100 text-sm text-gray-600">
            <tr>
              {headings.map(heading => <th key={heading} className="p-3"><label>{heading}<select aria-label={`Filter ${heading}`} className="block border rounded p-1 mt-2 max-w-48" value={columns[heading] ?? ''} onChange={e => setColumns({ ...columns, [heading]: e.target.value })}><option value="">All</option>{[...new Set(invoices.map(inv => value(inv, heading)))].sort().map(v => <option key={v} value={v}>{v}</option>)}</select></label></th>)}
              <th className="p-3"><label>Status<select aria-label="Filter Status" className="block border rounded p-1 mt-2" value={status} onChange={e => setStatus(e.target.value)}><option value="all">All</option>{['unpaid','partial','paid','overdue'].map(s => <option key={s} value={s}>{s}</option>)}</select></label></th>
              <th className="p-3"><label>Outstanding<select aria-label="Filter Outstanding" className="block border rounded p-1 mt-2" value={columns.Outstanding ?? ''} onChange={e => setColumns({ ...columns, Outstanding: e.target.value })}><option value="">All amounts</option><option value="positive">Has balance</option><option value="zero">Fully paid</option><option value="under5000">Under ₦5,000</option><option value="5000plus">₦5,000 or more</option></select></label></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? (
              filtered.map((inv) => {
                const outstanding = Math.max(
                  0,
                  Number(inv.amount) - Number(inv.amount_paid ?? 0)
                )
                return (
                  <tr key={inv.id} className="border-t text-sm">
                    <td className="p-3">{inv.houses?.address ?? '—'}</td>
                    <td className="p-3">{inv.due_types?.name ?? 'Estate charge'}</td>
                    <td className="p-3">{inv.period_label ?? '—'}</td>
                    <td className="p-3">
                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos' }) : '—'}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          inv.status === 'paid'
                            ? 'bg-green-100 text-green-700'
                            : inv.status === 'partial'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium">{naira(outstanding)}</td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500">
                  {invoices.length === 0
                    ? 'No invoices yet. Generate some from Due Types.'
                    : 'No invoices match your search.'}
                </td>
              </tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-gray-50 text-sm font-semibold">
                <td className="p-3" colSpan={5}>
                  Total ({filtered.length} invoice{filtered.length === 1 ? '' : 's'}) —{' '}
                  {naira(totalBilled)} billed
                </td>
                <td className="p-3 text-right">{naira(totalOutstanding)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
