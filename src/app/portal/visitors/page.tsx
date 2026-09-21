import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { VisitorPasses, type VisitorPass } from '@/components/visitor-passes'
export default async function VisitorsPage() {
  const user = await requireRole(['resident'])
  const db = await createClient()
  const { data: resident, error: residentError } = await db.from('residents').select('id').eq('auth_user_id', user.id).eq('is_active', true).single()
  if (residentError || !resident) return <div className="page-wrap"><p role="alert">Unable to load your resident profile.</p></div>
  const { data, error } = await db.from('visitor_passes').select('*').eq('resident_id', resident.id).order('starts_at', { ascending: false }).limit(50)
  return <div className="page-wrap"><Link href="/portal">← My portal</Link><h1 className="page-title">Visitor entry codes</h1><p className="page-lead mb-5">Invite someone to your home and share their one-time entry code.</p>{error ? <p role="alert">Visitor passes could not be loaded. Please contact the estate administrator.</p> : <VisitorPasses asOf={new Date().toISOString()} passes={(data ?? []) as VisitorPass[]} />}</div>
}

export const metadata = {title: 'Portal Visitors', description: 'Manage your estate account and workspace with Verdant.', robots: {index: false, follow: false}}
