'use client'
import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
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
        <h1>Reset your password.</h1>
        {sent ? (
          <>
            <p>
              If an account exists for <strong>{email}</strong>, a password reset
              link has been sent. Check your inbox (and spam folder) and follow the
              link to set a new password.
            </p>
            <p className="login-help">
              <Link href="/login">← Back to sign in</Link>
            </p>
          </>
        ) : (
          <>
            <p>Enter the email address on your account and we&apos;ll send you a link to reset your password.</p>
            <form onSubmit={submit} className="login-form">
              <label>
                Email address
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="action" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'} <span aria-hidden="true">→</span>
              </button>
            </form>
            <p className="login-help">
              <Link href="/login">← Back to sign in</Link>
            </p>
          </>
        )}
      </section>
      <aside className="login-aside">
        <span className="eyebrow">One estate, clear roles</span>
        <h2>The right view for every day.</h2>
      </aside>
    </main>
  )
}
