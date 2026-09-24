import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { PayButton } from '@/components/pay-button'
import { AdvancePaymentPanel } from '@/components/advance-payment-panel'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`

type Resident = {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  relationship: string | null
  house_id: string | null
  houses: {
    address: string
    house_type: string | null
    billing_responsible_resident_id: string | null
  } | null
}

type Invoice = {
  id: string
  period_label: string | null
  amount: number
  amount_paid: number | null
  status: string
  due_date: string | null
  due_types: { name: string } | null
}

function balance(invoices: Invoice[]) {
  return invoices.reduce(
    (sum, invoice) =>
      sum +
      Math.max(
        0,
        Number(invoice.amount) - Number(invoice.amount_paid ?? 0)
      ),
    0
  )
}

function InvoiceRows({ invoices }: { invoices: Invoice[] }) {
  const outstandingInvoices = invoices.filter(
    (invoice) => Number(invoice.amount) > Number(invoice.amount_paid ?? 0)
  )

  if (!outstandingInvoices.length) {
    return (
      <p className="empty">
        Nothing outstanding — you&apos;re all caught up. See{' '}
        <Link href="/portal/payments">payment history</Link> for past charges.
      </p>
    )
  }

  return (
    <>
      {outstandingInvoices.map((invoice) => {
        const outstanding = Math.max(
          0,
          Number(invoice.amount) - Number(invoice.amount_paid ?? 0)
        )

        return (
          <div className="invoice-row" key={invoice.id}>
            <div>
              <strong>{invoice.due_types?.name ?? 'Estate charge'}</strong>
              <span>
                {invoice.period_label ?? 'Current period'}
                {invoice.due_date
                  ? ` · Due ${new Date(invoice.due_date).toLocaleDateString(
                      'en-GB',
                      { timeZone: 'Africa/Lagos' }
                    )}`
                  : ''}
              </span>
            </div>
            <span className="pill">{invoice.status}</span>
            <strong>{naira(outstanding)}</strong>
            <PayButton invoiceId={invoice.id} outstanding={outstanding} />
          </div>
        )
      })}
    </>
  )
}

export default async function Portal() {
  const user = await requireRole(['resident'])
  const supabase = await createClient()

  const { data, error: profileError } = await supabase
    .from('residents')
    .select(`
      id,
      full_name,
      phone,
      email,
      relationship,
      house_id,
      houses:houses!residents_house_id_fkey (
        address,
        house_type,
        billing_responsible_resident_id
      )
    `)
    .eq('auth_user_id', user.id)
    .single()

  const resident = data as unknown as Resident | null

  if (profileError || !resident) {
    return (
      <div className="portal-wrap">
        <h1 className="page-title">Unable to load your resident profile</h1>
        <p>
          Please reload or ask the estate office to check your account and
          database setup.
        </p>
      </div>
    )
  }

  const responsibleId = resident.houses?.billing_responsible_resident_id ?? null
  const canManageHousehold = responsibleId
    ? responsibleId === resident.id
    : resident.relationship === 'owner'

  const isReassignedResponsible =
    responsibleId === resident.id && resident.relationship !== 'owner'

  const [personalResult, householdResult, fixedResult] = await Promise.all([
    supabase
      .from('invoices')
      .select(
        'id, period_label, amount, amount_paid, status, due_date, due_types ( name )'
      )
      .eq('resident_id', resident.id)
      .order('due_date', { ascending: true }),

    canManageHousehold && resident.house_id
      ? supabase
          .from('invoices')
          .select(
            'id, period_label, amount, amount_paid, status, due_date, due_types ( name )'
          )
          .eq('house_id', resident.house_id)
          .is('resident_id', null)
          .order('due_date', { ascending: true })
      : Promise.resolve({ data: [], error: null }),

    canManageHousehold
      ? supabase
          .from('due_types')
          .select('id, name, amount')
          .eq('billing_scope', 'house')
          .in('name', ['Service Charge', 'CDA Levy'])
      : Promise.resolve({ data: [], error: null }),
  ])

  const personalInvoices = (personalResult.data ?? []) as unknown as Invoice[]
  const householdInvoices = (householdResult.data ?? []) as unknown as Invoice[]

  const personalOutstanding = balance(personalInvoices)
  const householdOutstanding = balance(householdInvoices)
  const totalOutstanding = personalOutstanding + householdOutstanding

  return (
    <div className="portal-wrap">
      <section className="portal-welcome">
        <span className="eyebrow">Your home at Sample estate</span>
        <h1>
          Hello, {resident.full_name?.split(' ')[0] ?? user.name.split(' ')[0]}.
        </h1>
        <p>Keep an eye on your charges, payments and home details in one place.</p>
      </section>

      {isReassignedResponsible && (
        <section
          style={{
            background: '#e7f5e9',
            border: '1px solid #bfe0c9',
            borderRadius: '.6rem',
            padding: '.85rem 1.1rem',
            marginBottom: '1.25rem',
            fontSize: '.85rem',
            color: '#276d4b',
            fontWeight: 600,
          }}
        >
          You&apos;re currently responsible for this house&apos;s estate bills.
        </section>
      )}

      <section className="portal-stats">
        <article>
          <span>Your outstanding balance</span>
          <strong className={totalOutstanding ? 'red' : ''}>
            {naira(totalOutstanding)}
          </strong>
          <small>
            {totalOutstanding
              ? 'Personal dues plus any household dues you manage'
              : 'Your account is clear'}
          </small>
        </article>

        <article>
          <span>Personal dues</span>
          <strong className={personalOutstanding ? 'red' : ''}>
            {naira(personalOutstanding)}
          </strong>
          <small>Charges assigned directly to you</small>
        </article>

        {canManageHousehold && (
          <article>
            <span>Household dues</span>
            <strong className={householdOutstanding ? 'red' : ''}>
              {naira(householdOutstanding)}
            </strong>
            <small>Charges for the household you manage</small>
          </article>
        )}

        <article>
          <span>Your residence</span>
          <strong>{resident.houses?.address ?? 'Home record pending'}</strong>
          <small>{resident.houses?.house_type ?? 'Sample estate'}</small>
          <Link
            href="/portal/qr-pass"
            style={{
              display: 'block',
              marginTop: '.6rem',
              fontSize: '.8rem',
              fontWeight: 800,
              color: 'var(--moss)',
            }}
          >
            View my gate pass →
          </Link>
        </article>
      </section>

      <section className="portal-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>My personal charges</h2>
            <Link href="/portal/payments" className="eyebrow">
              Payment history →
            </Link>
          </div>
          <div className="invoice-list">
            {personalResult.error ? (
              <p className="empty" role="alert">
                Unable to load personal charges. Please reload or contact the
                estate office.
              </p>
            ) : (
              <InvoiceRows invoices={personalInvoices} />
            )}
          </div>
        </article>

        <article className="profile-card">
          <span className="eyebrow">Profile</span>
          <h2>Your household details</h2>
          <dl>
            <div>
              <dt>Email</dt>
              <dd>{resident.email ?? user.email ?? 'Not provided'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{resident.phone ?? 'Not provided'}</dd>
            </div>
            <div>
              <dt>Relationship</dt>
              <dd className="capitalize">{resident.relationship ?? 'Resident'}</dd>
            </div>
          </dl>
          <p>Need to update a household detail? Contact the estate office.</p>
        </article>
      </section>

      {canManageHousehold ? (
        <>
          <section style={{ marginTop: '1.5rem' }}>
            <article className="panel">
              <div className="panel-head">
                <h2>Household charges</h2>
                <span className="eyebrow">You are the billing contact</span>
              </div>
              <div className="invoice-list">
                {householdResult.error ? (
                  <p className="empty" role="alert">
                    Unable to load household bills. Please reload or contact the
                    estate office.
                  </p>
                ) : (
                  <InvoiceRows invoices={householdInvoices} />
                )}
              </div>
            </article>
          </section>

          <section style={{ marginTop: '1.5rem' }}>
            <AdvancePaymentPanel dueTypes={fixedResult.data ?? []} />
          </section>
        </>
      ) : (
        <section className="profile-card" style={{ marginTop: '1.5rem' }}>
          <span className="eyebrow">Household billing</span>
          <h2>Managed separately</h2>
          <p>
            Estate charges for this house are managed by the Home Owner or the
            billing contact designated by the estate office. They are not shown
            as your personal debt.
          </p>
        </section>
      )}
    </div>
  )
}

export const metadata = {
  title: 'Portal',
  description: 'Manage your estate account and workspace with Verdant.',
  robots: { index: false, follow: false },
}
