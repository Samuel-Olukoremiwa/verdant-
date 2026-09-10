'use client'

import { useState } from 'react'

export function SendRemindersButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    emailsSent: number
    skippedNoEmail: number
    invoicesChecked: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/reminders/send', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send reminders')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button onClick={handleClick} disabled={loading} className="action secondary">
        {loading ? 'Sending...' : 'Send due reminders'}
      </button>
      {result && (
        <p className="text-xs text-green-700 mt-2">
          Sent {result.emailsSent} reminder{result.emailsSent === 1 ? '' : 's'}
          {result.skippedNoEmail > 0
            ? ` (${result.skippedNoEmail} resident${result.skippedNoEmail === 1 ? '' : 's'} skipped — no email on file)`
            : ''}
          . Checked {result.invoicesChecked} due/overdue invoice
          {result.invoicesChecked === 1 ? '' : 's'}.
        </p>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}
