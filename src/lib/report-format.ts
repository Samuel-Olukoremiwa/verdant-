export type ReportType = 'due' | 'collected' | 'overdue' | 'future' | 'expenses' | 'income-statement'
export type ReportRow = Record<string, string | number | null>
export const REPORT_LABELS: Record<ReportType, string> = { due: 'Due Bills', collected: 'Collected', overdue: 'Overdue', future: 'Bills Expected in Future', expenses: 'Expenses', 'income-statement': 'Income Statement' }
export type PeriodPreset = 'month' | 'last-month' | 'quarter' | 'year' | 'next-month' | 'next-quarter' | 'custom'
export function periodRange(preset: Exclude<PeriodPreset, 'custom'>, today = new Date()) {
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(today)
  const year = Number(local.slice(0,4)), month = Number(local.slice(5,7)) - 1
  let startMonth = month, endMonth = month + 1
  if (preset === 'last-month') { startMonth--; endMonth-- }
  if (preset === 'quarter') { startMonth = Math.floor(month/3)*3; endMonth = startMonth+3 }
  if (preset === 'year') { startMonth = 0; endMonth = 12 }
  if (preset === 'next-month') { startMonth++; endMonth++ }
  if (preset === 'next-quarter') { startMonth++; endMonth += 3 }
  return { from: new Date(Date.UTC(year,startMonth,1)).toISOString().slice(0,10), to: new Date(Date.UTC(year,endMonth,0)).toISOString().slice(0,10) }
}
export function reportColumns(type: ReportType) {
  if(type === 'income-statement') return [{key:'label',label:'Income / Expense'},{key:'detail',label:'Amount (NGN)'},{key:'total',label:'Total (NGN)'}]
  if (type === 'expenses') return [{ key: 'house', label: 'Category' }, { key: 'charge', label: 'Description' }, { key: 'date', label: 'Date' }, { key: 'amount', label: 'Amount (NGN)' }]
  return [{ key: 'house', label: 'House' }, { key: 'charge', label: 'Charge' }, { key: 'period', label: 'Period' }, ...(type === 'collected' ? [{ key: 'date', label: 'Paid date (WAT)' }, { key: 'reference', label: 'Reference' }, { key: 'amount', label: 'Amount (NGN)' }] : [{ key: 'dueDate', label: 'Due date' }, { key: 'status', label: 'Status' }, { key: 'outstanding', label: 'Outstanding (NGN)' }])]
}
export function reportCell(row: ReportRow, key: string) {
  const value = row[key]
  if (value == null) return ''
  if (key === 'date' && String(value).includes('T')) return new Date(String(value)).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', hour12: false })
  return String(value)
}
export function reportCsv(type: ReportType, rows: ReportRow[], from?: string, to?: string) {
  const columns = reportColumns(type)
  const escape = (value: string) => {
    // Prevent spreadsheet formula execution from resident-entered text.
    const safe = /^[=+@\-\t\r]/.test(value) ? "'" + value : value
    return '"' + safe.replace(/"/g, '""') + '"'
  }
  return '\uFEFF' + [...(type==='income-statement' ? [[`Income Statement: ${from||''} to ${to||''}`, 'Cash basis; payment dates in WAT', ''].map(escape).join(',')] : []),columns.map(c => escape(c.label)).join(','), ...rows.map(r => columns.map(c => escape(reportCell(r,c.key))).join(','))].join('\r\n')
}
