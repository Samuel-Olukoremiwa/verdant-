import { getCurrentUser, landingForRole } from '@/lib/auth'
import { redirect } from 'next/navigation'
export default async function AuthRedirectPage() { const user=await getCurrentUser(); if(!user) redirect('/login?error=unassigned'); redirect(landingForRole(user.primaryRole)) }

export const metadata = {title: 'Auth Redirect', description: 'Manage your estate account and workspace with Verdant.', robots: {index: false, follow: false}}
