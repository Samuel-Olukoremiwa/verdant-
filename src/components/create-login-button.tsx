'use client'

import { useState } from 'react'

export function CreateLoginButton({
  residentId,
  mode = 'create',
}: {
  residentId: string
  mode?: 'create' | 'reset'
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null)

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
      // Deliberately not calling router.refresh() here — doing so would swap
      // this section to the "already has login" branch on the parent page,
      // which unmounts this component and would wipe this confirmation
      // message before anyone has a chance to read it. The parent will pick
      // up the real state next time the page is actually reloaded/navigated.
      setInvitedEmail(data.email)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (invitedEmail) {
    return (
      <div className="text-sm bg-green-50 border border-green-200 rounded-lg p-3 mt-2">
        <p className="font-semibold text-green-800 mb-1">
          {mode === 'reset' ? 'Password reset email sent' : 'Invite sent'}
        </p>
        <p>
          An email was sent to <span className="font-mono">{invitedEmail}</span> with a
          link to {mode === 'reset' ? 'set a new password' : 'set up their portal password'}.
        </p>
        <p className="text-xs text-green-700 mt-2">
          No password to share — they choose their own by following the link.
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
            ? 'Sending...'
            : 'Sending invite...'
          : mode === 'reset'
          ? 'Reset password'
          : 'Create portal login'}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
