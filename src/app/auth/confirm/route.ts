import {
  NextRequest,
  NextResponse,
} from 'next/server'

import type {
  EmailOtpType,
} from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'

import {
  createPasswordFlowCookie,
  PASSWORD_FLOW_COOKIE,
  type PasswordFlowPurpose,
} from '@/lib/password-flow'

export async function GET(
  request: NextRequest
) {
  const requestUrl =
    new URL(request.url)

  const tokenHash =
    requestUrl.searchParams.get(
      'token_hash'
    )

  const rawType =
    requestUrl.searchParams.get(
      'type'
    )

  const validType =
    rawType === 'recovery' ||
    rawType === 'invite'

  if (
    !tokenHash ||
    !validType
  ) {
    const errorUrl =
      new URL(
        '/login',
        requestUrl.origin
      )

    errorUrl.searchParams.set(
      'error',
      'invalid_auth_link'
    )

    return NextResponse.redirect(
      errorUrl
    )
  }

  const purpose =
    rawType as PasswordFlowPurpose

  const type =
    rawType as EmailOtpType

  const supabase =
    await createClient()

  /*
   * Very important:
   *
   * Remove any account that was already
   * signed in in this browser.
   *
   * Otherwise an administrator testing
   * another resident's invite could leave
   * their own account as the current user.
   */
  await supabase.auth.signOut({
    scope: 'local',
  })

  const {
    data,
    error,
  } =
    await supabase.auth.verifyOtp({
      token_hash:
        tokenHash,

      type,
    })

  if (
    error ||
    !data.user
  ) {
    const errorPath =
      purpose === 'recovery'
        ? '/forgot-password'
        : '/login'

    const errorUrl =
      new URL(
        errorPath,
        requestUrl.origin
      )

    errorUrl.searchParams.set(
      'error',
      purpose === 'recovery'
        ? 'invalid_or_expired'
        : 'invite_invalid_or_expired'
    )

    return NextResponse.redirect(
      errorUrl
    )
  }

  /*
   * Token verification has now signed in
   * the EXACT user belonging to the email
   * link.
   *
   * Store a signed, HttpOnly marker tying
   * the password operation to this user ID.
   */
  const flowCookie =
    createPasswordFlowCookie(
      purpose,
      data.user.id
    )

  const destination =
    purpose === 'invite'
      ? '/set-password'
      : '/reset-password'

  const response =
    NextResponse.redirect(
      new URL(
        destination,
        requestUrl.origin
      )
    )

  response.cookies.set({
    name:
      PASSWORD_FLOW_COOKIE,

    value:
      flowCookie,

    httpOnly: true,

    secure:
      process.env
        .NODE_ENV ===
      'production',

    sameSite: 'lax',

    path: '/',

    maxAge:
      15 * 60,
  })

  response.headers.set(
    'Cache-Control',
    'private, no-store'
  )

  return response
}