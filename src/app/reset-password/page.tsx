import Link from 'next/link'
import { cookies } from 'next/headers'

import {
  SiteTools,
} from '@/components/site-tools'

import {
  PasswordSetupForm,
} from '@/components/password-setup-form'

import {
  createClient,
} from '@/lib/supabase/server'

import {
  PASSWORD_FLOW_COOKIE,
  readPasswordFlowCookie,
} from '@/lib/password-flow'

export default async function ResetPasswordPage() {
  const cookieStore =
    await cookies()

  const flow =
    readPasswordFlowCookie(
      cookieStore.get(
        PASSWORD_FLOW_COOKIE
      )?.value
    )

  const supabase =
    await createClient()

  const {
    data: { user },
  } =
    await supabase.auth.getUser()

  const valid =
    Boolean(
      flow &&
      flow.purpose ===
        'recovery' &&
      user &&
      user.id ===
        flow.userId
    )

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
          Account recovery
        </span>

        <h1>
          Choose a new
          password.
        </h1>

        {!valid ||
        !user ? (
          <>
            <p>
              This password
              reset session is
              invalid or has
              expired.
            </p>

            <p
              style={{
                marginTop:
                  '1rem',
              }}
            >
              For security,
              opening this page
              while already
              signed in is not
              enough to change a
              password. Use a
              fresh recovery
              email.
            </p>

            <p className="login-help">
              <Link href="/forgot-password">
                Request a new
                reset link →
              </Link>
            </p>
          </>
        ) : (
          <>
            <p>
              Enter a new
              password for the
              verified account
              below.
            </p>

            <PasswordSetupForm
              mode="recovery"
              email={
                user.email ??
                'Verified account'
              }
            />
          </>
        )}
      </section>

      <aside className="login-aside">
        <span className="eyebrow">
          One estate, clear
          roles
        </span>

        <h2>
          The right view for
          every day.
        </h2>
      </aside>
    </main>
  )
}

export const metadata = {
  title:
    'Reset Password',

  description:
    'Reset your Zadant account password.',

  robots: {
    index: false,
    follow: false,
  },
}