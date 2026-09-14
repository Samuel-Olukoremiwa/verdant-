import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Called by an admin to help a resident regain access, whether they lost
// their password or the original invite was never actioned. Sends the same
// recovery email the self-service "Forgot password" page uses — no
// temporary password is generated or needs relaying by hand.
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
    .select('role')
    .eq('auth_user_id', user.id)
    .single()

  if (!admin || !['admin', 'super_admin'].includes(admin.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: resident } = await service
    .from('residents')
    .select('id, email, auth_user_id')
    .eq('id', id)
    .single()

  if (!resident) {
    return NextResponse.json({ error: 'Resident not found' }, { status: 404 })
  }
  if (!resident.auth_user_id || !resident.email) {
    return NextResponse.json(
      { error: 'This resident has no login yet — use Create portal login instead' },
      { status: 400 }
    )
  }

  const { error } = await service.auth.resetPasswordForEmail(resident.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ email: resident.email })
}

