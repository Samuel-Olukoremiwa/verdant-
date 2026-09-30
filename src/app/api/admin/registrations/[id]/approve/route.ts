import crypto from 'crypto'

import { z } from 'zod'

import {
  after,
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  queueSmsNotification,
} from '@/lib/notification-queue'

import {
  processNotificationQueue,
} from '@/lib/notification-worker'

import {
  createClient,
} from '@/lib/supabase/server'

import {
  createServiceClient,
} from '@/lib/supabase/service'

async function queueRegistrationSms({
  registrationId,
  phone,
}: {
  registrationId: string
  phone: string
}) {
  const sms =
    await queueSmsNotification({
      eventKey:
        `registration:${registrationId}`,

      kind:
        'registration',

      phone,

      message:
        'Zadant: Your estate registration is approved. Check your email, including spam, for the invitation to set your password and access the resident portal.',
    })

  if (
    sms.status ===
    'queued'
  ) {
    after(
      async () => {
        try {
          await processNotificationQueue({
            kind:
              'registration',

            maxJobs:
              10,

            deadlineMs:
              15000,
          })
        } catch {
          console.error(
            'Registration SMS remains queued for background delivery'
          )
        }
      }
    )
  }

  return sms
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
    await supabase.auth.getUser()

  if (!user) {
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
        'id, role'
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

  const approvalClaimToken =
    crypto.randomUUID()

  async function releaseApprovalClaim() {
    const {
      data,
      error,
    } =
      await service.rpc(
        'release_registration_approval_claim',
        {
          p_registration:
            id,

          p_claim_token:
            approvalClaimToken,
        }
      )

    if (
      error
    ) {
      console.error(
        'Could not release registration approval claim:',
        error.message
      )

      return false
    }

    return data ===
      true
  }

  async function rollbackProvisionedAccount({
    residentId,
    authUserId,
  }: {
    residentId: string

    authUserId?:
      | string
      | null
  }) {
    const errors:
      string[] =
      []

    if (
      authUserId
    ) {
      const {
        error:
          authDeleteError,
      } =
        await service
          .auth
          .admin
          .deleteUser(
            authUserId
          )

      if (
        authDeleteError
      ) {
        errors.push(
          `Auth rollback failed: ${authDeleteError.message}`
        )
      }
    }

    const {
      error:
        residentDeleteError,
    } =
      await service
        .from(
          'residents'
        )
        .delete()
        .eq(
          'id',
          residentId
        )

    if (
      residentDeleteError
    ) {
      errors.push(
        `Resident rollback failed: ${residentDeleteError.message}`
      )
    }

    return {
      ok:
        errors.length ===
        0,

      errors,
    }
  }

  async function releaseAfterSafeRollback({
    residentId,
    authUserId,
  }: {
    residentId: string

    authUserId?:
      | string
      | null
  }) {
    const rollback =
      await rollbackProvisionedAccount({
        residentId,
        authUserId,
      })

    /*
     * Only release immediately when cleanup was
     * confirmed. An incomplete rollback keeps the
     * claim temporarily, reducing the chance that
     * an immediate retry creates another account.
     */
    if (
      rollback.ok
    ) {
      await releaseApprovalClaim()
    }

    return rollback
  }

  const {
    data:
      reg,

    error:
      registrationError,
  } =
    await service
      .from(
        'registration_requests'
      )
      .select(
        '*'
      )
      .eq(
        'id',
        id
      )
      .single()

  if (
    registrationError ||
    !reg
  ) {
    return NextResponse.json(
      {
        error:
          'Registration request not found',
      },
      {
        status:
          404,
      }
    )
  }

  /*
   * Retry safety.
   *
   * A browser/server retry after a successful approval
   * must return the existing account rather than create
   * another resident or Auth user.
   */
  if (
    reg.status ===
      'approved' &&
    reg.created_resident_id
  ) {
    const {
      data:
        existingResident,

      error:
        existingResidentError,
    } =
      await service
        .from(
          'residents'
        )
        .select(
          'id, full_name, email, phone, house_id, auth_user_id'
        )
        .eq(
          'id',
          reg.created_resident_id
        )
        .maybeSingle()

    if (
      existingResidentError
    ) {
      return NextResponse.json(
        {
          error:
            'This registration is approved, but the resident account could not be verified.',
        },
        {
          status:
            500,
        }
      )
    }

    if (
      !existingResident
    ) {
      return NextResponse.json(
        {
          error:
            'This registration is marked approved, but its resident account is missing. Please contact the administrator.',
        },
        {
          status:
            409,
        }
      )
    }

    if (
      !existingResident
        .auth_user_id
    ) {
      return NextResponse.json(
        {
          error:
            'This registration is approved, but the resident portal account is not linked. Please contact the administrator.',
        },
        {
          status:
            409,
        }
      )
    }

    const sms =
      await queueRegistrationSms({
        registrationId:
          id,

        phone:
          existingResident.phone ??
          reg.phone ??
          '',
      })

    return NextResponse.json({
      email:
        existingResident.email,

      residentName:
        existingResident.full_name,

      houseId:
        existingResident.house_id,

      authUserId:
        existingResident.auth_user_id,

      sms,

      alreadyApproved:
        true,
    })
  }

  if (
    reg.status !==
    'pending'
  ) {
    return NextResponse.json(
      {
        error:
          'This request has already been reviewed',
      },
      {
        status:
          400,
      }
    )
  }

  const input =
    z
      .object({
        move_in_date:
          z
            .iso
            .date()
            .optional(),

        property_allocation_date:
          z
            .iso
            .date()
            .optional(),
      })
      .strict()
      .safeParse(
        await req
          .json()
          .catch(
            () => ({})
          )
      )

  if (
    !input.success
  ) {
    return NextResponse.json(
      {
        error:
          'Enter valid move-in and property allocation dates.',
      },
      {
        status:
          400,
      }
    )
  }

  const dates =
    z
      .object({
        move_in_date:
          z.iso.date(),

        property_allocation_date:
          z.iso.date(),
      })
      .safeParse({
        move_in_date:
          input.data
            .move_in_date ??
          reg.move_in_date,

        property_allocation_date:
          input.data
            .property_allocation_date ??
          reg
            .property_allocation_date,
      })

  if (
    !dates.success
  ) {
    return NextResponse.json(
      {
        error:
          'Enter valid move-in and property allocation dates before approval.',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    !reg.street_id
  ) {
    return NextResponse.json(
      {
        error:
          'This registration does not have a valid street.',
      },
      {
        status:
          400,
      }
    )
  }

  const email =
    String(
      reg.email ??
        ''
    )
      .trim()
      .toLowerCase()

  if (
    !email
  ) {
    return NextResponse.json(
      {
        error:
          'This registration does not have a valid email address.',
      },
      {
        status:
          400,
      }
    )
  }

  const fullName =
    [
      reg.first_name,
      reg.other_names,
      reg.surname,
    ]
      .map(
        (
          value
        ) =>
          String(
            value ??
              ''
          ).trim()
      )
      .filter(
        Boolean
      )
      .join(
        ' '
      )

  if (
    !fullName
  ) {
    return NextResponse.json(
      {
        error:
          'This registration does not contain a valid resident name.',
      },
      {
        status:
          400,
      }
    )
  }

  /*
   * This lookup has no side effects, so it can safely
   * happen before claiming the registration.
   */
  const {
    data:
      duplicateResident,

    error:
      duplicateLookupError,
  } =
    await service
      .from(
        'residents'
      )
      .select(
        'id, full_name, auth_user_id'
      )
      .eq(
        'is_active',
        true
      )
      .ilike(
        'email',
        email
      )
      .limit(
        1
      )
      .maybeSingle()

  if (
    duplicateLookupError
  ) {
    return NextResponse.json(
      {
        error:
          'Could not verify whether this resident already exists.',
      },
      {
        status:
          500,
      }
    )
  }

  if (
    duplicateResident
  ) {
    return NextResponse.json(
      {
        error:
          `An active resident already uses this email address${
            duplicateResident.full_name
              ? `: ${duplicateResident.full_name}`
              : ''
          }.`,
      },
      {
        status:
          409,
      }
    )
  }

  /*
   * Atomically claim this pending registration before
   * any provisioning side effects occur.
   */
  const {
    data:
      claimResult,

    error:
      claimError,
  } =
    await service.rpc(
      'claim_registration_approval',
      {
        p_registration:
          id,

        p_admin:
          admin.id,

        p_claim_token:
          approvalClaimToken,
      }
    )

  if (
    claimError
  ) {
    const message =
      claimError.message ??
      ''

    if (
      message.includes(
        'claim_registration_approval'
      ) ||
      message.includes(
        'schema cache'
      )
    ) {
      return NextResponse.json(
        {
          error:
            'The registration approval claim migration has not been applied yet.',
        },
        {
          status:
            503,
        }
      )
    }

    return NextResponse.json(
      {
        error:
          'Could not secure this registration for approval.',
      },
      {
        status:
          500,
      }
    )
  }

  const claim =
    (
      claimResult ??
      null
    ) as
      | {
          claimed?:
            boolean

          reason?:
            string

          status?:
            string
        }
      | null

  if (
    claim?.claimed !==
    true
  ) {
    if (
      claim?.reason ===
      'not_found'
    ) {
      return NextResponse.json(
        {
          error:
            'Registration request not found',
        },
        {
          status:
            404,
        }
      )
    }

    if (
      claim?.reason ===
      'in_progress'
    ) {
      return NextResponse.json(
        {
          error:
            'Another administrator is already approving this registration. Please wait and refresh before trying again.',
        },
        {
          status:
            409,
        }
      )
    }

    if (
      claim?.reason ===
      'already_reviewed'
    ) {
      return NextResponse.json(
        {
          error:
            'This registration was reviewed while you were opening it. Refresh the registration list.',
        },
        {
          status:
            409,
        }
      )
    }

    return NextResponse.json(
      {
        error:
          'This registration could not be claimed for approval.',
      },
      {
        status:
          409,
      }
    )
  }

  /*
   * Resolve the canonical physical property only after
   * the approval claim has been secured.
   */
  const {
    data:
      houseId,

    error:
      houseError,
  } =
    await service.rpc(
      'resolve_registration_house',
      {
        p_street_id:
          reg.street_id,

        p_house_number:
          reg.house_number,

        p_house_type:
          reg.house_type,
      }
    )

  if (
    houseError ||
    typeof houseId !==
      'string'
  ) {
    await releaseApprovalClaim()

    const rawMessage =
      houseError?.message ??
      ''

    if (
      rawMessage.includes(
        'resolve_registration_house'
      ) ||
      rawMessage.includes(
        'schema cache'
      )
    ) {
      return NextResponse.json(
        {
          error:
            'The registration database migration has not been applied yet. Run the database migrations in Supabase, then try again.',
        },
        {
          status:
            503,
        }
      )
    }

    return NextResponse.json(
      {
        error:
          rawMessage ||
          'Could not resolve the property',
      },
      {
        status:
          400,
      }
    )
  }

  /*
   * Only one active Home Owner may exist for a house.
   */
  if (
    reg.relationship ===
    'owner'
  ) {
    const {
      data:
        existingOwner,

      error:
        ownerLookupError,
    } =
      await service
        .from(
          'residents'
        )
        .select(
          'id, full_name'
        )
        .eq(
          'house_id',
          houseId
        )
        .eq(
          'relationship',
          'owner'
        )
        .eq(
          'is_active',
          true
        )
        .limit(
          1
        )
        .maybeSingle()

    if (
      ownerLookupError
    ) {
      await releaseApprovalClaim()

      return NextResponse.json(
        {
          error:
            'Could not verify the existing Home Owner for this property.',
        },
        {
          status:
            500,
        }
      )
    }

    if (
      existingOwner
    ) {
      await releaseApprovalClaim()

      return NextResponse.json(
        {
          error:
            `House ${reg.house_number} already has an active Home Owner: ${existingOwner.full_name}. Change this applicant to Tenant or Family Member if appropriate.`,
        },
        {
          status:
            409,
        }
      )
    }
  }

  const qrValue =
    `RES-${crypto.randomUUID()}`

  /*
   * Create the estate resident first.
   * auth_user_id remains NULL until the Auth invite
   * has been verified.
   */
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
      .insert({
        house_id:
          houseId,

        full_name:
          fullName,

        phone:
          reg.phone,

        email,

        relationship:
          reg.relationship,

        block_number:
          reg.block_number ??
          null,

        flat_number:
          reg.flat_number ??
          null,

        vehicle_plate_numbers:
          reg
            .vehicle_plate_numbers ??
          null,

        emergency_contact_name:
          reg
            .emergency_contact_name ??
          null,

        emergency_contact_phone:
          reg
            .emergency_contact_phone ??
          null,

        ...dates.data,

        qr_code_value:
          qrValue,
      })
      .select(
        'id, email, full_name'
      )
      .single()

  if (
    residentError ||
    !resident
  ) {
    await releaseApprovalClaim()

    return NextResponse.json(
      {
        error:
          residentError
            ?.message ??
          'Could not create resident',
      },
      {
        status:
          residentError
            ?.code ===
          '23505'
            ? 409
            : 500,
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
    const rollback =
      await releaseAfterSafeRollback({
        residentId:
          resident.id,
      })

    return NextResponse.json(
      {
        error:
          rollback.ok
            ? 'NEXT_PUBLIC_SITE_URL is not configured. Resident approval was not completed.'
            : 'NEXT_PUBLIC_SITE_URL is not configured and the incomplete resident account could not be fully rolled back.',

        rollback:
          rollback.ok
            ? undefined
            : rollback.errors,
      },
      {
        status:
          500,
      }
    )
  }

  /*
   * A newly approved resident uses the INVITE flow.
   * New accounts must go to /set-password.
   */
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
        email,
        {
          redirectTo:
            `${siteUrl}/set-password`,
        }
      )

  if (
    inviteError ||
    !invited.user
  ) {
    const rollback =
      await releaseAfterSafeRollback({
        residentId:
          resident.id,
      })

    return NextResponse.json(
      {
        error:
          rollback.ok
            ? (
                inviteError
                  ?.message ??
                'Could not send the portal invitation'
              )
            : 'The portal invitation failed and the incomplete resident account could not be fully rolled back.',

        rollback:
          rollback.ok
            ? undefined
            : rollback.errors,
      },
      {
        status:
          500,
      }
    )
  }

  const authUserId =
    invited.user.id

  /*
   * Account-isolation safety.
   */
  const invitedEmail =
    invited.user.email
      ?.trim()
      .toLowerCase()

  if (
    !invitedEmail ||
    invitedEmail !==
      email
  ) {
    const rollback =
      await releaseAfterSafeRollback({
        residentId:
          resident.id,

        authUserId,
      })

    return NextResponse.json(
      {
        error:
          rollback.ok
            ? 'The portal account email did not match the resident email. No resident login was linked.'
            : 'The portal account identity did not match and the incomplete account could not be fully rolled back.',

        rollback:
          rollback.ok
            ? undefined
            : rollback.errors,
      },
      {
        status:
          500,
      }
    )
  }

  /*
   * Link only the resident created by this request to
   * the exact Auth user returned by Supabase.
   *
   * Returning the updated row prevents a zero-row
   * conditional update from being mistaken for success.
   */
  const {
    data:
      linkedUpdate,

    error:
      linkError,
  } =
    await service
      .from(
        'residents'
      )
      .update({
        auth_user_id:
          authUserId,
      })
      .eq(
        'id',
        resident.id
      )
      .is(
        'auth_user_id',
        null
      )
      .select(
        'id, email, auth_user_id'
      )
      .maybeSingle()

  if (
    linkError ||
    !linkedUpdate ||
    linkedUpdate
      .auth_user_id !==
      authUserId
  ) {
    const rollback =
      await releaseAfterSafeRollback({
        residentId:
          resident.id,

        authUserId,
      })

    return NextResponse.json(
      {
        error:
          rollback.ok
            ? 'The invitation was created, but the resident account could not be linked safely. The incomplete account was rolled back.'
            : 'The resident account could not be linked and the incomplete account could not be fully rolled back.',

        rollback:
          rollback.ok
            ? undefined
            : rollback.errors,
      },
      {
        status:
          500,
      }
    )
  }

  /*
   * Confirm the relationship with a separate read.
   */
  const {
    data:
      linkedResident,

    error:
      linkedResidentError,
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
        resident.id
      )
      .single()

  if (
    linkedResidentError ||
    !linkedResident ||
    linkedResident
      .auth_user_id !==
      authUserId ||
    linkedResident.email
      ?.trim()
      .toLowerCase() !==
      email
  ) {
    const rollback =
      await releaseAfterSafeRollback({
        residentId:
          resident.id,

        authUserId,
      })

    return NextResponse.json(
      {
        error:
          rollback.ok
            ? 'Resident account verification failed after invitation. The incomplete account was rolled back.'
            : 'Resident account verification failed and the incomplete account could not be fully rolled back.',

        rollback:
          rollback.ok
            ? undefined
            : rollback.errors,
      },
      {
        status:
          500,
      }
    )
  }

  const reviewedAt =
    new Date()
      .toISOString()

  /*
   * The final approval is conditional on:
   *
   * 1. the registration still being pending, and
   * 2. this request still owning the approval claim.
   */
  const {
    data:
      approvalResult,

    error:
      approvalError,
  } =
    await service
      .from(
        'registration_requests'
      )
      .update({
        status:
          'approved',

        ...dates.data,

        reviewed_by:
          admin.id,

        reviewed_at:
          reviewedAt,

        created_resident_id:
          resident.id,
      })
      .eq(
        'id',
        id
      )
      .eq(
        'status',
        'pending'
      )
      .eq(
        'approval_claim_token',
        approvalClaimToken
      )
      .select(
        'id, status, created_resident_id'
      )
      .maybeSingle()

  let approvalConfirmed =
    !approvalError &&
    approvalResult
      ?.status ===
      'approved' &&
    approvalResult
      .created_resident_id ===
      resident.id

  /*
   * A transport/PostgREST failure does not necessarily
   * prove the UPDATE failed in PostgreSQL.
   *
   * Verify before deleting anything.
   */
  if (
    !approvalConfirmed
  ) {
    const {
      data:
        currentRegistration,

      error:
        verificationError,
    } =
      await service
        .from(
          'registration_requests'
        )
        .select(
          'id, status, created_resident_id, approval_claim_token'
        )
        .eq(
          'id',
          id
        )
        .maybeSingle()

    if (
      !verificationError &&
      currentRegistration
        ?.status ===
        'approved' &&
      currentRegistration
        .created_resident_id ===
        resident.id
    ) {
      approvalConfirmed =
        true
    } else if (
      verificationError
    ) {
      /*
       * State is genuinely uncertain.
       *
       * Never delete the account here because the
       * approval may already have committed.
       */
      return NextResponse.json(
        {
          error:
            'The resident account was created, but the final registration approval could not be verified. Do not retry immediately. Refresh the registration list first.',

          approvalState:
            'unknown',

          residentId:
            resident.id,

          authUserId,
        },
        {
          status:
            500,
        }
      )
    } else if (
      currentRegistration
        ?.status ===
        'approved'
    ) {
      /*
       * Another approval won with another resident.
       * Remove this request's duplicate account.
       */
      const rollback =
        await rollbackProvisionedAccount({
          residentId:
            resident.id,

          authUserId,
        })

      return NextResponse.json(
        {
          error:
            rollback.ok
              ? 'This registration was approved by another request before this approval completed.'
              : 'This registration was approved elsewhere and the duplicate account could not be fully rolled back.',

          rollback:
            rollback.ok
              ? undefined
              : rollback.errors,
        },
        {
          status:
            409,
        }
      )
    } else {
      /*
       * PostgreSQL confirms our approval did not commit.
       * Rollback is therefore safe.
       */
      const rollback =
        await rollbackProvisionedAccount({
          residentId:
            resident.id,

          authUserId,
        })

      if (
        rollback.ok &&
        currentRegistration
          ?.status ===
          'pending' &&
        currentRegistration
          .approval_claim_token ===
          approvalClaimToken
      ) {
        await releaseApprovalClaim()
      }

      return NextResponse.json(
        {
          error:
            rollback.ok
              ? currentRegistration
                  ?.status ===
                  'pending'
                ? 'Saving the registration approval failed. The incomplete resident account was rolled back safely. You can retry the approval.'
                : 'The registration was reviewed before this approval could complete. The incomplete account was rolled back.'
              : 'Saving the registration approval failed and the incomplete account could not be fully rolled back.',

          rollback:
            rollback.ok
              ? undefined
              : rollback.errors,
        },
        {
          status:
            currentRegistration &&
            currentRegistration
              .status !==
              'pending'
              ? 409
              : 500,
        }
      )
    }
  }

  /*
   * The status trigger clears the approval claim
   * automatically once approval succeeds.
   */
  const sms =
    await queueRegistrationSms({
      registrationId:
        id,

      phone:
        reg.phone ??
        '',
    })

  return NextResponse.json({
    email,

    residentName:
      fullName,

    houseId,

    authUserId,

    sms,

    alreadyApproved:
      false,
  })
}