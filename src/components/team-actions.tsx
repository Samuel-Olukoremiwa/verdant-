'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const ROLES = ['super_admin', 'admin', 'gate_staff'] as const

export function TeamActions({
  id,
  currentRole,
  isSelf,
  isOnlySuperAdmin,
}: {
  id: string
  currentRole: string
  isSelf: boolean
  isOnlySuperAdmin: boolean
}) {
  const router = useRouter()
  const [role, setRole] = useState(currentRole)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveRole() {
    if (role === currentRole) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/team/${id}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not update role')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setRole(currentRole)
    } finally {
      setLoading(false)
    }
  }

  async function remove() {
    if (
      !window.confirm(
        "Remove this person's admin/staff access? This does not delete their resident record, if they have one."
      )
    ) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/team/${id}/remove`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not remove')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const locked = isOnlySuperAdmin && currentRole === 'super_admin'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.4rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          disabled={loading || (isOnlySuperAdmin && isSelf)}
          className="border rounded-lg px-2 py-1.5 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replace('_', ' ')}
            </option>
          ))}
        </select>
        {role !== currentRole && (
          <button onClick={saveRole} disabled={loading} className="action secondary" style={{ padding: '.4rem .8rem', fontSize: '.78rem' }}>
            Save
          </button>
        )}
        {!isSelf && (
          <button
            onClick={remove}
            disabled={loading || locked}
            className="action danger"
            style={{ padding: '.4rem .8rem', fontSize: '.78rem' }}
            title={locked ? 'Cannot remove the only super admin' : undefined}
          >
            Remove
          </button>
        )}
      </div>
      {locked && <span className="pill">Only super admin — protected</span>}
      {error && (
        <span className="text-xs" style={{ color: '#a63e30' }}>
          {error}
        </span>
      )}
    </div>
  )
}
