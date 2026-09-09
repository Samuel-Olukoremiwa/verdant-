import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function ResidentsPage() {
  const supabase = await createClient()

  const { data: residents, error } = await supabase
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

      <div className="bg-white rounded-xl shadow overflow-hidden border">
        <table className="w-full text-left">
          <thead className="bg-gray-100 text-sm text-gray-600">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">House</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Relationship</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {residents && residents.length > 0 ? (
              residents.map((r: { id: string; full_name: string; phone: string | null; relationship: string; is_active: boolean; houses: { address: string; house_type: string | null }[] }) => (
                <tr key={r.id} className="border-t text-sm">
                  <td className="p-3 font-medium">{r.full_name}</td>
                  <td className="p-3">{r.houses?.[0]?.address ?? '—'}</td>
                  <td className="p-3">{r.phone ?? '—'}</td>
                  <td className="p-3 capitalize">{r.relationship}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        r.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {r.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/admin/residents/${r.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500">
                  No residents yet. Click &quot;Add Resident&quot; to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
