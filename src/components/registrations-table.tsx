'use client'

import { useState } from 'react'

type Request = {
  id: string
  surname: string
  first_name: string
  other_names: string | null
  phone: string
  email: string
  house_number: string
  house_type: string | null
  relationship: string
  status: string
  decline_reason: string | null
  created_at: string
  streets: { name: string } | null
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    const url = `${window.location.origin}/register`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={handleCopy} className="action secondary">
      {copied ? 'Copied!' : 'Copy registration link'}
    </button>
  )
}

function RequestRow({ req }: { req: Request }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<{ email: string } | null>(null)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  // Local status so the UI updates instantly without a server refetch —
  // a server refetch would move this request from "pending" into "reviewed"
  // (two separate lists), which unmounts and remounts this component and
  // wipes out the just-shown credentials before anyone can copy them.
  const [localStatus, setLocalStatus] = useState(req.status)

  const fullName = [req.first_name, req.other_names, req.surname].filter(Boolean).join(' ')

  async function approve() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/registrations/${req.id}/approve`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not approve')
      setCredentials(data)
      setLocalStatus('approved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function decline() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/registrations/${req.id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not decline')
      setLocalStatus('declined')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border-t p-4 text-sm">
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="font-semibold">{fullName}</p>
          <p className="text-gray-500">
            {req.house_number}
            {req.streets?.name ? `, ${req.streets.name}` : ''} · {req.house_type ?? '—'}
          </p>
          <p className="text-gray-500">
            {req.email} · {req.phone} ·{' '}
            {req.relationship === 'owner'
              ? 'Home Owner'
              : req.relationship === 'family_member'
              ? 'Family Member'
              : 'Tenant'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Submitted {new Date(req.created_at).toLocaleString()}
          </p>
        </div>
        <span className={`pill${localStatus === 'approved' ? ' good' : ''}`}>
          {localStatus}
        </span>
      </div>

      {localStatus === 'pending' && (
        <div className="mt-3">
          {!declining ? (
            <div className="flex gap-2">
              <button onClick={approve} disabled={loading} className="action">
                {loading ? 'Approving...' : 'Approve'}
              </button>
              <button
                onClick={() => setDeclining(true)}
                disabled={loading}
                className="action danger"
              >
                Decline
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                placeholder="Optional reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
                style={{ minWidth: '14rem' }}
              />
              <button onClick={decline} disabled={loading} className="action danger">
                {loading ? 'Declining...' : 'Confirm decline'}
              </button>
              <button
                type="button"
                onClick={() => setDeclining(false)}
                className="action secondary"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {localStatus === 'declined' && (req.decline_reason || reason) && (
        <p className="text-xs mt-2" style={{ color: '#a63e30' }}>
          Reason: {req.decline_reason || reason}
        </p>
      )}

      {credentials && (
        <div
          className="text-sm mt-3"
          style={{
            background: '#e7f5e9',
            border: '1px solid #bfe0c9',
            borderRadius: '.6rem',
            padding: '.85rem',
          }}
        >
          <p className="font-semibold mb-1" style={{ color: '#276d4b' }}>
            Approved — an invite email was sent to {fullName}:
          </p>
          <p>
            Email: <span className="font-mono">{credentials.email}</span>
          </p>
          <p className="text-xs mt-2" style={{ color: '#276d4b' }}>
            They&apos;ll set their own password by following the link in that email —
            nothing to relay by hand.
          </p>
        </div>
      )}

      {error && (
        <p className="text-xs mt-2" style={{ color: '#a63e30' }}>
          {error}
        </p>
      )}
    </div>
  )
}

export function RegistrationsTable({ requests }: { requests: Request[] }) {
  const pending = requests.filter((r) => r.status === 'pending')
  const reviewed = requests.filter((r) => r.status !== 'pending')

  return (
    <div>
      <div className="mb-6">
        <CopyLinkButton />
      </div>

      <div className="panel" style={{ marginBottom: '2rem' }}>
        <div className="panel-head">
          <h2>Pending review ({pending.length})</h2>
        </div>
        {pending.length > 0 ? (
          pending.map((r) => <RequestRow key={r.id} req={r} />)
        ) : (
          <p className="empty">No pending registrations right now.</p>
        )}
      </div>

      {reviewed.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h2>Previously reviewed</h2>
          </div>
          {reviewed.map((r) => (
            <RequestRow key={r.id} req={r} />
          ))}
        </div>
      )}
    </div>
  )
}
