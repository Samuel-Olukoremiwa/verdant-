import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { readAll } from '@/lib/read-all'
import { ResidentsTable } from '@/components/residents-table'

export default async function ResidentsPage({ searchParams }: { searchParams: Promise<{ dues?: string }> }) {
  const initialHasDues = (await searchParams).dues === 'yes'
  const supabase = await createClient()

  const rawResidents = await readAll((from,to) => supabase
    .from('residents')
    .select(`
      id,
      house_id,
      full_name,
      phone,
      email,
      relationship,
      is_active,
      houses:houses!residents_house_id_fkey ( address, house_type, street_id, streets ( name ) )
    `)
    .order('id').range(from,to))

  const residents = (rawResidents ?? []) as unknown as {
    id: string
    house_id: string | null
    full_name: string
    phone: string | null
    relationship: string
    is_active: boolean
    houses: {
      address: string
      house_type: string | null
      street_id: string | null
      streets: { name: string } | null
    } | null
  }[]

  const { data: streets } = await supabase
    .from('streets')
    .select('id, name')
    .order('name', { ascending: true })

  const bills = await readAll((from,to) => supabase.from('invoices').select('id,house_id,amount,amount_paid').order('id').range(from,to))
  const balances = new Map<string, number>()
  for (const bill of bills) balances.set(bill.house_id, (balances.get(bill.house_id) ?? 0) + Math.max(0, Number(bill.amount) - Number(bill.amount_paid ?? 0)))

  return (
    <div className="page-wrap">
      <div className="dashboard-header">
        <div><span className="eyebrow">Estate directory</span><h1 className="page-title">Residents</h1><p className="page-lead">Every household, one accurate record.</p></div>
        <Link
          href="/admin/residents/new"
          className="action"
        >
          + Add Resident
        </Link>
      </div>

      <ResidentsTable key={String(initialHasDues)} residents={residents.map(r => ({ ...r, outstanding: balances.get(r.house_id ?? '') ?? 0 }))} streets={streets ?? []} initialHasDues={initialHasDues} />
    </div>
  )
}

export const metadata = {title: 'Admin Residents', description: 'Manage your estate account and workspace with Verdant.', robots: {index: false, follow: false}}
