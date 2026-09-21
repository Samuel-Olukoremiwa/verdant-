'use client'
import { useEffect, useState } from 'react'
import {useConfirmDialog} from './confirm-dialog'
import { useRouter } from 'next/navigation'

import { visitorMessage, visitorTime as time, type VisitorPass } from '@/lib/visitor-message'
export type { VisitorPass } from '@/lib/visitor-message'
export function VisitorPasses({ passes, asOf }: { passes: VisitorPass[]; asOf: string }) {
  const [now, setNow] = useState(() => Date.parse(asOf))
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const router = useRouter()
  const {confirm,confirmation}=useConfirmDialog()
  const [phone, setPhone] = useState('')
  const [smsMessage, setSmsMessage] = useState('')
  const [name, setName] = useState('')
  const [expiry, setExpiry] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<VisitorPass | null>(null)
  const [copied, setCopied] = useState('')
  async function create(event: React.FormEvent) {
    event.preventDefault(); setSmsMessage(''); setError(''); setBusy('create'); setCopied('')
    try {
      // Input is explicitly estate local time, independent of the device timezone.
      const expiresAt = new Date(expiry + ':00+01:00').toISOString()
      const response = await fetch('/api/visitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorName: name, expiresAt, visitorPhone: phone }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not create pass')
      setCreated(result.pass); setSmsMessage(result.sms?.message ?? ''); setName(''); setPhone(''); router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create pass') }
    finally { setBusy(null) }
  }
  async function cancel(id: string) {
    if(!await confirm('Cancel this visitor pass? The code will no longer admit a visitor.'))return
    setBusy(id); setError('')
    try {
      const response = await fetch('/api/visitors', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not cancel pass')
      if (created?.id === id) setCreated(null)
      router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not cancel pass') }
    finally { setBusy(null) }
  }
  async function copy(pass: VisitorPass) {
    try { await navigator.clipboard.writeText(visitorMessage(pass)); setCopied(pass.id) }
    catch { setCreated(pass); setError('Copy is unavailable. Select and copy the message below.') }
  }
  return <>{confirmation}
    <form onSubmit={create} className="panel p-5 mb-5">
      <h2 className="text-xl mb-3">Invite a visitor</h2>
      <div className="flex flex-wrap gap-4 items-end">
        <label>Visitor name (optional)<input className="block border rounded-lg p-2" value={name} onChange={e => setName(e.target.value)} maxLength={100} /></label>
<label>Visitor mobile (optional)<input type="tel" autoComplete="off" maxLength={24} placeholder="08012345678" className="block border rounded-lg p-2" value={phone} onChange={e => setPhone(e.target.value)} /></label>
        <label>Expires at (WAT)<input required type="datetime-local" className="block border rounded-lg p-2" value={expiry} onChange={e => setExpiry(e.target.value)} /></label>
        <button disabled={!!busy} className="action">{busy === 'create' ? 'Generating…' : 'Generate entry code'}</button>
      </div>
      <p className="text-sm mt-3">Valid immediately until your chosen expiry. Each code admits one visitor once. Add a mobile number to send the invitation by SMS, or leave it blank to copy and share yourself.</p>
    </form>
    {error && <p role="alert" className="text-red-700 mb-4">{error}</p>}
    {smsMessage && <p role="status" className="mb-4">{smsMessage} Your pass is still available to copy below.</p>}
    {created && <section className="panel p-5 mb-5"><h2 className="text-xl mb-3">Message to share</h2><textarea aria-label="Visitor invitation message" readOnly rows={7} className="w-full border rounded-lg p-3" value={visitorMessage(created)} /><button className="action secondary mt-3" onClick={() => copy(created)}>{copied === created.id ? 'Copied' : 'Copy message'}</button></section>}
    <section className="panel p-5"><h2 className="text-xl mb-3">Recent visitor passes</h2>
      {passes.length ? passes.map(pass => {
        const status = pass.cancelled_at ? 'Cancelled' : pass.redeemed_at ? 'Used' : new Date(pass.expires_at).getTime() <= now ? 'Expired' : 'Active'
        return <article key={pass.id} className="border-t py-4"><div className="flex flex-wrap justify-between gap-3"><div><strong>{pass.visitor_name} · {pass.code}</strong><p className="text-sm">{pass.address}</p><p className="text-sm">Expires {time(pass.expires_at)}</p>{pass.redeemed_at && <p className="text-sm">Entry recorded {time(pass.redeemed_at)}</p>}</div><span className="pill">{status}</span></div>{status === 'Active' && <div className="flex gap-3 mt-3"><button className="action secondary" onClick={() => copy(pass)}>{copied === pass.id ? 'Copied' : 'Copy message'}</button><button disabled={!!busy} className="action secondary" onClick={() => cancel(pass.id)}>{busy === pass.id ? 'Cancelling…' : 'Cancel pass'}</button></div>}</article>
      }) : <p>No visitor passes yet.</p>}
    </section>
  </>
}
