'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
export function VisitorGate() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ visitor: string; host: string; address: string; message: string } | null>(null)
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setResult(null)
    try {
      const response = await fetch('/api/gate/visitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim() }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not verify visitor')
      setResult(data); setCode(''); router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not verify visitor') }
    finally { setBusy(false) }
  }
  return <section className="panel p-5 mb-5"><h2 className="text-xl mb-2">Visitor entry</h2><p className="mb-3 text-sm">Verify the invitation and record entry. A valid code is used immediately.</p><form onSubmit={submit} className="flex flex-wrap gap-3"><input aria-label="Visitor entry code" required maxLength={10} pattern="[A-Fa-f0-9]{10}" autoComplete="off" className="border rounded-lg p-3 uppercase font-mono" placeholder="10-character code" value={code} onChange={e => { setCode(e.target.value); setResult(null); setError('') }} /><button className="action" disabled={busy}>{busy ? 'Checking…' : 'Verify & record entry'}</button></form>{error && <p role="alert" className="mt-3 text-red-700">{error}</p>}{result && <div role="status" className="mt-4 rounded-lg bg-green-50 p-4"><strong>Entry approved: {result.visitor}</strong><p>Host: {result.host}</p><p>Address: {result.address}</p><p>{result.message}</p></div>}</section>
}
