'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ToggleActiveButton({
  residentId,
  isActive,
}: {
  residentId: string
  isActive: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleToggle() {
    const confirmed = window.confirm(
      isActive
        ? 'Mark this resident as inactive? Their gate pass will stop working AND their portal login will be locked immediately — use this when someone has moved out.'
        : 'Reactivate this resident? Their gate pass and portal login will both work again.'
    )
    if (!confirmed) return

    setLoading(true)
    try {
      const res = await fetch(`/api/admin/residents/${residentId}/toggle-active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not update status')
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button onClick={handleToggle} disabled={loading} className="action secondary">
      {loading ? 'Updating...' : isActive ? 'Mark inactive' : 'Reactivate'}
    </button>
  )
}
