import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import Link from 'next/link'
import { BillingSummary } from '@/components/billing-summary'
const naira = (amount: number) => `₦${amount.toLocaleString()}`
type House = { id: string; address: string }
type AccessLog = { id: string; direction: string; scanned_at: string; residents: { full_name: string } | null }
export default async function AdminDashboard() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  const firstName = user?.name?.split(' ')[0] ?? 'there'

  // All-time invoices — used for both the "All Time" view and for "who owes
  // money overall" in Balances needing attention, since arrears from past
  // periods still matter for follow-up regardless of the current month.
  const { data: allInvoices } = await supabase.from('invoices').select('id, amount, amount_paid, status, houses ( id, address )')

  // This month's invoices only — used for the "This Month" view.
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10)
  const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0)).toISOString().slice(0, 10)
  const { data: monthInvoices } = await supabase
    .from('invoices')
    .select('id, amount, amount_paid, houses ( id )')
    .gte('due_date', monthStart)
    .lte('due_date', monthEnd)

  const { data: rawAccessLogsToday } = await supabase.from('access_logs').select('id, direction, scanned_at, residents ( full_name )').gte('scanned_at', new Date().toISOString().slice(0, 10)).order('scanned_at', { ascending: false }).limit(5)
  const accessLogsToday = (rawAccessLogsToday ?? []) as unknown as AccessLog[]

  const byHouse: Record<string, { address: string; owed: number; paid: number }> = {}
  for (const inv of allInvoices ?? []) { const house = inv.houses as unknown as House | null; if (!house) continue; byHouse[house.id] ??= { address: house.address, owed: 0, paid: 0 }; byHouse[house.id].owed += Number(inv.amount); byHouse[house.id].paid += Number(inv.amount_paid ?? 0) }
  const houseList = Object.values(byHouse); const owing = houseList.filter((h) => h.paid < h.owed).sort((a,b) => (b.owed-b.paid)-(a.owed-a.paid)).slice(0,5)

  const monthHouseIds = new Set((monthInvoices ?? []).map((inv) => (inv.houses as unknown as { id: string } | null)?.id).filter(Boolean))
  const monthBilled = (monthInvoices ?? []).reduce((sum, inv) => sum + Number(inv.amount), 0)
  const monthCollected = (monthInvoices ?? []).reduce((sum, inv) => sum + Number(inv.amount_paid ?? 0), 0)
  const monthOutstanding = monthBilled - monthCollected

  const totalOwedAllTime = houseList.reduce((sum, h) => sum + h.owed, 0)
  const totalPaidAllTime = houseList.reduce((sum, h) => sum + h.paid, 0)
  const totalOutstandingAllTime = totalOwedAllTime - totalPaidAllTime
  const monthLabel = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return <div className="page-wrap"><div className="dashboard-header"><div><span className="eyebrow">Operations dashboard</span><h1 className="page-title">Good morning, {firstName}.</h1><p className="page-lead">Here’s the financial and gate activity snapshot for Evergreen Estate.</p></div><div className="header-actions"><Link href="/admin/residents/new" className="action secondary">Add resident</Link><Link href="/admin/invoices/generate" className="action">Generate dues <span aria-hidden="true">→</span></Link></div></div><BillingSummary monthLabel={monthLabel} month={{ billed: monthBilled, collected: monthCollected, outstanding: monthOutstanding, homes: monthHouseIds.size }} allTime={{ billed: totalOwedAllTime, collected: totalPaidAllTime, outstanding: totalOutstandingAllTime, homes: houseList.length }} /><section className="dashboard-grid" style={{ marginTop: '1.5rem' }}><article className="panel"><div className="panel-head"><h2>Balances needing attention</h2><Link href="/admin/residents">View residents →</Link></div><div className="panel-body">{owing.length ? owing.map((h) => <div className="house-row" key={h.address}><div><strong>{h.address}</strong><span>{naira(h.paid)} paid of {naira(h.owed)}</span></div><div><span className="pill">Outstanding</span></div><div className="amount red">{naira(h.owed-h.paid)}</div></div>) : <p className="empty">Nothing is outstanding. Your estate is all caught up.</p>}</div></article><article className="panel"><div className="panel-head"><h2>Today at the gate</h2><Link href="/admin/access-logs">All activity →</Link></div><div className="panel-body">{accessLogsToday?.length ? accessLogsToday.map((log) => <div className="activity" key={log.id}><span className={`activity-symbol ${log.direction === 'exit' ? 'exit' : ''}`} aria-hidden="true">{log.direction === 'exit' ? '↗' : '↘'}</span><div><strong>{log.residents?.full_name ?? 'Unknown resident'}</strong><small>{log.direction === 'exit' ? 'Exited' : 'Entered'} · {new Date(log.scanned_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</small></div></div>) : <p className="empty">No gate scans have been recorded today.</p>}</div></article></section></div>
}
