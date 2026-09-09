import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type EstateRole = 'super_admin' | 'admin' | 'gate_staff' | 'resident'
export type CurrentUser = { id: string; email?: string; role: EstateRole; name: string }

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: staff } = await supabase.from('admins').select('full_name, role').eq('auth_user_id', user.id).maybeSingle()
  if (staff && ['super_admin', 'admin', 'gate_staff'].includes(staff.role)) return { id: user.id, email: user.email, role: staff.role as EstateRole, name: staff.full_name || user.email || 'Estate staff' }
  const { data: resident } = await supabase.from('residents').select('full_name').eq('auth_user_id', user.id).maybeSingle()
  return resident ? { id: user.id, email: user.email, role: 'resident', name: resident.full_name } : null
}

export function landingForRole(role: EstateRole) { return role === 'resident' ? '/portal' : role === 'gate_staff' ? '/gate' : '/admin' }
export async function requireRole(roles: EstateRole[]) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (!roles.includes(user.role)) redirect(landingForRole(user.role))
  return user
}
