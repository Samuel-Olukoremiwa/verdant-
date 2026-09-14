import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Called by an admin from a resident's profile to create their portal login.
// Sends Supabase's built-in invite email — the resident sets their own
// password by following the link, so no temporary password is ever
// generated, shown, or needs relaying by hand.
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

  const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(
    resident.email,
    { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password` }
  )

  if (inviteError || !invited.user) {
    return NextResponse.json(
      { error: inviteError?.message ?? 'Could not send invite' },
      { status: 500 }
    )
  }

  const { error: linkError } = await service
    .from('residents')
    .update({ auth_user_id: invited.user.id })
    .eq('id', id)

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }

  return NextResponse.json({ email: resident.email })
}
