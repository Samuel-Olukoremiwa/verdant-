import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

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
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()
  if (!caller || caller.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only super admins can do this' }, { status: 403 })
  }
  if (caller.id === id) {
    return NextResponse.json(
      { error: 'You cannot remove your own admin access. Have another super admin do it.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()

  const { data: target } = await service.from('admins').select('role').eq('id', id).single()
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (target.role === 'super_admin') {
    const { count } = await service
      .from('admins')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin')
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Cannot remove the only remaining super admin' },
        { status: 400 }
      )
    }
  }

  const { error } = await service.from('admins').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
