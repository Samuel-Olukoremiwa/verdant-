'use client'

import Link from 'next/link'

import {
  FormEvent,
  useState,
} from 'react'

import {
  useRouter,
} from 'next/navigation'

import {
  PasswordInput,
} from '@/components/password-input'

import {
  SiteTools,
} from '@/components/site-tools'

import {
  createClient,
} from '@/lib/supabase/client'

export default function LoginPage() {
  const router =
    useRouter()

  const [
    email,
    setEmail,
  ] =
    useState(
      ''
    )

  const [
    password,
    setPassword,
  ] =
    useState(
      ''
    )

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null
    )

  const [
    loading,
    setLoading,
  ] =
    useState(
      false
    )

  async function submit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setLoading(
      true
    )

    setError(
      null
    )

    try {
      const supabase =
        createClient()

      const {
        data,
        error:
          signInError,
      } =
        await supabase
          .auth
          .signInWithPassword({
            email:
              email.trim(),

            password,
          })

      if (
        signInError
      ) {
        console.error(
          'Supabase sign-in failed:',
          signInError
        )

        setError(
          process.env.NODE_ENV ===
            'development'
            ? `Sign-in failed: ${signInError.message}`
            : 'Unable to sign in. Check your email and password.'
        )

        return
      }

      if (
        !data.user ||
        !data.session
      ) {
        setError(
          'Sign-in completed without a valid session. Please try again.'
        )

        return
      }

      router.replace(
        '/auth/redirect'
      )

      router.refresh()
    } catch (
      caught
    ) {
      console.error(
        'Unable to connect during sign-in:',
        caught
      )

      setError(
        process.env.NODE_ENV ===
          'development' &&
        caught instanceof
          Error
          ? `Unable to connect: ${caught.message}`
          : 'Unable to connect. Please try again.'
      )
    } finally {
      setLoading(
        false
      )
    }
  }

  return (
    <main
      id="main-content"
      className="login-page"
    >
      <div className="auth-tools">
        <SiteTools />
      </div>

      <section className="login-panel">
        <Link
          href="/"
          className="brand login-brand"
        >
          <span className="brand-mark">
            Z
          </span>

          <span>
            Zadant

            <small>
              Estate operations
            </small>
          </span>
        </Link>

        <span className="eyebrow">
          Secure estate access
        </span>

        <h1>
          Welcome back.
        </h1>

        <p>
          Sign in with the email
          and password issued by
          your estate
          administrator.
        </p>

        <form
          onSubmit={
            submit
          }
          className="login-form"
        >
          <label>
            Email address

            <input
              required
              type="email"
              autoComplete="email"
              value={
                email
              }
              onChange={
                (
                  event
                ) =>
                  setEmail(
                    event
                      .target
                      .value
                  )
              }
              placeholder="you@example.com"
            />
          </label>

          <label>
            Password

            <PasswordInput
              aria-label="Password"
              required
              autoComplete="current-password"
              value={
                password
              }
              onChange={
                (
                  event
                ) =>
                  setPassword(
                    event
                      .target
                      .value
                  )
              }
              placeholder="Your password"
            />
          </label>

          <p
            className="login-help"
            style={{
              marginTop:
                '-.4rem',

              textAlign:
                'right',
            }}
          >
            <Link href="/forgot-password">
              Forgot password?
            </Link>
          </p>

          {error && (
            <p
              className="form-error"
              role="alert"
            >
              {error}
            </p>
          )}

          <button
            className="action"
            disabled={
              loading
            }
          >
            {loading
              ? 'Signing in…'
              : 'Sign in'}

            {' '}

            <span aria-hidden="true">
              →
            </span>
          </button>
        </form>

        <p className="login-help">
          Residents,
          administrators and
          gate staff use the same
          secure sign-in. Your
          account automatically
          opens the right
          workspace.
        </p>
      </section>

      <aside className="login-aside">
        <span className="eyebrow">
          One estate, clear roles
        </span>

        <h2>
          The right view for
          every day.
        </h2>

        <div className="role-list">
          <p>
            <strong>
              Residents
            </strong>

            Balances, payments
            and account details.
          </p>

          <p>
            <strong>
              Administrators
            </strong>

            Estate-wide resident,
            billing and access
            operations.
          </p>

          <p>
            <strong>
              Gate staff
            </strong>

            Focused access
            activity for a
            confident gate.
          </p>
        </div>
      </aside>
    </main>
  )
}