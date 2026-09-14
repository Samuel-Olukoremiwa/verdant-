import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function StreetsPage() {
  const supabase = await createClient()
  const { data: streets } = await supabase
    .from('streets')
    .select('id, name')
    .order('name', { ascending: true })

  return (
    <div className="page-wrap max-w-5xl">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">Dues &amp; billing</span>
          <h1 className="page-title">Streets</h1>
          <p className="page-lead">
            The list of valid street names residents&apos; houses can be assigned to.
          </p>
        </div>
        <Link href="/admin/streets/new" className="action">
          + Add Street
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow border overflow-hidden">
        <table className="w-full text-left">
          <tbody>
            {streets && streets.length > 0 ? (
              streets.map((s) => (
                <tr key={s.id} className="border-t text-sm">
                  <td className="p-3 font-medium">{s.name}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="p-6 text-center text-gray-500">
                  No streets added yet. Click &quot;Add Street&quot; to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
