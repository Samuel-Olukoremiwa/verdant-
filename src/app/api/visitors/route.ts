import { dispatchSms } from '@/lib/sms-dispatch'
import { normalizeNigerianPhone } from '@/lib/sms'
import { visitorMessage, type VisitorPass } from '@/lib/visitor-message'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.expiresAt !== 'string' || !Number.isFinite(Date.parse(body.expiresAt)) || (body.visitorName != null && typeof body.visitorName !== 'string')) return NextResponse.json({ error: 'Enter a valid expiry time and visitor name' }, { status: 400 })
  if (body.visitorPhone && (typeof body.visitorPhone !== 'string' || !normalizeNigerianPhone(body.visitorPhone))) return NextResponse.json({ error: 'Enter a valid Nigerian visitor mobile number, or leave it blank.' }, { status: 400 })
  const { data, error } = await db.rpc('create_visitor_pass', { p_visitor_name: body.visitorName || 'Visitor', p_expires_at: body.expiresAt }).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const pass = data as VisitorPass
  const sms = body.visitorPhone ? await dispatchSms(`visitor:${pass.id}`, 'visitor', body.visitorPhone, visitorMessage(pass)) : null
  return NextResponse.json({ pass, sms }, { status: 201 })
}
export async function DELETE(request: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.id !== 'string' || !/^[a-f\d-]{36}$/i.test(body.id)) return NextResponse.json({ error: 'Choose a valid pass' }, { status: 400 })
  const { error } = await db.rpc('cancel_visitor_pass', { p_id: body.id })
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true })
}
