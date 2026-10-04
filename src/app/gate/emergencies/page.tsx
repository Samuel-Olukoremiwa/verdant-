import {
  EmergencyOperationsPanel,
} from '@/components/emergency-operations-panel'

import {
  requireRole,
} from '@/lib/auth'

export const dynamic =
  'force-dynamic'

export default async function GateEmergenciesPage() {
  await requireRole([
    'gate_staff',
    'admin',
    'super_admin',
  ])

  return (
    <div className="gate-wrap">
      <span className="eyebrow">
        Safety operations
      </span>

      <h1>
        Emergency Alerts
      </h1>

      <p className="page-lead">
        Respond to emergency
        requests raised by
        residents.
      </p>

      <EmergencyOperationsPanel />
    </div>
  )
}

export const metadata = {
  title:
    'Gate Emergency Alerts | Zadant',

  description:
    'Respond to estate emergency incidents.',

  robots: {
    index:
      false,

    follow:
      false,
  },
}