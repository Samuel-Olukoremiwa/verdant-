import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
export async function POST(request: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.code !== 'string' || !/^[a-f\d]{10}$/i.test(body.code.trim())) return NextResponse.json({ error: 'Enter the 10-character visitor code' }, { status: 400 })
  const { data, error } = await db.rpc('redeem_visitor_pass', { p_code: body.code })
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json(data)
}
