import { createClient } from '@/lib/supabase/server'
export async function VisitorEntryLog() {
  const db = await createClient()
  const { data, error } = await db.from('visitor_passes').select('id,visitor_name,address,redeemed_at,admins(full_name)').not('redeemed_at', 'is', null).order('redeemed_at', { ascending: false }).limit(30)
  return <section className="panel mt-5"><div className="panel-head"><h2>Latest visitor entries</h2></div><div className="panel-body">{error ? <p role="alert">Visitor entries could not be loaded. Check that the visitor migration has been applied.</p> : data?.length ? data.map(v => <div className="activity" key={v.id}><span className="activity-symbol">↘</span><div><strong>{v.visitor_name}</strong><p>{v.address}</p><small>{new Date(v.redeemed_at).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })} WAT</small></div></div>) : <p className="empty">No visitor entries recorded yet.</p>}</div></section>
}
