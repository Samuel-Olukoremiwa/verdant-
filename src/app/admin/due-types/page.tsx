import {
  createClient,
} from '@/lib/supabase/server'
import Link from 'next/link'

export default async function DueTypesPage() {
  const supabase =
    await createClient()

  const {
    data:
      dueTypes,
  } =
    await supabase
      .from(
        'due_types'
      )
      .select(`
        id,
        name,
        amount,
        frequency,
        billing_scope,
        created_at
      `)
      .order(
        'created_at',
        {
          ascending:
            false,
        }
      )

  return (
    <div className="page-wrap max-w-5xl">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">
            Dues & billing
          </span>

          <h1 className="page-title">
            Due types
          </h1>

          <p className="page-lead">
            Configure household
            charges and
            resident-specific
            charges.
          </p>
        </div>

        <Link
          href="/admin/due-types/new"
          className="action"
        >
          + Add Due Type
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow border overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-100 text-sm text-gray-600">
            <tr>
              <th className="p-3">
                Name
              </th>

              <th className="p-3">
                Billing scope
              </th>

              <th className="p-3">
                Amount
              </th>

              <th className="p-3">
                Frequency
              </th>
            </tr>
          </thead>

          <tbody>
            {dueTypes &&
            dueTypes.length >
              0 ? (
              dueTypes.map(
                (dueType) => (
                  <tr
                    key={
                      dueType.id
                    }
                    className="border-t text-sm"
                  >
                    <td className="p-3 font-medium">
                      {
                        dueType.name
                      }
                    </td>

                    <td className="p-3">
                      <span className="pill">
                        {dueType.billing_scope ===
                        'resident'
                          ? 'Individual Resident'
                          : 'Household / Property'}
                      </span>
                    </td>

                    <td className="p-3">
                      ₦
                      {Number(
                        dueType.amount
                      ).toLocaleString(
                        'en-NG'
                      )}
                    </td>

                    <td className="p-3 capitalize">
                      {
                        dueType.frequency
                      }
                    </td>
                  </tr>
                )
              )
            ) : (
              <tr>
                <td
                  colSpan={4}
                  className="p-6 text-center text-gray-500"
                >
                  No due types
                  yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export const metadata = {
  title:
    'Admin Due Types',

  description:
    'Manage estate billing types with Verdant.',

  robots: {
    index: false,
    follow: false,
  },
}