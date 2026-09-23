'use client'

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

type Mode =
  | 'invite'
  | 'recovery'

export function PasswordSetupForm({
  mode,
  email,
}: {
  mode: Mode
  email: string
}) {
  const router =
    useRouter()

  const [
    password,
    setPassword,
  ] =
    useState('')

  const [
    confirm,
    setConfirm,
  ] =
    useState('')

  const [
    loading,
    setLoading,
  ] =
    useState(false)

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null)

  const [
    done,
    setDone,
  ] =
    useState(false)

  async function submit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setError(null)

    if (
      password.length < 8
    ) {
      setError(
        'Password must be at least 8 characters.'
      )
      return
    }

    if (
      password !==
      confirm
    ) {
      setError(
        'Passwords do not match.'
      )
      return
    }

    setLoading(true)

    try {
      const response =
        await fetch(
          '/api/auth/update-password',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                mode,
                password,
              }),
          }
        )

      const data =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data.error ??
            'Could not update password'
        )
      }

      setDone(true)

      setTimeout(
        () => {
          router.replace(
            '/login?password_updated=1'
          )

          router.refresh()
        },
        1800
      )
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not update password'
      )
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div>
        <p>
          Your password has
          been set successfully.
        </p>

        <p
          style={{
            marginTop:
              '.75rem',
          }}
        >
          Redirecting you to
          sign in…
        </p>
      </div>
    )
  }

  return (
    <>
      <div
        style={{
          marginBottom:
            '1.25rem',

          padding:
            '.85rem 1rem',

          border:
            '1px solid #d8e3dc',

          borderRadius:
            '.75rem',

          background:
            '#f7faf8',
        }}
      >
        <span
          style={{
            display:
              'block',

            fontSize:
              '.72rem',

            textTransform:
              'uppercase',

            letterSpacing:
              '.08em',

            color:
              '#5f6f67',

            marginBottom:
              '.25rem',
          }}
        >
          Password will be
          changed for
        </span>

        <strong>
          {email}
        </strong>
      </div>

      <form
        onSubmit={submit}
        className="login-form"
      >
        <label>
          New password

          <PasswordInput
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            aria-label="New password"
            value={password}
            onChange={(
              event
            ) =>
              setPassword(
                event.target
                  .value
              )
            }
            placeholder="At least 8 characters"
          />
        </label>

        <label>
          Confirm new password

          <PasswordInput
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            aria-label="Confirm new password"
            value={confirm}
            onChange={(
              event
            ) =>
              setConfirm(
                event.target
                  .value
              )
            }
          />
        </label>

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
          disabled={loading}
        >
          {loading
            ? 'Updating…'
            : mode ===
                'invite'
              ? 'Set password'
              : 'Update password'}

          {' '}

          <span aria-hidden="true">
            →
          </span>
        </button>
      </form>
    </>
  )
}