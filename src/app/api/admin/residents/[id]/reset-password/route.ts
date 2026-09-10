import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Called by an admin to regenerate a resident's password when they've lost
// access or the original temp password was never captured.
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
  if (!resident.auth_user_id) {
    return NextResponse.json(
      { error: 'This resident has no login yet — use Create portal login instead' },
      { status: 400 }
    )
  }

  const tempPassword = crypto
    .randomBytes(9)
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 12)

  const { error: updateError } = await service.auth.admin.updateUserById(
    resident.auth_user_id,
    { password: tempPassword }
  )

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ email: resident.email, password: tempPassword })
}
