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

  const { email, full_name, role } = await req.json()
  if (!email || !full_name || !['super_admin', 'admin', 'gate_staff'].includes(role)) {
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(
    email,
    { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password` }
  )
  if (inviteError || !invited.user) {
    return NextResponse.json(
      { error: inviteError?.message ?? 'Could not send invite' },
      { status: 500 }
    )
  }

  const { error } = await service.from('admins').insert({
    auth_user_id: invited.user.id,
    full_name,
    role,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ email })
}

