'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
export function SignOutButton() { const router = useRouter(); const [busy, setBusy] = useState(false); async function signOut() { setBusy(true); await createClient().auth.signOut(); router.replace('/login'); router.refresh() } return <button type="button" className="sign-out" onClick={signOut} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button> }
