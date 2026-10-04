import {
  EmergencyOperationsPanel,
} from '@/components/emergency-operations-panel'

import {
  requireRole,
} from '@/lib/auth'

export const dynamic =
  'force-dynamic'

export default async function AdminEmergenciesPage() {
  await requireRole([
    'admin',
    'super_admin',
  ])

  return (
    <div className="page-wrap max-w-7xl">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">
            Safety operations
          </span>

          <h1 className="page-title">
            Emergency Alerts
          </h1>

          <p className="page-lead">
            Monitor resident
            emergency requests,
            coordinate response
            and retain a complete
            incident record.
          </p>
        </div>
      </div>

      <EmergencyOperationsPanel />
    </div>
  )
}

export const metadata = {
  title:
    'Emergency Alerts | Zadant',

  description:
    'Manage estate emergency incidents with Zadant.',

  robots: {
    index:
      false,

    follow:
      false,
  },
}