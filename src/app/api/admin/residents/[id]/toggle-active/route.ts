import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Toggles a resident between active/inactive. Inactive means fully locked
// out — their gate QR pass is rejected AND their portal login is banned
// from signing in at all (not just hidden), so "removing" a resident who's
// moved out actually revokes their access rather than just flipping a flag
// that other code has to remember to check.
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

  const parsed = z.object({is_active:z.boolean()}).strict().safeParse(await req.json().catch(()=>null))
  if(!z.uuid().safeParse(id).success || !parsed.success) return NextResponse.json({error:'Invalid resident or status'}, {status:400})
  const {is_active}=parsed.data

  const service = createServiceClient()

  const { data: resident, error: fetchError } = await service
    .from('residents')
    .select('id, auth_user_id')
    .eq('id', id)
    .single()

  if (fetchError || !resident) {
    return NextResponse.json({ error: 'Resident not found' }, { status: 404 })
  }

  const { error: updateError } = await service
    .from('residents')
    .update({ is_active })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: 'Could not update resident status' }, { status: 500 })
  }

  // If they have a portal login, ban or unban it to match.
  // Supabase's admin API uses ban_duration; '876000h' (~100 years) is the
  // conventional way to represent an indefinite ban, 'none' lifts it.
  if (resident.auth_user_id) {
    const {error: authError} = await service.auth.admin.updateUserById(resident.auth_user_id, {
      ban_duration: is_active ? 'none' : '876000h',
    })
    if(authError) return NextResponse.json({error:'Resident record updated, but account sign-in status could not be synchronised. Retry this action.'},{status:502})
  }

  return NextResponse.json({ ok: true })
}
