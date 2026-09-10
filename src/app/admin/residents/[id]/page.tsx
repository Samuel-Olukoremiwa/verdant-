import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ToggleActiveButton } from '@/components/toggle-active-button'
import { ManualPaymentForm } from '@/components/manual-payment-form'
import { CreateLoginButton } from '@/components/create-login-button'

const naira = (n: number) => `₦${n.toLocaleString()}`

type Resident = {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  relationship: string | null
  vehicle_plate_numbers: string[] | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  move_in_date: string | null
  is_active: boolean
  house_id: string | null
  auth_user_id: string | null
  houses: { address: string; house_type: string | null } | null
}

type Invoice = {
  id: string
  period_label: string | null
  amount: number
  amount_paid: number | null
  status: string
  due_types: { name: string } | null
}

export default async function ResidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('residents')
    .select(
      'id, full_name, phone, email, relationship, vehicle_plate_numbers, emergency_contact_name, emergency_contact_phone, move_in_date, is_active, house_id, auth_user_id, houses ( address, house_type )'
    )
    .eq('id', id)
    .single()

  const resident = data as unknown as Resident | null
  if (!resident) notFound()

  const { data: invoiceRows } = resident.house_id
    ? await supabase
        .from('invoices')
        .select('id, period_label, amount, amount_paid, status, due_types ( name )')
        .eq('house_id', resident.house_id)
        .order('due_date', { ascending: false })
    : { data: [] }
  const invoices = (invoiceRows ?? []) as unknown as Invoice[]

  return (
    <div className="page-wrap max-w-4xl">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">Resident profile</span>
          <h1 className="page-title">{resident.full_name}</h1>
          <p className="page-lead">{resident.houses?.address ?? 'No house linked'}</p>
        </div>
        <div className="header-actions">
          <Link href="/admin/residents" className="action secondary">
            ← All residents
          </Link>
          <Link href={`/admin/residents/${resident.id}/edit`} className="action secondary">
            Edit
          </Link>
          <ToggleActiveButton residentId={resident.id} isActive={resident.is_active} />
        </div>
      </div>

      <div className="dashboard-grid" style={{ marginTop: '1.5rem' }}>
        <article className="panel">
          <div className="panel-head">
            <h2>Household details</h2>
          </div>
          <div className="panel-body" style={{ padding: '1rem 1.25rem' }}>
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '.85rem' }}>
              <div><dt style={{ color: 'var(--muted)', fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase' }}>Phone</dt><dd>{resident.phone ?? '—'}</dd></div>
              <div><dt style={{ color: 'var(--muted)', fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase' }}>Email</dt><dd>{resident.email ?? '—'}</dd></div>
              <div><dt style={{ color: 'var(--muted)', fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase' }}>Relationship</dt><dd className="capitalize">{resident.relationship ?? '—'}</dd></div>
              <div><dt style={{ color: 'var(--muted)', fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase' }}>Move-in date</dt><dd>{resident.move_in_date ? new Date(resident.move_in_date).toLocaleDateString() : '—'}</dd></div>
              <div><dt style={{ color: 'var(--muted)', fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase' }}>House type</dt><dd>{resident.houses?.house_type ?? '—'}</dd></div>
              <div><dt style={{ color: 'var(--muted)', fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase' }}>Vehicle plate(s)</dt><dd>{resident.vehicle_plate_numbers?.join(', ') || '—'}</dd></div>
              <div><dt style={{ color: 'var(--muted)', fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase' }}>Emergency contact</dt><dd>{resident.emergency_contact_name ?? '—'}</dd></div>
              <div><dt style={{ color: 'var(--muted)', fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase' }}>Emergency phone</dt><dd>{resident.emergency_contact_phone ?? '—'}</dd></div>
            </dl>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Status</h2>
          </div>
          <div className="panel-body" style={{ padding: '1.25rem' }}>
            <span
              className={`pill ${resident.is_active ? 'good' : ''}`}
              style={{ fontSize: '.8rem' }}
            >
              {resident.is_active ? 'Active' : 'Inactive'}
            </span>
            <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: '.8rem', lineHeight: 1.5 }}>
              {resident.is_active
                ? 'This resident can be scanned in/out at the gate and can log in normally.'
                : 'This resident\u2019s QR pass will be rejected at the gate. Use this for residents who have moved out.'}
            </p>
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
              {resident.auth_user_id ? (
                <div>
                  <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '.6rem' }}>
                    ✓ This resident already has a portal login.
                  </p>
                  <CreateLoginButton residentId={resident.id} mode="reset" />
                </div>
              ) : (
                <CreateLoginButton residentId={resident.id} mode="create" />
              )}
            </div>
          </div>
        </article>
      </div>

      <article className="panel" style={{ marginTop: '1.25rem' }}>
        <div className="panel-head">
          <h2>Estate charges for this house</h2>
        </div>
        <div className="panel-body">
          {invoices.length > 0 ? (
            invoices.map((inv) => {
              const outstanding = Math.max(0, Number(inv.amount) - Number(inv.amount_paid ?? 0))
              return (
                <div className="invoice-row" key={inv.id} style={{ flexDirection: 'column', alignItems: 'stretch', display: 'flex', gap: '.4rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '1rem', alignItems: 'center' }}>
                    <div>
                      <strong>{inv.due_types?.name ?? 'Estate charge'}</strong>
                      <span>{inv.period_label ?? 'Current period'}</span>
                    </div>
                    <span className={`pill ${inv.status === 'paid' ? 'good' : ''}`}>
                      {inv.status}
                    </span>
                    <strong>{naira(outstanding)} outstanding</strong>
                  </div>
                  {outstanding > 0 && (
                    <ManualPaymentForm
                      invoiceId={inv.id}
                      residentId={resident.id}
                      outstanding={outstanding}
                    />
                  )}
                </div>
              )
            })
          ) : (
            <p className="empty">No charges recorded for this house yet.</p>
          )}
        </div>
      </article>
    </div>
  )
}
