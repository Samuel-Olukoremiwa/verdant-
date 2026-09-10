'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function CreateLoginButton({
  residentId,
  mode = 'create',
}: {
  residentId: string
  mode?: 'create' | 'reset'
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(
    null
  )

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const endpoint =
        mode === 'reset'
          ? `/api/admin/residents/${residentId}/reset-password`
          : `/api/admin/residents/${residentId}/create-login`
      const res = await fetch(endpoint, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setCredentials(data)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (credentials) {
    return (
      <div className="text-sm bg-green-50 border border-green-200 rounded-lg p-3 mt-2">
        <p className="font-semibold text-green-800 mb-1">
          {mode === 'reset' ? 'Password reset — share these now:' : 'Login created — share these with the resident now:'}
        </p>
        <p>
          Email: <span className="font-mono">{credentials.email}</span>
        </p>
        <p>
          {mode === 'reset' ? 'New' : 'Temporary'} password:{' '}
          <span className="font-mono">{credentials.password}</span>
        </p>
        <p className="text-xs text-green-700 mt-2">
          This password won&apos;t be shown again.
        </p>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="action secondary"
        style={{ fontSize: '.8rem' }}
      >
        {loading
          ? mode === 'reset'
            ? 'Resetting...'
            : 'Creating...'
          : mode === 'reset'
          ? 'Reset password'
          : 'Create portal login'}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
