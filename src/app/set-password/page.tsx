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

export default async function SetPasswordPage() {
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
        'invite' &&
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
            V
          </span>

          <span>
            Verdant

            <small>
              Estate operations
            </small>
          </span>
        </Link>

        <span className="eyebrow">
          Account setup
        </span>

        <h1>
          Create your
          password.
        </h1>

        {!valid ||
        !user ? (
          <>
            <p>
              This account
              invitation is
              invalid, expired,
              or has already
              been used.
            </p>

            <p
              style={{
                marginTop:
                  '1rem',
              }}
            >
              Ask your estate
              administrator to
              send a new portal
              invitation.
            </p>

            <p className="login-help">
              <Link href="/login">
                ← Back to sign
                in
              </Link>
            </p>
          </>
        ) : (
          <>
            <p>
              Your invitation
              has been verified.
              Create a password
              for this account.
            </p>

            <PasswordSetupForm
              mode="invite"
              email={
                user.email ??
                'Invited account'
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
    'Set Up Account',

  description:
    'Set up your Verdant portal password.',

  robots: {
    index: false,
    follow: false,
  },
}