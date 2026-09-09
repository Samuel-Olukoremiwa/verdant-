import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function DueTypesPage() {
  const supabase = await createClient()
  const { data: dueTypes } = await supabase
    .from('due_types')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="page-wrap max-w-5xl">
      <div className="dashboard-header">
        <div><span className="eyebrow">Dues & billing</span><h1 className="page-title">Due types</h1><p className="page-lead">The predictable charges that keep the estate moving.</p></div>
        <Link
          href="/admin/due-types/new"
          className="action"
        >
          + Add Due Type
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow border overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-100 text-sm text-gray-600">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Frequency</th>
            </tr>
          </thead>
          <tbody>
            {dueTypes && dueTypes.length > 0 ? (
              dueTypes.map((d) => (
                <tr key={d.id} className="border-t text-sm">
                  <td className="p-3 font-medium">{d.name}</td>
                  <td className="p-3">₦{Number(d.amount).toLocaleString()}</td>
                  <td className="p-3 capitalize">{d.frequency}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="p-6 text-center text-gray-500">
                  No due types yet, e.g. &quot;Monthly Service Charge&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
