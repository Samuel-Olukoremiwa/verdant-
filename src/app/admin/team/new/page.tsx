'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewStaffPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', full_name: '', role: 'gate_staff' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<{ email: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/team/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not create staff member')
      setCredentials(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-wrap max-w-xl">
      <span className="eyebrow">Estate operations</span>
      <h1 className="page-title">Add Staff Member</h1>
      <p className="page-lead mb-8">
        For someone who isn&apos;t already a resident — e.g. a hired gate guard.
      </p>

      {credentials ? (
        <div className="form-card">
          <p className="font-semibold mb-2" style={{ color: '#276d4b' }}>
            Invite sent
          </p>
          <p>
            An email was sent to <span className="font-mono">{credentials.email}</span> with
            a link for them to set up their own password.
          </p>
          <p className="text-xs mt-2 text-gray-500">
            Nothing to relay by hand — they choose their own password.
          </p>
          <button
            onClick={() => router.push('/admin/team')}
            className="action secondary mt-4"
          >
            Back to Team
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="form-card space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1">Full Name *</label>
            <input
              required
              className="w-full border rounded-lg px-3 py-2"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email *</label>
            <input
              required
              type="email"
              className="w-full border rounded-lg px-3 py-2"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Role *</label>
            <select
              className="w-full border rounded-lg px-3 py-2"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="gate_staff">Gate Staff</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="action disabled:opacity-50">
            {loading ? 'Creating...' : 'Create Staff Account'}
          </button>
        </form>
      )}
    </div>
  )
}
