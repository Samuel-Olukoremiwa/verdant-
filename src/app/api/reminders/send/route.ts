import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendDueReminders } from '@/lib/reminders'

// POST — triggered by the admin's "Send reminders" button in the UI.
// Requires a real admin session.
export async function POST() {
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

  try {
    const result = await sendDueReminders({})
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send reminders' },
      { status: 500 }
    )
  }
}

// GET — the same job, but for Vercel Cron to call automatically once deployed.
// Vercel Cron requests carry an Authorization: Bearer <CRON_SECRET> header
// automatically when CRON_SECRET is set as an env var, so no admin session
// is needed or possible here — this check replaces it.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await sendDueReminders({})
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send reminders' },
      { status: 500 }
    )
  }
}
