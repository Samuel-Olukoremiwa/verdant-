import {
  NextRequest,
  NextResponse,
} from 'next/server'

import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'

import {
  PASSWORD_FLOW_COOKIE,
  readPasswordFlowCookie,
} from '@/lib/password-flow'

const schema =
  z
    .object({
      mode:
        z.enum([
          'recovery',
          'invite',
        ]),

      password:
        z
          .string()
          .min(
            8,
            'Password must be at least 8 characters.'
          )
          .max(
            128,
            'Password is too long.'
          ),
    })
    .strict()

export async function POST(
  request: NextRequest
) {
  const parsed =
    schema.safeParse(
      await request
        .json()
        .catch(() => null)
    )

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error
            .issues[0]
            ?.message ??
          'Invalid password request.',
      },
      {
        status: 400,
      }
    )
  }

  const flow =
    readPasswordFlowCookie(
      request.cookies.get(
        PASSWORD_FLOW_COOKIE
      )?.value
    )

  if (!flow) {
    return NextResponse.json(
      {
        error:
          'This password link is no longer valid. Please request a new email.',
      },
      {
        status: 403,
      }
    )
  }

  if (
    flow.purpose !==
    parsed.data.mode
  ) {
    return NextResponse.json(
      {
        error:
          'This link cannot be used for this password operation.',
      },
      {
        status: 403,
      }
    )
  }

  const supabase =
    await createClient()

  const {
    data: { user },
    error:
      userError,
  } =
    await supabase.auth.getUser()

  if (
    userError ||
    !user
  ) {
    return NextResponse.json(
      {
        error:
          'The authenticated account for this link could not be verified.',
      },
      {
        status: 401,
      }
    )
  }

  /*
   * Critical account-isolation check.
   *
   * The session user MUST be the same
   * user whose email token created the
   * password-flow cookie.
   */
  if (
    user.id !==
    flow.userId
  ) {
    return NextResponse.json(
      {
        error:
          'Account verification failed. No password was changed.',
      },
      {
        status: 403,
      }
    )
  }

  const {
    error:
      updateError,
  } =
    await supabase.auth.updateUser({
      password:
        parsed.data.password,
    })

  if (updateError) {
    return NextResponse.json(
      {
        error:
          updateError.message,
      },
      {
        status: 400,
      }
    )
  }

  /*
   * Password has successfully changed.
   *
   * Sign this user out locally so they
   * perform a clean login using their new
   * password.
   */
  const {
    error:
      signOutError,
  } =
    await supabase.auth.signOut({
      scope: 'local',
    })

  if (signOutError) {
    console.error(
      'Password updated but local sign-out failed:',
      signOutError.message
    )
  }

  const response =
    NextResponse.json({
      ok: true,

      email:
        user.email ??
        null,
    })

  response.cookies.set({
    name:
      PASSWORD_FLOW_COOKIE,

    value: '',

    path: '/',

    httpOnly: true,

    secure:
      process.env
        .NODE_ENV ===
      'production',

    sameSite: 'lax',

    maxAge: 0,
  })

  return response
}