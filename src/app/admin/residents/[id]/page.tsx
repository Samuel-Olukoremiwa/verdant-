import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ToggleActiveButton } from '@/components/toggle-active-button'
import { ManualPaymentForm } from '@/components/manual-payment-form'
import { CreateLoginButton } from '@/components/create-login-button'
import { BillingResponsibilityCard } from '@/components/billing-responsibility-card'
import { isoToDdMmYyyy } from '@/lib/date-format'

const naira = (
  number: number
) =>
  `₦${number.toLocaleString(
    'en-NG'
  )}`

type Resident = {
  id: string
  full_name: string
  phone:
    | string
    | null
  email:
    | string
    | null
  relationship:
    | string
    | null
  block_number:
    | string
    | null
  flat_number:
    | string
    | null
  vehicle_plate_numbers:
    | string[]
    | null
  emergency_contact_name:
    | string
    | null
  emergency_contact_phone:
    | string
    | null
  move_in_date:
    | string
    | null
  property_allocation_date:
    | string
    | null
  is_active: boolean
  house_id:
    | string
    | null
  auth_user_id:
    | string
    | null
  houses:
    | {
        address: string
        house_type:
          | string
          | null
        billing_responsible_resident_id:
          | string
          | null
      }
    | null
}

type Invoice = {
  id: string
  period_label:
    | string
    | null
  amount: number
  amount_paid:
    | number
    | null
  status: string
  due_types:
    | {
        name: string
      }
    | null
}

export default async function ResidentDetailPage({
  params,
}: {
  params: Promise<{
    id: string
  }>
}) {
  const { id } =
    await params

  const supabase =
    await createClient()

  const { data } =
    await supabase
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
      .eq(
        'id',
        id
      )
      .single()

  const resident =
    data as unknown as
      | Resident
      | null

  if (!resident) {
    notFound()
  }

  const {
    data:
      invoiceRows,
  } =
    resident.house_id
      ? await supabase
          .from(
            'invoices'
          )
          .select(`
            id,
            period_label,
            amount,
            amount_paid,
            status,
            due_types (
              name
            )
          `)
          .eq(
            'house_id',
            resident.house_id
          )
          .order(
            'due_date',
            {
              ascending:
                false,
            }
          )
      : {
          data: [],
        }

  const invoices =
    (
      invoiceRows ??
      []
    ) as unknown as Invoice[]

  const displayAddress =
    [
      resident.houses
        ?.address ??
        'No house linked',

      resident.block_number
        ? `Block ${resident.block_number}`
        : null,

      resident.flat_number
        ? `Flat ${resident.flat_number}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ')

  return (
    <div className="page-wrap max-w-4xl">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">
            Resident profile
          </span>

          <h1 className="page-title">
            {
              resident.full_name
            }
          </h1>

          <p className="page-lead">
            {displayAddress}
          </p>
        </div>

        <div className="header-actions">
          <Link
            href="/admin/residents"
            className="action secondary"
          >
            ← All residents
          </Link>

          <Link
            href={`/admin/residents/${resident.id}/edit`}
            className="action secondary"
          >
            Edit
          </Link>

          <ToggleActiveButton
            residentId={
              resident.id
            }
            isActive={
              resident.is_active
            }
          />
        </div>
      </div>

      <div
        className="dashboard-grid"
        style={{
          marginTop:
            '1.5rem',
        }}
      >
        <article className="panel">
          <div className="panel-head">
            <h2>
              Household details
            </h2>
          </div>

          <div
            className="panel-body"
            style={{
              padding:
                '1rem 1.25rem',
            }}
          >
            <dl
              style={{
                display:
                  'grid',

                gridTemplateColumns:
                  '1fr 1fr',

                gap:
                  '1rem',

                fontSize:
                  '.85rem',
              }}
            >
              <div>
                <dt>
                  Phone
                </dt>

                <dd>
                  {resident.phone ??
                    '—'}
                </dd>
              </div>

              <div>
                <dt>
                  Email
                </dt>

                <dd>
                  {resident.email ??
                    '—'}
                </dd>
              </div>

              <div>
                <dt>
                  Status
                </dt>

                <dd>
                  {resident.relationship ===
                  'owner'
                    ? 'Home Owner'
                    : resident.relationship ===
                        'family_member'
                      ? 'Family Member'
                      : resident.relationship ===
                          'tenant'
                        ? 'Tenant'
                        : '—'}
                </dd>
              </div>

              <div>
                <dt>
                  Block
                </dt>

                <dd>
                  {resident.block_number ??
                    '—'}
                </dd>
              </div>

              <div>
                <dt>
                  Flat
                </dt>

                <dd>
                  {resident.flat_number ??
                    '—'}
                </dd>
              </div>

              <div>
                <dt>
                  Move-in date
                </dt>

                <dd>
                  {isoToDdMmYyyy(
                    resident.move_in_date
                  ) || '—'}
                </dd>
              </div>

              <div>
                <dt>
                  Property allocation date
                </dt>

                <dd>
                  {isoToDdMmYyyy(
                    resident
                      .property_allocation_date
                  ) || '—'}
                </dd>
              </div>

              <div>
                <dt>
                  House type
                </dt>

                <dd>
                  {resident.houses
                    ?.house_type ??
                    '—'}
                </dd>
              </div>

              <div>
                <dt>
                  Vehicle plate(s)
                </dt>

                <dd>
                  {resident
                    .vehicle_plate_numbers
                    ?.join(', ') ||
                    '—'}
                </dd>
              </div>

              <div>
                <dt>
                  Emergency contact
                </dt>

                <dd>
                  {resident
                    .emergency_contact_name ??
                    '—'}
                </dd>
              </div>

              <div>
                <dt>
                  Emergency phone
                </dt>

                <dd>
                  {resident
                    .emergency_contact_phone ??
                    '—'}
                </dd>
              </div>
            </dl>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Status</h2>
          </div>

          <div
            className="panel-body"
            style={{
              padding:
                '1.25rem',
            }}
          >
            <span
              className={`pill ${
                resident.is_active
                  ? 'good'
                  : ''
              }`}
            >
              {resident.is_active
                ? 'Active'
                : 'Inactive'}
            </span>

            <p
              style={{
                fontSize:
                  '.78rem',
                marginTop:
                  '.8rem',
              }}
            >
              {resident.is_active
                ? 'This resident can use their gate pass and portal normally.'
                : 'This resident is inactive and their gate pass is disabled.'}
            </p>

            <div
              style={{
                marginTop:
                  '1rem',

                paddingTop:
                  '1rem',

                borderTop:
                  '1px solid var(--line)',
              }}
            >
              {resident.auth_user_id ? (
                <CreateLoginButton
                  residentId={
                    resident.id
                  }
                  mode="reset"
                />
              ) : (
                <CreateLoginButton
                  residentId={
                    resident.id
                  }
                  mode="create"
                />
              )}
            </div>
          </div>
        </article>
      </div>

      {resident.house_id && (
        <div
          style={{
            marginTop:
              '1.25rem',
          }}
        >
          <BillingResponsibilityCard
            houseId={
              resident.house_id
            }
            currentResponsibleId={
              resident.houses
                ?.billing_responsible_resident_id ??
              null
            }
          />
        </div>
      )}

      <article
        className="panel"
        style={{
          marginTop:
            '1.25rem',
        }}
      >
        <div className="panel-head">
          <h2>
            Estate charges for this house
          </h2>
        </div>

        <div className="panel-body">
          {invoices.length >
          0 ? (
            invoices.map(
              (invoice) => {
                const outstanding =
                  Math.max(
                    0,
                    Number(
                      invoice.amount
                    ) -
                      Number(
                        invoice.amount_paid ??
                          0
                      )
                  )

                return (
                  <div
                    className="invoice-row"
                    key={
                      invoice.id
                    }
                    style={{
                      flexDirection:
                        'column',

                      alignItems:
                        'stretch',

                      display:
                        'flex',

                      gap:
                        '.4rem',
                    }}
                  >
                    <div
                      style={{
                        display:
                          'grid',

                        gridTemplateColumns:
                          '1fr auto auto',

                        gap:
                          '1rem',

                        alignItems:
                          'center',
                      }}
                    >
                      <div>
                        <strong>
                          {invoice
                            .due_types
                            ?.name ??
                            'Estate charge'}
                        </strong>

                        <span>
                          {invoice
                            .period_label ??
                            'Current period'}
                        </span>
                      </div>

                      <span
                        className={`pill ${
                          invoice.status ===
                          'paid'
                            ? 'good'
                            : ''
                        }`}
                      >
                        {
                          invoice.status
                        }
                      </span>

                      <strong>
                        {naira(
                          outstanding
                        )}{' '}
                        outstanding
                      </strong>
                    </div>

                    {outstanding >
                      0 && (
                      <ManualPaymentForm
                        invoiceId={
                          invoice.id
                        }
                        residentId={
                          resident.id
                        }
                        outstanding={
                          outstanding
                        }
                      />
                    )}
                  </div>
                )
              }
            )
          ) : (
            <p className="empty">
              No charges
              recorded for this
              house yet.
            </p>
          )}
        </div>
      </article>
    </div>
  )
}

export const metadata = {
  title:
    'Admin Residents',

  description:
    'Manage residents with Verdant.',

  robots: {
    index: false,
    follow: false,
  },
}