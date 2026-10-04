import {
  ResidentEmergencyPanel,
} from '@/components/resident-emergency-panel'

import {
  requireRole,
} from '@/lib/auth'

export const dynamic =
  'force-dynamic'

export default async function EmergencyPage() {
  await requireRole([
    'resident',
  ])

  return (
    <div className="portal-wrap">
      <ResidentEmergencyPanel />
    </div>
  )
}

export const metadata = {
  title:
    'Emergency | Zadant',

  description:
    'Request emergency assistance from estate operations.',

  robots: {
    index:
      false,

    follow:
      false,
  },
}