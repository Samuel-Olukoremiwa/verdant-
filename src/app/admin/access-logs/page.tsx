import { createClient } from '@/lib/supabase/server'

type Log = { id: string; direction: string; scanned_at: string; scanned_by: string | null; residents: { full_name: string } | null }

export default async function AccessLogsPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('access_logs').select('id, direction, scanned_at, scanned_by, residents ( full_name )').order('scanned_at', { ascending: false }).limit(50)
  const logs = (data ?? []) as unknown as Log[]
  return <div className="page-wrap max-w-5xl"><div className="dashboard-header"><div><span className="eyebrow">Gate operations</span><h1 className="page-title">Access activity</h1><p className="page-lead">A clear, time-stamped record of every resident movement.</p></div></div><section className="panel" aria-label="Access log"><div className="panel-head"><h2>Latest scans</h2><span className="eyebrow">Live record</span></div><div className="panel-body">{logs.length ? logs.map((log) => <div className="activity" key={log.id}><span className={`activity-symbol ${log.direction === 'exit' ? 'exit' : ''}`} aria-hidden="true">{log.direction === 'exit' ? '↗' : '↘'}</span><div><strong>{log.residents?.full_name ?? 'Unknown resident'}</strong><small>{log.direction === 'exit' ? 'Exited' : 'Entered'} · {new Date(log.scanned_at).toLocaleString()} {log.scanned_by ? `· scanned by ${log.scanned_by}` : ''}</small></div></div>) : <p className="empty">No access activity has been recorded yet.</p>}</div></section></div>
}
