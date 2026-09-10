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
  const [status, setStatus] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return invoices.filter((inv) => {
      if (status !== 'all' && inv.status !== status) return false
      if (!q) return true
      return (
        (inv.houses?.address ?? '').toLowerCase().includes(q) ||
        (inv.due_types?.name ?? '').toLowerCase().includes(q) ||
        (inv.period_label ?? '').toLowerCase().includes(q)
      )
    })
  }, [invoices, query, status])

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
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'all' | 'unpaid' | 'partial' | 'paid')}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      <p className="text-xs text-gray-500 mb-2">
        Showing {filtered.length} of {invoices.length} invoice
        {invoices.length === 1 ? '' : 's'} — {naira(totalOutstanding)} outstanding in this
        view
      </p>

      <div className="bg-white rounded-xl shadow overflow-hidden border">
        <table className="w-full text-left">
          <thead className="bg-gray-100 text-sm text-gray-600">
            <tr>
              <th className="p-3">House</th>
              <th className="p-3">Charge</th>
              <th className="p-3">Period</th>
              <th className="p-3">Due date</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Outstanding</th>
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
                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—'}
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
        </table>
      </div>
    </div>
  )
}
