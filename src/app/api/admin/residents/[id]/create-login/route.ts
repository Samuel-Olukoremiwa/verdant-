import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  createClient,
} from '@/lib/supabase/server'

import {
  createServiceClient,
} from '@/lib/supabase/service'

type LinkResult = {
  linked?: boolean

  already_linked?: boolean

  reason?: string

  resident_id?: string

  auth_user_id?: string

  existing_auth_user_id?: string

  email?: string
}

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string
    }>
  }
) {
  void req

  const {
    id,
  } =
    await params

  const supabase =
    await createClient()

  const {
    data: {
      user,
    },
  } =
    await supabase
      .auth
      .getUser()

  if (
    !user
  ) {
    return NextResponse.json(
      {
        error:
          'Not signed in',
      },
      {
        status:
          401,
      }
    )
  }

  const {
    data:
      admin,

    error:
      adminError,
  } =
    await supabase
      .from(
        'admins'
      )
      .select(
        'role'
      )
      .eq(
        'auth_user_id',
        user.id
      )
      .single()

  if (
    adminError ||
    !admin ||
    ![
      'admin',
      'super_admin',
    ].includes(
      admin.role
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Not authorized',
      },
      {
        status:
          403,
      }
    )
  }

  const service =
    createServiceClient()

  const {
    data:
      resident,

    error:
      residentError,
  } =
    await service
      .from(
        'residents'
      )
      .select(
        'id, email, full_name, auth_user_id'
      )
      .eq(
        'id',
        id
      )
      .maybeSingle()

  if (
    residentError
  ) {
    return NextResponse.json(
      {
        error:
          'The resident account could not be loaded.',
      },
      {
        status:
          500,
      }
    )
  }

  if (
    !resident
  ) {
    return NextResponse.json(
      {
        error:
          'Resident not found',
      },
      {
        status:
          404,
      }
    )
  }

  if (
    resident.auth_user_id
  ) {
    return NextResponse.json(
      {
        error:
          'This resident already has a login',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    !resident.email
  ) {
    return NextResponse.json(
      {
        error:
          'This resident has no email on file. Add one first via Edit.',
      },
      {
        status:
          400,
      }
    )
  }

  const normalizedEmail =
    resident.email
      .trim()
      .toLowerCase()

  if (
    !normalizedEmail
  ) {
    return NextResponse.json(
      {
        error:
          'This resident does not have a valid email address.',
      },
      {
        status:
          400,
      }
    )
  }

  const siteUrl =
    process.env
      .NEXT_PUBLIC_SITE_URL
      ?.replace(
        /\/$/,
        ''
      )

  if (
    !siteUrl
  ) {
    return NextResponse.json(
      {
        error:
          'NEXT_PUBLIC_SITE_URL is not configured.',
      },
      {
        status:
          500,
      }
    )
  }

  /*
   * Delete a newly invited Auth user only when PostgreSQL
   * confirms that no resident currently references it.
   *
   * This prevents cleanup from deleting a valid account if a
   * concurrent request successfully linked it.
   */
  async function removeAuthUserIfUnlinked(
    authUserId: string
  ) {
    const {
      data:
        linkedResident,

      error:
        lookupError,
    } =
      await service
        .from(
          'residents'
        )
        .select(
          'id'
        )
        .eq(
          'auth_user_id',
          authUserId
        )
        .limit(
          1
        )
        .maybeSingle()

    if (
      lookupError
    ) {
      return {
        removed:
          false,

        safe:
          false,

        error:
          `Could not verify whether the Auth account is linked: ${lookupError.message}`,
      }
    }

    if (
      linkedResident
    ) {
      return {
        removed:
          false,

        safe:
          true,

        error:
          null,
      }
    }

    const {
      error:
        deleteError,
    } =
      await service
        .auth
        .admin
        .deleteUser(
          authUserId
        )

    if (
      deleteError
    ) {
      return {
        removed:
          false,

        safe:
          true,

        error:
          deleteError.message,
      }
    }

    return {
      removed:
        true,

      safe:
        true,

      error:
        null,
    }
  }


  // ==========================================================
  // CREATE AUTH INVITATION
  // ==========================================================

  const {
    data:
      invited,

    error:
      inviteError,
  } =
    await service
      .auth
      .admin
      .inviteUserByEmail(
        normalizedEmail,
        {
          redirectTo:
            `${siteUrl}/set-password`,
        }
      )

  if (
    inviteError ||
    !invited.user
  ) {
    return NextResponse.json(
      {
        error:
          inviteError
            ?.message ??
          'Could not send invite',
      },
      {
        status:
          500,
      }
    )
  }

  const authUserId =
    invited.user.id

  const invitedEmail =
    invited.user.email
      ?.trim()
      .toLowerCase()

  /*
   * Never link an Auth identity whose email does not exactly
   * match the resident record.
   */
  if (
    !invitedEmail ||
    invitedEmail !==
      normalizedEmail
  ) {
    const cleanup =
      await removeAuthUserIfUnlinked(
        authUserId
      )

    return NextResponse.json(
      {
        error:
          cleanup.removed
            ? 'The portal account email did not match the resident email. The incorrect Auth account was removed.'
            : cleanup.safe
              ? 'The portal account email did not match the resident email. The Auth account could not be removed automatically.'
              : 'The portal account email did not match the resident email and its link state could not be verified safely.',

        cleanup:
          cleanup.error ??
          undefined,
      },
      {
        status:
          500,
      }
    )
  }


  // ==========================================================
  // LINK RESIDENT TO AUTH USER
  //
  // This operation is idempotent and service-role only.
  // ==========================================================

  const {
    data:
      linkResult,

    error:
      linkError,
  } =
    await service.rpc(
      'link_resident_auth_user',
      {
        p_resident:
          id,

        p_auth_user:
          authUserId,

        p_email:
          normalizedEmail,
      }
    )

  const link =
    (
      linkResult ??
      null
    ) as
      | LinkResult
      | null

  let linkConfirmed =
    !linkError &&
    link?.linked ===
      true


  /*
   * A network/PostgREST failure does not prove that PostgreSQL
   * failed. Verify the resident before deleting the Auth user.
   */
  if (
    !linkConfirmed
  ) {
    const {
      data:
        currentResident,

      error:
        verificationError,
    } =
      await service
        .from(
          'residents'
        )
        .select(
          'id, email, auth_user_id'
        )
        .eq(
          'id',
          id
        )
        .maybeSingle()

    if (
      verificationError
    ) {
      return NextResponse.json(
        {
          error:
            'The portal invitation was created, but the resident login link could not be verified. Do not create another login yet. Refresh the resident and check its login status first.',

          loginState:
            'unknown',

          authUserId,
        },
        {
          status:
            500,
        }
      )
    }

    if (
      currentResident &&
      currentResident
        .auth_user_id ===
        authUserId &&
      currentResident
        .email
        ?.trim()
        .toLowerCase() ===
        normalizedEmail
    ) {
      linkConfirmed =
        true
    } else {
      /*
       * PostgreSQL confirms this Auth user is not the resident's
       * successful linked identity. Remove it only if no other
       * resident references it.
       */
      const cleanup =
        await removeAuthUserIfUnlinked(
          authUserId
        )

      const reason =
        link
          ?.reason

      const conflict =
        [
          'resident_already_linked',
          'auth_user_in_use',
          'link_state_changed',
          'email_mismatch',
        ].includes(
          reason ??
          ''
        )

      return NextResponse.json(
        {
          error:
            cleanup.removed
              ? conflict
                ? 'The resident login changed while this invitation was being created. The unused Auth account was removed. Refresh the resident before trying again.'
                : 'The resident login could not be linked. The unused Auth account was removed safely.'
              : cleanup.safe
                ? conflict
                  ? 'The resident login changed while this invitation was being created. Refresh the resident before trying again.'
                  : 'The resident login could not be linked and the unused Auth account could not be removed automatically.'
                : 'The resident login could not be linked and the Auth account state could not be verified safely.',

          cleanup:
            cleanup.error ??
            undefined,
        },
        {
          status:
            conflict
              ? 409
              : 500,
        }
      )
    }
  }


  if (
    !linkConfirmed
  ) {
    return NextResponse.json(
      {
        error:
          'The resident login could not be confirmed.',
      },
      {
        status:
          500,
      }
    )
  }

  return NextResponse.json({
    email:
      normalizedEmail,

    authUserId,

    alreadyLinked:
      link
        ?.already_linked ===
        true,
  })
}