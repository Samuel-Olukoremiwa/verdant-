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
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { data: admin } = await supabase
    .from('admins')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!admin || !['admin', 'super_admin'].includes(admin.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { reason } = await req.json().catch(() => ({ reason: null }))

  const service = createServiceClient()
  const { error } = await service
    .from('registration_requests')
    .update({
      status: 'declined',
      decline_reason: reason,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
