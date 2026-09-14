import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type EstateRole = 'super_admin' | 'admin' | 'gate_staff' | 'resident'

export type CurrentUser = {
  id: string
  email?: string
  name: string
  roles: EstateRole[] // every role this account actually holds — can be more than one
  primaryRole: EstateRole // which one to land on right after login
  staffRole?: 'super_admin' | 'admin' | 'gate_staff' // set if this account is also estate staff
  isResident: boolean // set if this account is also linked to a resident record
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // A single login can be BOTH staff and a resident (e.g. the estate owner
  // who also lives there) — check both, rather than stopping at the first match.
  const [{ data: staff }, { data: resident }] = await Promise.all([
    supabase.from('admins').select('full_name, role').eq('auth_user_id', user.id).maybeSingle(),
    supabase
      .from('residents')
      .select('full_name')
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .maybeSingle(),
  ])

  const roles: EstateRole[] = []
  let staffRole: CurrentUser['staffRole']
  let name = user.email || 'User'

  if (staff && ['super_admin', 'admin', 'gate_staff'].includes(staff.role)) {
    staffRole = staff.role as CurrentUser['staffRole']
    roles.push(staff.role as EstateRole)
    name = staff.full_name || name
  }
  if (resident) {
    roles.push('resident')
    if (!staffRole) name = resident.full_name
  }

  if (roles.length === 0) return null

  // Staff role wins for where you land right after logging in — someone who's
  // both an admin and a resident is signing in primarily to run the estate.
  const primaryRole: EstateRole = staffRole ?? 'resident'

  return {
    id: user.id,
    email: user.email,
    name,
    roles,
    primaryRole,
    staffRole,
    isResident: Boolean(resident),
  }
}

export function landingForRole(role: EstateRole) {
  return role === 'resident' ? '/portal' : role === 'gate_staff' ? '/gate' : '/admin'
}

export async function requireRole(roles: EstateRole[]) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  // Access is granted if the user holds ANY of the allowed roles — not just
  // their primary one — so a dual-role account can reach both areas.
  const hasAccess = user.roles.some((r) => roles.includes(r))
  if (!hasAccess) redirect(landingForRole(user.primaryRole))
  return user
}
