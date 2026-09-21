'use client'

import { useEffect, useState } from 'react'

const naira = (n: number) => `₦${n.toLocaleString()}`

import { REPORT_LABELS, periodRange, reportCsv, type ReportType, type ReportRow as Row, type PeriodPreset } from '@/lib/report-format'

export default function ReportsPage() {
  const [type, setType] = useState<ReportType>('due')
  const [{ from, to }, setRange] = useState(() => periodRange('month'))
  const [period, setPeriod] = useState<PeriodPreset>('month')
  const [exporting, setExporting] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    if (!from || !to || from > to) return
    const params = new URLSearchParams({ type, from, to })
    fetch(`/api/admin/reports?${params}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json()
        if (!response.ok || data.error) throw new Error(data.error || 'Failed to load report')
        return data
      })
      .then(data => { if (active) setRows(data.rows ?? []) })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Failed to load report') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [type, from, to])

  function changeFilters(next: { type?: ReportType; from?: string; to?: string }) {
    const nextFrom = next.from ?? from, nextTo = next.to ?? to
    if ((!next.type || next.type === type) && nextFrom === from && nextTo === to) return
    if (!nextFrom || !nextTo || nextFrom > nextTo) {
      setRange({ from: nextFrom, to: nextTo }); setRows([]); setError('Choose a valid date range'); setLoading(false); return
    }
    setLoading(true)
    setError(null)
    setRows([])
    if (next.type) setType(next.type)
    setRange(current => ({ from: next.from ?? current.from, to: next.to ?? current.to }))
  }

  function exportCsv() {
    const csv = reportCsv(type, rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type}-report-${from}-to-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportPdf() {
    setExporting(true); setError(null)
    try {
      const { createReportPdf } = await import('@/lib/report-pdf')
      const pdf = await createReportPdf(type, rows, from, to)
      pdf.save(`${type}-report-${from}-to-${to}.pdf`)
    } catch { setError('PDF export failed. Please try again.') }
    finally { setExporting(false) }
  }

  const amountKey = type === 'collected' || type === 'expenses' ? 'amount' : 'outstanding'
  const total = rows.reduce((sum, r) => sum + Number(r[amountKey] ?? 0), 0)

  return (
    <div className="page-wrap">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">Dues &amp; billing</span>
          <h1 className="page-title">Reports</h1>
          <p className="page-lead">
            Due, collected, overdue, upcoming bills, and expenses — filtered by date, exportable as CSV or PDF.
          </p>
        </div>
        <div className="flex gap-3 flex-wrap"><button onClick={exportPdf} disabled={loading || exporting || rows.length === 0} className="action">{exporting ? 'Preparing PDF…' : 'Export PDF'}</button><button onClick={exportCsv} disabled={loading || rows.length === 0} className="action secondary">
          Export CSV
        </button></div>
      </div>

      <div className="panel" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Report</label>
            <select
              className="border rounded-lg px-3 py-2"
              aria-label="Report type"
              value={type}
              onChange={(e) => changeFilters({ type: e.target.value as ReportType })}
            >
              <option value="due">Due Bills</option>
              <option value="collected">Collected</option>
              <option value="overdue">Overdue</option>
              <option value="future">Bills Expected in Future</option>
              <option value="expenses">Expenses</option>
            </select>
          </div>
          <label>Period<select aria-label="Report period" className="block border rounded-lg px-3 py-2" value={period} onChange={e => { const preset = e.target.value as PeriodPreset; setPeriod(preset); if (preset !== 'custom') changeFilters(periodRange(preset)) }}><option value="month">This month</option><option value="last-month">Last month</option><option value="quarter">This quarter</option><option value="year">This year</option><option value="next-month">Next month</option><option value="next-quarter">Next 3 months</option><option value="custom">Custom date range</option></select></label>
          <div>
            <label className="block text-sm font-medium mb-1">From</label>
            <input
              type="date"
              disabled={period !== 'custom'}
              className="border rounded-lg px-3 py-2"
              aria-label="Report from date"
              value={from}
              onChange={(e) => changeFilters({ from: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">To</label>
            <input
              type="date"
              disabled={period !== 'custom'}
              className="border rounded-lg px-3 py-2"
              aria-label="Report to date"
              value={to}
              onChange={(e) => changeFilters({ to: e.target.value })}
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
              <th className="p-3">{type === 'expenses' ? 'Category' : 'House'}</th>
              <th className="p-3">{type === 'expenses' ? 'Description' : 'Charge'}</th>
              {type !== 'expenses' && <th className="p-3">Period</th>}
              {type === 'collected' || type === 'expenses' ? (
                <>
                  <th className="p-3">{type === 'expenses' ? 'Date' : 'Paid Date'}</th>
                  {type === 'collected' && <th className="p-3">Reference</th>}
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
                  {type !== 'expenses' && <td className="p-3">{r.period}</td>}
                  {type === 'collected' || type === 'expenses' ? (
                    <>
                      <td className="p-3">
                        {r.date ? new Date(r.date as string).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos' }) : '—'}
                      </td>
                      {type === 'collected' && (
                        <td className="p-3 font-mono text-xs">{r.reference}</td>
                      )}
                      <td className="p-3 text-right font-medium">
                        {naira(Number(r.amount))}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-3">
                        {r.dueDate ? new Date(r.dueDate as string).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos' }) : '—'}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            r.status === 'paid'
                              ? 'bg-green-100 text-green-700'
                              : r.status === 'partial'
                              ? 'bg-yellow-100 text-yellow-700'
                              : r.status === 'projected'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                          title={r.status === 'projected' ? 'Not yet a real invoice — shown for planning purposes' : undefined}
                        >
                          {r.status === 'projected' ? 'projected (not billed yet)' : r.status}
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
                <td colSpan={type === 'expenses' ? 4 : 6} className="p-6 text-center text-gray-500">
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
