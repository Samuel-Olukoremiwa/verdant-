import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { readAll } from '@/lib/read-all'
import { InvoicesTable } from '@/components/invoices-table'
import { SendRemindersButton } from '@/components/send-reminders-button'

export default async function InvoicesPage() {
  const supabase = await createClient()

  const rawInvoices = await readAll((from, to) =>
    supabase
      .from('invoices')
      .select(`
        id,
        house_id,
        resident_id,
        period_label,
        amount,
        amount_paid,
        status,
        due_date,
        houses ( address ),
        residents ( full_name ),
        due_types ( name, billing_scope )
      `)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
  )

  const invoices = (rawInvoices ?? []) as unknown as {
    id: string
    house_id: string | null
    resident_id: string | null
    period_label: string | null
    amount: number
    amount_paid: number | null
    status: string
    due_date: string | null
    houses: { address: string } | null
    residents: { full_name: string } | null
    due_types: { name: string; billing_scope: 'house' | 'resident' } | null
  }[]

  return (
    <div className="page-wrap">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">Dues &amp; billing</span>
          <h1 className="page-title">All Invoices</h1>
          <p className="page-lead">
            Household and personal charges, clearly separated in one place.
          </p>
        </div>
        <div className="header-actions">
          <Link href="/admin/due-types" className="action secondary">
            Due types
          </Link>
          <Link href="/admin/invoices/generate" className="action">
            + Generate dues
          </Link>
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <SendRemindersButton />
      </div>

      <InvoicesTable invoices={invoices} />
    </div>
  )
}

export const metadata = {
  title: 'Admin Invoices',
  description: 'Manage your estate account and workspace with Verdant.',
  robots: { index: false, follow: false },
}
