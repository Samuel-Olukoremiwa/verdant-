import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: caller } = await supabase
    .from('admins')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()
  if (!caller || caller.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only super admins can do this' }, { status: 403 })
  }

  const { resident_id, role } = await req.json()
  if (!['super_admin', 'admin', 'gate_staff'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: resident } = await service
    .from('residents')
    .select('auth_user_id, full_name')
    .eq('id', resident_id)
    .single()
  if (!resident || !resident.auth_user_id) {
    return NextResponse.json(
      { error: 'This resident has no portal login yet — create one first' },
      { status: 400 }
    )
  }

  const { data: existing } = await service
    .from('admins')
    .select('id')
    .eq('auth_user_id', resident.auth_user_id)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'This person already has staff access' }, { status: 400 })
  }

  const { error } = await service.from('admins').insert({
    auth_user_id: resident.auth_user_id,
    full_name: resident.full_name,
    role,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
