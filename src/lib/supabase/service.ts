import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Service-role Supabase client. Bypasses RLS entirely.
// SERVER-ONLY. Never import this from a Client Component or expose the key to the browser.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase service role client is missing URL or SERVICE_ROLE_KEY')
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}