import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Admin sets (or clears) which resident is responsible for a house's bills.
// Clearing it (resident_id: null) resets to the default rule — the Home
// Owner is responsible whenever no one has been explicitly assigned.
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

  const { data: admin } = await supabase
    .from('admins')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()
  if (!admin || !['admin', 'super_admin'].includes(admin.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { resident_id } = await req.json()

  const service = createServiceClient()

  if (resident_id) {
    const { data: resident } = await service
      .from('residents')
      .select('house_id')
      .eq('id', resident_id)
      .eq('is_active', true)
      .single()
    if (!resident || resident.house_id !== id) {
      return NextResponse.json(
        { error: 'That resident does not belong to this house' },
        { status: 400 }
      )
    }
  }

  const { data: updated, error } = await service
    .from('houses')
    .update({ billing_responsible_resident_id: resident_id ?? null })
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!updated) return NextResponse.json({ error: 'House not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
