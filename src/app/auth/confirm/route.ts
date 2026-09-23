import {
  NextRequest,
  NextResponse,
} from 'next/server'
import type {
  EmailOtpType,
} from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest
) {
  const requestUrl =
    new URL(request.url)

  const tokenHash =
    requestUrl.searchParams.get(
      'token_hash'
    )

  const type =
    requestUrl.searchParams.get(
      'type'
    ) as EmailOtpType | null

  const requestedNext =
    requestUrl.searchParams.get(
      'next'
    )

  // Only allow internal redirects.
  const next =
    requestedNext &&
    requestedNext.startsWith('/') &&
    !requestedNext.startsWith('//')
      ? requestedNext
      : '/reset-password'

  if (
    tokenHash &&
    type
  ) {
    const supabase =
      await createClient()

    const { error } =
      await supabase.auth.verifyOtp({
        token_hash:
          tokenHash,

        type,
      })

    if (!error) {
      return NextResponse.redirect(
        new URL(
          next,
          requestUrl.origin
        )
      )
    }
  }

  const errorUrl =
    new URL(
      '/forgot-password',
      requestUrl.origin
    )

  errorUrl.searchParams.set(
    'error',
    'invalid_or_expired'
  )

  return NextResponse.redirect(
    errorUrl
  )
}