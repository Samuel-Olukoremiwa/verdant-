'use client'
import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Clicking the emailed reset link redirects here with a recovery token in
    // the URL; supabase-js exchanges it for a session automatically and fires
    // this event once that's done, only then is it safe to show the form.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })
    // Also handle the case where a session already exists by the time this mounts.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })
    return () => listener.subscription.unsubscribe()
  }, [supabase])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
    setTimeout(() => {
      router.replace('/login')
    }, 2000)
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <Link href="/" className="brand login-brand">
          <span className="brand-mark">V</span>
          <span>
            Verdant
            <small>Estate operations</small>
          </span>
        </Link>
        <span className="eyebrow">Account recovery</span>
        <h1>Choose a new password.</h1>

        {done ? (
          <p>Your password has been updated. Redirecting you to sign in…</p>
        ) : !ready ? (
          <p>
            Confirming your reset link… If this doesn&apos;t update in a few
            seconds, the link may have expired —{' '}
            <Link href="/forgot-password">request a new one</Link>.
          </p>
        ) : (
          <form onSubmit={submit} className="login-form">
            <label>
              New password
              <input
                required
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </label>
            <label>
              Confirm new password
              <input
                required
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="action" disabled={loading}>
              {loading ? 'Updating…' : 'Update password'} <span aria-hidden="true">→</span>
            </button>
          </form>
        )}
      </section>
      <aside className="login-aside">
        <span className="eyebrow">One estate, clear roles</span>
        <h2>The right view for every day.</h2>
      </aside>
    </main>
  )
}
