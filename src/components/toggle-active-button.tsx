'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function ToggleActiveButton({
  residentId,
  isActive,
}: {
  residentId: string
  isActive: boolean
}) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleToggle() {
    const confirmed = window.confirm(
      isActive
        ? 'Mark this resident as inactive? Their gate pass will stop working.'
        : 'Reactivate this resident? Their gate pass will work again.'
    )
    if (!confirmed) return

    setLoading(true)
    const { error } = await supabase
      .from('residents')
      .update({ is_active: !isActive })
      .eq('id', residentId)
    setLoading(false)

    if (error) {
      alert(`Could not update status: ${error.message}`)
      return
    }
    router.refresh()
  }

  return (
    <button onClick={handleToggle} disabled={loading} className="action secondary">
      {loading ? 'Updating...' : isActive ? 'Mark inactive' : 'Reactivate'}
    </button>
  )
}
