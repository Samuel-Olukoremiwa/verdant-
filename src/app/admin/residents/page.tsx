import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ResidentsTable } from '@/components/residents-table'

export default async function ResidentsPage() {
  const supabase = await createClient()

  const { data: rawResidents, error } = await supabase
    .from('residents')
    .select(`
      id,
      full_name,
      phone,
      email,
      relationship,
      is_active,
      houses ( address, house_type )
    `)
    .order('created_at', { ascending: false })

  const residents = (rawResidents ?? []) as unknown as {
    id: string
    full_name: string
    phone: string | null
    relationship: string
    is_active: boolean
    houses: { address: string; house_type: string | null } | null
  }[]

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

      {error && (
        <p className="text-red-600 mb-4">Error loading residents: {error.message}</p>
      )}

      <ResidentsTable residents={residents} />
    </div>
  )
}
