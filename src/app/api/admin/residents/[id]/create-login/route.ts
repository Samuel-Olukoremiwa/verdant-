import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Called by an admin from a resident's profile to create their portal login.
// Generates a temporary password rather than emailing an invite link, since
// that doesn't depend on Supabase's email sending being configured.
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
    .select('id, email, full_name, auth_user_id')
    .eq('id', id)
    .single()

  if (!resident) {
    return NextResponse.json({ error: 'Resident not found' }, { status: 404 })
  }
  if (resident.auth_user_id) {
    return NextResponse.json(
      { error: 'This resident already has a login' },
      { status: 400 }
    )
  }
  if (!resident.email) {
    return NextResponse.json(
      { error: 'This resident has no email on file. Add one first via Edit.' },
      { status: 400 }
    )
  }

  const tempPassword = crypto
    .randomBytes(9)
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 12)

  const { data: created, error: createError } = await service.auth.admin.createUser(
    {
      email: resident.email,
      password: tempPassword,
      email_confirm: true,
    }
  )

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? 'Could not create login' },
      { status: 500 }
    )
  }

  const { error: linkError } = await service
    .from('residents')
    .update({ auth_user_id: created.user.id })
    .eq('id', id)

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }

  return NextResponse.json({ email: resident.email, password: tempPassword })
}
