import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Approves a pending registration request: creates the house + resident
// records, generates a QR pass, creates their portal login, and marks the
// request as approved — all in one step, using the service role since this
// touches several tables an admin's normal session can write to individually
// but we want atomic-ish handling here.
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

  const service = createServiceClient()

  const { data: reg } = await service
    .from('registration_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (!reg) {
    return NextResponse.json({ error: 'Registration request not found' }, { status: 404 })
  }
  if (reg.status !== 'pending') {
    return NextResponse.json({ error: 'This request has already been reviewed' }, { status: 400 })
  }

  let streetName = ''
  if (reg.street_id) {
    const { data: street } = await service
      .from('streets')
      .select('name')
      .eq('id', reg.street_id)
      .single()
    streetName = street?.name ?? ''
  }

  const address = streetName ? `${reg.house_number}, ${streetName}` : reg.house_number

  // 1. Create the house
  const { data: house, error: houseError } = await service
    .from('houses')
    .insert({
      address,
      house_type: reg.house_type,
      street_id: reg.street_id,
      house_number: reg.house_number,
    })
    .select()
    .single()
  if (houseError) {
    return NextResponse.json({ error: houseError.message }, { status: 500 })
  }

  // 2. Create the resident
  const fullName = [reg.first_name, reg.other_names, reg.surname]
    .filter(Boolean)
    .join(' ')
  const qrValue = `RES-${crypto.randomUUID()}`

  const { data: resident, error: residentError } = await service
    .from('residents')
    .insert({
      house_id: house.id,
      full_name: fullName,
      phone: reg.phone,
      email: reg.email,
      relationship: reg.relationship,
      qr_code_value: qrValue,
    })
    .select()
    .single()
  if (residentError) {
    return NextResponse.json({ error: residentError.message }, { status: 500 })
  }

  // 3. Create their portal login — send an invite email rather than
  // generating a temporary password; they set their own via the link.
  const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(
    reg.email,
    { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password` }
  )
  if (inviteError || !invited.user) {
    return NextResponse.json(
      { error: inviteError?.message ?? 'Could not send invite' },
      { status: 500 }
    )
  }

  await service.from('residents').update({ auth_user_id: invited.user.id }).eq('id', resident.id)

  // 4. Mark the request as approved
  await service
    .from('registration_requests')
    .update({
      status: 'approved',
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      created_resident_id: resident.id,
    })
    .eq('id', id)

  return NextResponse.json({ email: reg.email, residentName: fullName })
}
