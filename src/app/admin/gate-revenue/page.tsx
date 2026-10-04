import {
  GateRevenueManager,
} from '@/components/gate-revenue-manager'

import {
  requireRole,
} from '@/lib/auth'

export const dynamic =
  'force-dynamic'

export default async function GateRevenuePage() {
  await requireRole([
    'admin',
    'super_admin',
  ])

  return (
    <div className="page-wrap max-w-7xl">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">
            Estate income
          </span>

          <h1 className="page-title">
            Gate Revenue
          </h1>

          <p className="page-lead">
            Configure external
            access charges,
            monitor payments and
            review revenue
            collected at the
            estate gate.
          </p>
        </div>
      </div>

      <GateRevenueManager />
    </div>
  )
}

export const metadata = {
  title:
    'Gate Revenue | Zadant',

  description:
    'Manage estate gate charges and revenue with Zadant.',

  robots: {
    index:
      false,

    follow:
      false,
  },
}