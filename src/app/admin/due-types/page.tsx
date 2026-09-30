import {
  createClient,
} from '@/lib/supabase/server'

import Link from 'next/link'

function statusPill(
  enabled: boolean,
  enabledLabel: string,
  disabledLabel: string
) {
  return (
    <span
      className={
        enabled
          ? 'pill'
          : 'pill opacity-60'
      }
    >
      {enabled
        ? enabledLabel
        : disabledLabel}
    </span>
  )
}

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
        active,
        auto_generate,
        allow_advance_payment,
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
    <div className="page-wrap max-w-7xl">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">
            Dues & billing
          </span>

          <h1 className="page-title">
            Due types
          </h1>

          <p className="page-lead">
            Configure estate
            charges, automatic
            monthly billing and
            advance payment
            availability.
          </p>
        </div>

        <Link
          href="/admin/due-types/new"
          className="action"
        >
          + Add Due Type
        </Link>
      </div>

      <div className="mb-5 rounded-xl border bg-white p-4 text-sm text-gray-600">
        <strong className="text-gray-900">
          Billing capabilities
        </strong>

        <p className="mt-1">
          Automatic generation
          and advance payment are
          currently supported for
          monthly household
          charges only. Turning a
          due type inactive pauses
          those behaviours without
          deleting historical
          invoices or payments.
        </p>
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

              <th className="p-3">
                Status
              </th>

              <th className="p-3">
                Automatic billing
              </th>

              <th className="p-3">
                Advance payment
              </th>

              <th className="p-3">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {dueTypes &&
            dueTypes.length >
              0 ? (
              dueTypes.map(
                (
                  dueType
                ) => {
                  const supportsMonthlyHouseholdCapabilities =
                    dueType.billing_scope ===
                      'house' &&
                    dueType.frequency ===
                      'monthly'

                  return (
                    <tr
                      key={
                        dueType.id
                      }
                      className="border-t text-sm align-top"
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

                      <td className="p-3 whitespace-nowrap">
                        ₦
                        {Number(
                          dueType.amount
                        ).toLocaleString(
                          'en-NG',
                          {
                            minimumFractionDigits:
                              0,

                            maximumFractionDigits:
                              2,
                          }
                        )}
                      </td>

                      <td className="p-3 capitalize">
                        {
                          dueType.frequency
                        }
                      </td>

                      <td className="p-3">
                        {statusPill(
                          dueType.active,
                          'Active',
                          'Inactive'
                        )}
                      </td>

                      <td className="p-3">
                        {supportsMonthlyHouseholdCapabilities
                          ? statusPill(
                              dueType.auto_generate,
                              'Enabled',
                              'Manual'
                            )
                          : (
                            <span className="text-gray-400">
                              Not available
                            </span>
                          )}
                      </td>

                      <td className="p-3">
                        {supportsMonthlyHouseholdCapabilities
                          ? statusPill(
                              dueType.allow_advance_payment,
                              'Enabled',
                              'Disabled'
                            )
                          : (
                            <span className="text-gray-400">
                              Not available
                            </span>
                          )}
                      </td>

                      <td className="p-3">
                        <Link
                          href={
                            `/admin/due-types/${dueType.id}/edit`
                          }
                          className="action secondary"
                          style={{
                            fontSize:
                              '.78rem',

                            padding:
                              '.45rem .75rem',
                          }}
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  )
                }
              )
            ) : (
              <tr>
                <td
                  colSpan={8}
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
    'Manage estate billing types with Zadant.',

  robots: {
    index:
      false,

    follow:
      false,
  },
}