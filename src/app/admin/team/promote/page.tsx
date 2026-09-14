'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Resident = { id: string; full_name: string; email: string | null; auth_user_id: string | null }

export default function PromoteResidentPage() {
  const router = useRouter()
  const supabase = createClient()
  const [residents, setResidents] = useState<Resident[]>([])
  const [residentId, setResidentId] = useState('')
  const [role, setRole] = useState('admin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('residents')
      .select('id, full_name, email, auth_user_id')
      .not('auth_user_id', 'is', null)
      .order('full_name', { ascending: true })
      .then(({ data }) => setResidents(data ?? []))
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/team/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resident_id: residentId, role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not promote')
      router.push('/admin/team')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-wrap max-w-xl">
      <span className="eyebrow">Estate operations</span>
      <h1 className="page-title">Promote a Resident</h1>
      <p className="page-lead mb-8">
        Grant estate staff access to someone who already has a resident portal login.
      </p>

      <form onSubmit={handleSubmit} className="form-card space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Resident *</label>
          <select
            required
            className="w-full border rounded-lg px-3 py-2"
            value={residentId}
            onChange={(e) => setResidentId(e.target.value)}
          >
            <option value="">Select a resident</option>
            {residents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name} {r.email ? `(${r.email})` : ''}
              </option>
            ))}
          </select>
          {residents.length === 0 && (
            <p className="text-xs text-gray-500 mt-1">
              No residents with a portal login yet. Create one from their profile first.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Role *</label>
          <select
            className="w-full border rounded-lg px-3 py-2"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
            <option value="gate_staff">Gate Staff</option>
          </select>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button type="submit" disabled={loading} className="action disabled:opacity-50">
          {loading ? 'Promoting...' : 'Promote'}
        </button>
      </form>
    </div>
  )
}
