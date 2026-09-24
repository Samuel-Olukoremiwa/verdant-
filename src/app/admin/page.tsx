import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import Link from 'next/link'
import { BillingSummary } from '@/components/billing-summary'
import { BalancesPanel } from '@/components/balances-panel'
import { readAll } from '@/lib/read-all'
import {
  estateDate,
  summarize,
  houseBalances,
  type BillingInvoice,
  type Collection,
  type Expense,
} from '@/lib/dashboard'

type AccessLog = {
  id: string
  direction: string
  scanned_at: string
  residents: { full_name: string } | null
}

export default async function AdminDashboard() {
  const db = await createClient()
  const user = await getCurrentUser()
  const today = estateDate()

  let invoices: BillingInvoice[]
  let payments: Collection[]
  let expenses: Expense[]

  try {
    const result = await Promise.all([
      readAll((from, to) =>
        db
          .from('invoices')
          .select(
            'id,house_id,resident_id,amount,amount_paid,due_date,houses(address,street_id,streets(name)),due_types(name)'
          )
          .order('id')
          .range(from, to)
      ),
      readAll((from, to) =>
        db
          .from('payments')
          .select('id,amount,paid_at,invoices(due_types(name))')
          .eq('status', 'success')
          .order('id')
          .range(from, to)
      ),
      readAll((from, to) =>
        db
          .from('expenses')
          .select('id,amount,expense_date')
          .order('id')
          .range(from, to)
      ),
    ])

    invoices = result[0] as unknown as BillingInvoice[]
    payments = result[1] as unknown as Collection[]
    expenses = result[2] as Expense[]
  } catch {
    return (
      <div className="page-wrap">
        <h1 className="page-title">Overview</h1>
        <p role="alert">
          Financial totals could not be loaded. Please refresh and try again.
        </p>
      </div>
    )
  }

  const { data, error } = await db
    .from('access_logs')
    .select('id,direction,scanned_at,residents(full_name)')
    .gte('scanned_at', today + 'T00:00:00+01:00')
    .order('scanned_at', { ascending: false })
    .limit(5)

  const logs = (data ?? []) as unknown as AccessLog[]

  return (
    <div className="page-wrap">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">Operations dashboard</span>
          <h1 className="page-title">
            Hello, {user?.name?.split(' ')[0] ?? 'there'}.
          </h1>
          <p className="page-lead">
            The financial and gate activity snapshot for Sample estate.
          </p>
        </div>
        <div className="header-actions">
          <Link href="/admin/residents/new" className="action secondary">
            Add resident
          </Link>
          <Link href="/admin/invoices/generate" className="action">
            Generate dues →
          </Link>
        </div>
      </div>

      <BillingSummary
        monthLabel={new Date().toLocaleDateString('en-GB', {
          month: 'long',
          year: 'numeric',
          timeZone: 'Africa/Lagos',
        })}
        month={summarize(invoices, payments, expenses, today.slice(0, 7))}
        allTime={summarize(invoices, payments, expenses)}
      />

      <section className="dashboard-grid mt-5">
        <BalancesPanel houses={houseBalances(invoices)} />
        <article className="panel">
          <div className="panel-head">
            <h2>Today at the gate</h2>
            <Link href="/admin/access-logs">All activity →</Link>
          </div>
          <div className="panel-body">
            {error ? (
              <p role="alert">Gate activity could not be loaded.</p>
            ) : logs.length ? (
              logs.map((log) => (
                <div className="activity" key={log.id}>
                  <span className="activity-symbol">
                    {log.direction === 'exit' ? '↗' : '↘'}
                  </span>
                  <div>
                    <strong>{log.residents?.full_name ?? 'Unknown resident'}</strong>
                    <small>
                      {log.direction === 'exit' ? 'Exited' : 'Entered'} ·{' '}
                      {new Date(log.scanned_at).toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Africa/Lagos',
                      })}{' '}
                      WAT
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty">No resident scans today.</p>
            )}
          </div>
        </article>
      </section>
    </div>
  )
}

export const metadata = {
  title: 'Admin',
  description: 'Manage your estate account and workspace with Verdant.',
  robots: { index: false, follow: false },
}
