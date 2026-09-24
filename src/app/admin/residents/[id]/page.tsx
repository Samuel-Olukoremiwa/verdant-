import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ToggleActiveButton } from '@/components/toggle-active-button'
import { ManualPaymentForm } from '@/components/manual-payment-form'
import { CreateLoginButton } from '@/components/create-login-button'
import { BillingResponsibilityCard } from '@/components/billing-responsibility-card'
import { isoToDdMmYyyy } from '@/lib/date-format'

const naira = (number: number) =>
  `₦${number.toLocaleString('en-NG')}`

type Resident = {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  relationship: string | null
  block_number: string | null
  flat_number: string | null
  vehicle_plate_numbers: string[] | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  move_in_date: string | null
  property_allocation_date: string | null
  is_active: boolean
  house_id: string | null
  auth_user_id: string | null
  houses: {
    address: string
    house_type: string | null
    billing_responsible_resident_id: string | null
  } | null
}

type HouseResident = {
  id: string
  full_name: string
  relationship: string | null
  is_active: boolean
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

function outstandingTotal(invoices: Invoice[]) {
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

function InvoiceList({
  invoices,
  emptyText,
  manualPaymentResidentId,
}: {
  invoices: Invoice[]
  emptyText: string
  manualPaymentResidentId: string | null
}) {
  if (!invoices.length) {
    return <p className="empty">{emptyText}</p>
  }

  return (
    <div>
      {invoices.map((invoice) => {
        const outstanding = Math.max(
          0,
          Number(invoice.amount) - Number(invoice.amount_paid ?? 0)
        )

        return (
          <div
            className="invoice-row"
            key={invoice.id}
            style={{
              flexDirection: 'column',
              alignItems: 'stretch',
              display: 'flex',
              gap: '.4rem',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: '1rem',
                alignItems: 'center',
              }}
            >
              <div>
                <strong>{invoice.due_types?.name ?? 'Estate charge'}</strong>
                <span>
                  {invoice.period_label ?? 'Current period'}
                  {invoice.due_date
                    ? ` · Due ${isoToDdMmYyyy(invoice.due_date)}`
                    : ''}
                </span>
              </div>

              <span className={`pill ${invoice.status === 'paid' ? 'good' : ''}`}>
                {invoice.status}
              </span>

              <strong>{naira(outstanding)} outstanding</strong>
            </div>

            {outstanding > 0 && manualPaymentResidentId && (
              <ManualPaymentForm
                invoiceId={invoice.id}
                residentId={manualPaymentResidentId}
                outstanding={outstanding}
              />
            )}
          </div>
        )
      })}
    </div>
  )
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
    .select(`
      id,
      full_name,
      phone,
      email,
      relationship,
      block_number,
      flat_number,
      vehicle_plate_numbers,
      emergency_contact_name,
      emergency_contact_phone,
      move_in_date,
      property_allocation_date,
      is_active,
      house_id,
      auth_user_id,
      houses:houses!residents_house_id_fkey (
        address,
        house_type,
        billing_responsible_resident_id
      )
    `)
    .eq('id', id)
    .single()

  const resident = data as unknown as Resident | null
  if (!resident) notFound()

  const [houseInvoiceResult, personalInvoiceResult, houseResidentsResult] =
    await Promise.all([
      resident.house_id
        ? supabase
            .from('invoices')
            .select(`
              id,
              period_label,
              amount,
              amount_paid,
              status,
              due_date,
              due_types ( name )
            `)
            .eq('house_id', resident.house_id)
            .is('resident_id', null)
            .order('due_date', { ascending: false })
        : Promise.resolve({ data: [], error: null }),

      supabase
        .from('invoices')
        .select(`
          id,
          period_label,
          amount,
          amount_paid,
          status,
          due_date,
          due_types ( name )
        `)
        .eq('resident_id', resident.id)
        .order('due_date', { ascending: false }),

      resident.house_id
        ? supabase
            .from('residents')
            .select('id, full_name, relationship, is_active')
            .eq('house_id', resident.house_id)
        : Promise.resolve({ data: [], error: null }),
    ])

  const houseInvoices = (houseInvoiceResult.data ?? []) as unknown as Invoice[]
  const personalInvoices = (personalInvoiceResult.data ?? []) as unknown as Invoice[]
  const houseResidents = (houseResidentsResult.data ?? []) as unknown as HouseResident[]

  const explicitBillingId =
    resident.houses?.billing_responsible_resident_id ?? null

  const defaultOwner = houseResidents.find(
    (candidate) => candidate.is_active && candidate.relationship === 'owner'
  )

  const billingContactId = explicitBillingId ?? defaultOwner?.id ?? null
  const billingContactName =
    houseResidents.find((candidate) => candidate.id === billingContactId)
      ?.full_name ?? null

  const managesHouseholdBilling =
    Boolean(billingContactId) && billingContactId === resident.id

  const houseOutstanding = outstandingTotal(houseInvoices)
  const personalOutstanding = outstandingTotal(personalInvoices)

  const displayAddress = [
    resident.houses?.address ?? 'No house linked',
    resident.block_number ? `Block ${resident.block_number}` : null,
    resident.flat_number ? `Flat ${resident.flat_number}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="page-wrap max-w-4xl">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">Resident profile</span>
          <h1 className="page-title">{resident.full_name}</h1>
          <p className="page-lead">{displayAddress}</p>
        </div>

        <div className="header-actions">
          <Link href="/admin/residents" className="action secondary">
            ← All residents
          </Link>

          <Link
            href={`/admin/residents/${resident.id}/edit`}
            className="action secondary"
          >
            Edit
          </Link>

          <ToggleActiveButton
            residentId={resident.id}
            isActive={resident.is_active}
          />
        </div>
      </div>

      <div className="dashboard-grid" style={{ marginTop: '1.5rem' }}>
        <article className="panel">
          <div className="panel-head">
            <h2>Household details</h2>
          </div>

          <div className="panel-body" style={{ padding: '1rem 1.25rem' }}>
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1rem',
                fontSize: '.85rem',
              }}
            >
              <div>
                <dt>Phone</dt>
                <dd>{resident.phone ?? '—'}</dd>
              </div>

              <div>
                <dt>Email</dt>
                <dd>{resident.email ?? '—'}</dd>
              </div>

              <div>
                <dt>Status</dt>
                <dd>
                  {resident.relationship === 'owner'
                    ? 'Home Owner'
                    : resident.relationship === 'family_member'
                      ? 'Family Member'
                      : resident.relationship === 'tenant'
                        ? 'Tenant'
                        : '—'}
                </dd>
              </div>

              <div>
                <dt>Block</dt>
                <dd>{resident.block_number ?? '—'}</dd>
              </div>

              <div>
                <dt>Flat</dt>
                <dd>{resident.flat_number ?? '—'}</dd>
              </div>

              <div>
                <dt>Move-in date</dt>
                <dd>{isoToDdMmYyyy(resident.move_in_date) || '—'}</dd>
              </div>

              <div>
                <dt>Property allocation date</dt>
                <dd>
                  {isoToDdMmYyyy(resident.property_allocation_date) || '—'}
                </dd>
              </div>

              <div>
                <dt>House type</dt>
                <dd>{resident.houses?.house_type ?? '—'}</dd>
              </div>

              <div>
                <dt>Vehicle plate(s)</dt>
                <dd>{resident.vehicle_plate_numbers?.join(', ') || '—'}</dd>
              </div>

              <div>
                <dt>Emergency contact</dt>
                <dd>{resident.emergency_contact_name ?? '—'}</dd>
              </div>

              <div>
                <dt>Emergency phone</dt>
                <dd>{resident.emergency_contact_phone ?? '—'}</dd>
              </div>
            </dl>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Status</h2>
          </div>

          <div className="panel-body" style={{ padding: '1.25rem' }}>
            <span className={`pill ${resident.is_active ? 'good' : ''}`}>
              {resident.is_active ? 'Active' : 'Inactive'}
            </span>

            <p style={{ fontSize: '.78rem', marginTop: '.8rem' }}>
              {resident.is_active
                ? 'This resident can use their gate pass and portal normally.'
                : 'This resident is inactive and their gate pass is disabled.'}
            </p>

            <div
              style={{
                marginTop: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid var(--line)',
              }}
            >
              {resident.auth_user_id ? (
                <CreateLoginButton residentId={resident.id} mode="reset" />
              ) : (
                <CreateLoginButton residentId={resident.id} mode="create" />
              )}
            </div>
          </div>
        </article>
      </div>

      {resident.house_id && (
        <div style={{ marginTop: '1.25rem' }}>
          <BillingResponsibilityCard
            houseId={resident.house_id}
            currentResponsibleId={
              resident.houses?.billing_responsible_resident_id ?? null
            }
          />
        </div>
      )}

      {resident.house_id && (
        <article className="panel" style={{ marginTop: '1.25rem' }}>
          <div className="panel-head">
            <div>
              <h2>Household billing</h2>
              <p className="text-xs text-gray-500 mt-1">
                These invoices belong to {resident.houses?.address ?? 'the house'},
                not personally to every resident who lives there.
              </p>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Link
                href={`/admin/invoices/generate?mode=household&house=${resident.house_id}`}
                className="action"
              >
                + Add household due
              </Link>
              <Link href="/admin/invoices" className="action secondary">
                View invoices
              </Link>
            </div>
          </div>

          <div className="panel-body">
            <div className="rounded-lg border p-4 mb-4 text-sm">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <span className="text-gray-500">Household outstanding</span>
                  <strong className="block text-lg mt-1">
                    {naira(houseOutstanding)}
                  </strong>
                </div>

                <div>
                  <span className="text-gray-500">Billing contact</span>
                  <strong className="block mt-1">
                    {billingContactName ?? 'Not assigned'}
                  </strong>
                </div>
              </div>

              {!managesHouseholdBilling && billingContactName && (
                <p className="mt-3 text-gray-600">
                  This household balance is managed by {billingContactName}. It
                  is not counted as {resident.full_name}&apos;s personal debt.
                </p>
              )}
            </div>

            <InvoiceList
              invoices={houseInvoices}
              emptyText="No household charges recorded for this house yet."
              manualPaymentResidentId={
                managesHouseholdBilling ? resident.id : null
              }
            />
          </div>
        </article>
      )}

      <article className="panel" style={{ marginTop: '1.25rem' }}>
        <div className="panel-head">
          <div>
            <h2>Personal billing</h2>
            <p className="text-xs text-gray-500 mt-1">
              These charges belong only to {resident.full_name}.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Link
              href={`/admin/invoices/generate?mode=resident&resident=${resident.id}`}
              className="action"
            >
              + Add personal due
            </Link>
            <Link href="/admin/invoices" className="action secondary">
              View invoices
            </Link>
          </div>
        </div>

        <div className="panel-body">
          <div className="rounded-lg border p-4 mb-4 text-sm">
            <span className="text-gray-500">Personal outstanding</span>
            <strong className="block text-lg mt-1">
              {naira(personalOutstanding)}
            </strong>
          </div>

          <InvoiceList
            invoices={personalInvoices}
            emptyText="No personal charges recorded for this resident yet."
            manualPaymentResidentId={resident.id}
          />
        </div>
      </article>
    </div>
  )
}

export const metadata = {
  title: 'Admin Residents',
  description: 'Manage residents with Verdant.',
  robots: { index: false, follow: false },
}
