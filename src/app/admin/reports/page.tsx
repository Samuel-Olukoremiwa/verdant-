'use client'

import { useEffect, useState, useCallback } from 'react'

const naira = (n: number) => `₦${n.toLocaleString()}`

type ReportType = 'due' | 'collected' | 'overdue' | 'future'

type Row = Record<string, string | number | null>

const REPORT_LABELS: Record<ReportType, string> = {
  due: 'Due Bills',
  collected: 'Collected',
  overdue: 'Overdue',
  future: 'Bills Expected in Future',
}

function defaultDateRange() {
  const now = new Date()
  const first = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
  const last = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0))
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
}

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','))
  }
  return lines.join('\n')
}

export default function ReportsPage() {
  const [type, setType] = useState<ReportType>('due')
  const [{ from, to }, setRange] = useState(defaultDateRange())
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runReport = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ type, from, to })
    fetch(`/api/admin/reports?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setRows(data.rows ?? [])
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load report'))
      .finally(() => setLoading(false))
  }, [type, from, to])

  useEffect(() => {
    runReport()
  }, [runReport])

  function exportCsv() {
    const csv = toCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type}-report-${from}-to-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const amountKey = type === 'collected' ? 'amount' : type === 'due' ? 'amount' : 'outstanding'
  const total = rows.reduce((sum, r) => sum + Number(r[amountKey] ?? 0), 0)

  return (
    <div className="page-wrap">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">Dues &amp; billing</span>
          <h1 className="page-title">Reports</h1>
          <p className="page-lead">
            Due, collected, overdue, and upcoming bills — filtered by date, exportable as CSV.
          </p>
        </div>
        <button onClick={exportCsv} disabled={rows.length === 0} className="action secondary">
          Export CSV
        </button>
      </div>

      <div className="panel" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Report</label>
            <select
              className="border rounded-lg px-3 py-2"
              value={type}
              onChange={(e) => setType(e.target.value as ReportType)}
            >
              <option value="due">Due Bills</option>
              <option value="collected">Collected</option>
              <option value="overdue">Overdue</option>
              <option value="future">Bills Expected in Future</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">From</label>
            <input
              type="date"
              className="border rounded-lg px-3 py-2"
              value={from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">To</label>
            <input
              type="date"
              className="border rounded-lg px-3 py-2"
              value={to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      <p className="text-xs text-gray-500 mb-2">
        {loading
          ? 'Loading...'
          : `${REPORT_LABELS[type]}: ${rows.length} record${rows.length === 1 ? '' : 's'} — ${naira(
              total
            )} total`}
      </p>

      <div className="bg-white rounded-xl shadow border overflow-hidden overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="p-3">House</th>
              <th className="p-3">Charge</th>
              <th className="p-3">Period</th>
              {type === 'collected' ? (
                <>
                  <th className="p-3">Paid Date</th>
                  <th className="p-3">Reference</th>
                  <th className="p-3 text-right">Amount</th>
                </>
              ) : (
                <>
                  <th className="p-3">Due Date</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Outstanding</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="p-3">{r.house}</td>
                  <td className="p-3">{r.charge}</td>
                  <td className="p-3">{r.period}</td>
                  {type === 'collected' ? (
                    <>
                      <td className="p-3">
                        {r.date ? new Date(r.date as string).toLocaleDateString() : '—'}
                      </td>
                      <td className="p-3 font-mono text-xs">{r.reference}</td>
                      <td className="p-3 text-right font-medium">
                        {naira(Number(r.amount))}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-3">
                        {r.dueDate ? new Date(r.dueDate as string).toLocaleDateString() : '—'}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            r.status === 'paid'
                              ? 'bg-green-100 text-green-700'
                              : r.status === 'partial'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="p-3 text-right font-medium">
                        {naira(Number(r.outstanding))}
                      </td>
                    </>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500">
                  {loading ? 'Loading...' : 'No records match this report and date range.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
