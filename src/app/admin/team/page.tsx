import { requireRole } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { TeamActions } from '@/components/team-actions'

export default async function TeamPage() {
  const user = await requireRole(['super_admin'])
  const service = createServiceClient()

  const { data: staff } = await service
    .from('admins')
    .select('id, auth_user_id, full_name, role, created_at')
    .order('created_at', { ascending: true })

  const superAdminCount = (staff ?? []).filter((s) => s.role === 'super_admin').length

  const withEmails = await Promise.all(
    (staff ?? []).map(async (s) => {
      const { data } = await service.auth.admin.getUserById(s.auth_user_id)
      return { ...s, email: data.user?.email ?? '—' }
    })
  )

  return (
    <div className="page-wrap">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">Estate operations</span>
          <h1 className="page-title">Team</h1>
          <p className="page-lead">
            Everyone with admin, super admin, or gate staff access to Verdant.
          </p>
        </div>
        <div className="header-actions">
          <Link href="/admin/team/promote" className="action secondary">
            Promote a Resident
          </Link>
          <Link href="/admin/team/new" className="action">
            + Add Staff Member
          </Link>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Staff ({withEmails.length})</h2>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {withEmails.map((s) => (
            <div
              key={s.id}
              className="house-row"
              style={{ gridTemplateColumns: '1.3fr .5fr 1fr', padding: '1rem 1.25rem' }}
            >
              <div>
                <strong>
                  {s.full_name}
                  {s.auth_user_id === user.id && (
                    <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: '.4rem' }}>
                      (you)
                    </span>
                  )}
                </strong>
                <span>{s.email}</span>
              </div>
              <span style={{ color: 'var(--muted)', fontSize: '.8rem' }}>
                Since {new Date(s.created_at).toLocaleDateString()}
              </span>
              <TeamActions
                id={s.id}
                currentRole={s.role}
                isSelf={s.auth_user_id === user.id}
                isOnlySuperAdmin={s.role === 'super_admin' && superAdminCount <= 1}
              />
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs" style={{ color: 'var(--muted)', marginTop: '1rem' }}>
        Tip: always keep at least two super admins active. If only one exists and
        they lose access unexpectedly, no one else can manage the estate&apos;s
        admin panel without direct database access.
      </p>
    </div>
  )
}

export const metadata = {title: 'Admin Team', description: 'Manage your estate account and workspace with Verdant.', robots: {index: false, follow: false}}
