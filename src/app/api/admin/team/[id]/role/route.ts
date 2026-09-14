import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const VALID_ROLES = ['super_admin', 'admin', 'gate_staff']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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

  const { role } = await req.json()
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: target } = await service.from('admins').select('role').eq('id', id).single()
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (target.role === 'super_admin' && role !== 'super_admin') {
    const { count } = await service
      .from('admins')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin')
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Cannot demote the only remaining super admin' },
        { status: 400 }
      )
    }
  }

  const { error } = await service.from('admins').update({ role }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
