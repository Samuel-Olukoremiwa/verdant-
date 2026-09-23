import 'server-only'

import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto'

export const PASSWORD_FLOW_COOKIE =
  'verdant_password_flow'

export type PasswordFlowPurpose =
  | 'recovery'
  | 'invite'

type PasswordFlowPayload = {
  version: 1
  purpose: PasswordFlowPurpose
  userId: string
  expiresAt: number
}

function getSecret() {
  const secret =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY

  if (!secret) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured'
    )
  }

  return secret
}

function sign(
  payload: string
) {
  return createHmac(
    'sha256',
    getSecret()
  )
    .update(payload)
    .digest('base64url')
}

export function createPasswordFlowCookie(
  purpose: PasswordFlowPurpose,
  userId: string
) {
  const data: PasswordFlowPayload = {
    version: 1,
    purpose,
    userId,

    // Password setup link remains usable
    // in the browser for 15 minutes after
    // the email token has been verified.
    expiresAt:
      Date.now() +
      15 * 60 * 1000,
  }

  const payload =
    Buffer.from(
      JSON.stringify(data),
      'utf8'
    ).toString('base64url')

  const signature =
    sign(payload)

  return `${payload}.${signature}`
}

export function readPasswordFlowCookie(
  value:
    | string
    | undefined
    | null
): PasswordFlowPayload | null {
  if (!value) {
    return null
  }

  try {
    const [
      payload,
      suppliedSignature,
    ] = value.split('.')

    if (
      !payload ||
      !suppliedSignature
    ) {
      return null
    }

    const expectedSignature =
      sign(payload)

    const suppliedBuffer =
      Buffer.from(
        suppliedSignature,
        'utf8'
      )

    const expectedBuffer =
      Buffer.from(
        expectedSignature,
        'utf8'
      )

    if (
      suppliedBuffer.length !==
      expectedBuffer.length
    ) {
      return null
    }

    if (
      !timingSafeEqual(
        suppliedBuffer,
        expectedBuffer
      )
    ) {
      return null
    }

    const decoded =
      JSON.parse(
        Buffer.from(
          payload,
          'base64url'
        ).toString('utf8')
      ) as PasswordFlowPayload

    if (
      decoded.version !== 1 ||
      ![
        'recovery',
        'invite',
      ].includes(
        decoded.purpose
      ) ||
      typeof decoded.userId !==
        'string' ||
      typeof decoded.expiresAt !==
        'number'
    ) {
      return null
    }

    if (
      decoded.expiresAt <=
      Date.now()
    ) {
      return null
    }

    return decoded
  } catch {
    return null
  }
}