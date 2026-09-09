import { getCurrentUser, landingForRole } from '@/lib/auth'
import { redirect } from 'next/navigation'
export default async function AuthRedirectPage() { const user=await getCurrentUser(); if(!user) redirect('/login?error=unassigned'); redirect(landingForRole(user.role)) }
