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

type FinalizationResult = {
  finalized?: boolean
  already_finalized?: boolean
  reason?: string
  status?: string
  registration_id?: string
  resident_id?: string
  auth_user_id?: string
  house_id?: string
}

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
    await supabase
      .auth
      .getUser()

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

    if (error) {
      console.error(
        'Could not release registration approval claim:',
        error.message
      )

      return false
    }

    return data ===
      true
  }

  /*
   * Delete the resident before deleting the Auth account.
   *
   * This is safer than the previous Auth-first rollback because
   * residents.auth_user_id has a foreign key to auth.users.
   */
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

      /*
       * Do not delete the Auth user if the resident could not be
       * removed. The resident may still reference that user.
       */
      return {
        ok:
          false,

        errors,
      }
    }

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
   * Retry after a completed approval.
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
          existingResident
            .phone ??
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
          input
            .data
            .move_in_date ??
          reg.move_in_date,

        property_allocation_date:
          input
            .data
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
   * Claim the registration before any provisioning side effect.
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
   * Resolve/reuse the property and create the resident in one
   * database transaction.
   */
  const {
    data:
      provisionResult,

    error:
      provisionError,
  } =
    await service.rpc(
      'provision_registration_resident',
      {
        p_street_id:
          reg.street_id,

        p_house_number:
          reg.house_number,

        p_house_type:
          reg.house_type,

        p_resident: {
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
            [],

          emergency_contact_name:
            reg
              .emergency_contact_name ??
            null,

          emergency_contact_phone:
            reg
              .emergency_contact_phone ??
            null,

          move_in_date:
            dates
              .data
              .move_in_date,

          property_allocation_date:
            dates
              .data
              .property_allocation_date,
        },
      }
    )

  if (
    provisionError
  ) {
    await releaseApprovalClaim()

    const rawMessage =
      provisionError.message ??
      ''

    if (
      rawMessage.includes(
        'provision_registration_resident'
      ) ||
      rawMessage.includes(
        'create_estate_resident_record'
      ) ||
      rawMessage.includes(
        'schema cache'
      )
    ) {
      return NextResponse.json(
        {
          error:
            'The resident creation migration has not been applied yet. Run the database migrations in Supabase, then try again.',
        },
        {
          status:
            503,
        }
      )
    }

    const conflict =
      provisionError.code ===
        '23505' ||
      rawMessage.includes(
        'already uses this email address'
      ) ||
      rawMessage.includes(
        'already has an active Home Owner'
      )

    const validation =
      [
        'Select a street',
        'Street not found',
        'Select a valid house number',
        'House number must be between 1 and 50',
        'Household not found',
        'Enter the resident name',
        'Phone number must contain only numbers',
        'Enter a valid email address',
        'Select a resident status',
        'Block number must be between 1 and 10',
        'Flat number must be between 1 and 10',
        'Enter a valid emergency contact phone number',
        'Move-in date and property allocation date are required',
        'Vehicle plate numbers must be an array',
      ].some(
        (
          message
        ) =>
          rawMessage.includes(
            message
          )
      )

    return NextResponse.json(
      {
        error:
          rawMessage ||
          'Could not create resident',
      },
      {
        status:
          conflict
            ? 409
            : validation
              ? 400
              : 500,
      }
    )
  }

  const provision =
    (
      provisionResult ??
      null
    ) as
      | {
          house_id?:
            unknown

          resident_id?:
            unknown
        }
      | null

  const houseId =
    typeof provision
      ?.house_id ===
    'string'
      ? provision.house_id
      : null

  const residentId =
    typeof provision
      ?.resident_id ===
    'string'
      ? provision.resident_id
      : null

  if (
    !houseId ||
    !residentId
  ) {
    await releaseApprovalClaim()

    return NextResponse.json(
      {
        error:
          'The resident account could not be created safely.',
      },
      {
        status:
          500,
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
        residentId,
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
   * Supabase Auth remains the only unavoidable external step.
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
        residentId,
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
        residentId,
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
   * Atomically:
   *
   *   1. link resident -> Auth user
   *   2. mark registration approved
   *
   * There is no DB-visible half-state between these operations.
   */
  const {
    data:
      finalizationResult,

    error:
      finalizationError,
  } =
    await service.rpc(
      'finalize_registration_approval',
      {
        p_registration:
          id,

        p_admin:
          admin.id,

        p_claim_token:
          approvalClaimToken,

        p_resident:
          residentId,

        p_auth_user:
          authUserId,

        p_email:
          email,

        p_move_in_date:
          dates
            .data
            .move_in_date,

        p_property_allocation_date:
          dates
            .data
            .property_allocation_date,
      }
    )

  const finalization =
    (
      finalizationResult ??
      null
    ) as
      | FinalizationResult
      | null

  let finalizationConfirmed =
    !finalizationError &&
    finalization
      ?.finalized ===
      true

  /*
   * A transport failure does not prove PostgreSQL rolled back.
   *
   * Verify current state before deleting anything.
   */
  if (
    !finalizationConfirmed
  ) {
    const [
      registrationState,
      residentState,
    ] =
      await Promise.all([
        service
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
          .maybeSingle(),

        service
          .from(
            'residents'
          )
          .select(
            'id, email, house_id, auth_user_id'
          )
          .eq(
            'id',
            residentId
          )
          .maybeSingle(),
      ])

    /*
     * If either verification read fails, state is uncertain.
     * Never compensate destructively in an uncertain state.
     */
    if (
      registrationState.error ||
      residentState.error
    ) {
      return NextResponse.json(
        {
          error:
            'The resident account was provisioned, but final registration approval could not be verified. Do not retry immediately. Refresh the registration list first.',

          approvalState:
            'unknown',

          residentId,

          authUserId,
        },
        {
          status:
            500,
        }
      )
    }

    const currentRegistration =
      registrationState.data

    const currentResident =
      residentState.data

    if (
      currentRegistration
        ?.status ===
        'approved' &&
      currentRegistration
        .created_resident_id ===
        residentId &&
      currentResident
        ?.auth_user_id ===
        authUserId &&
      currentResident
        .email
        ?.trim()
        .toLowerCase() ===
        email
    ) {
      finalizationConfirmed =
        true
    } else if (
      currentRegistration
        ?.status ===
        'approved'
    ) {
      /*
       * Another approval completed first.
       *
       * Our resident/Auth pair is not the winning account and
       * can therefore be safely cleaned up.
       */
      const rollback =
        await rollbackProvisionedAccount({
          residentId,
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
       * PostgreSQL confirms the atomic finalization did not
       * commit. Rollback is now safe.
       */
      const rollback =
        await rollbackProvisionedAccount({
          residentId,
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

      const reason =
        finalization
          ?.reason

      const conflict =
        [
          'already_reviewed',
          'claim_lost',
          'resident_conflict',
          'approved_identity_mismatch',
          'auth_user_conflict',
          'auth_user_in_use',
        ].includes(
          reason ??
          ''
        )

      return NextResponse.json(
        {
          error:
            rollback.ok
              ? conflict
                ? 'The registration changed while approval was being completed. The incomplete account was rolled back safely. Refresh and review the registration again.'
                : 'Saving the registration approval failed. The incomplete resident account was rolled back safely. You can retry the approval.'
              : 'Saving the registration approval failed and the incomplete account could not be fully rolled back.',

          rollback:
            rollback.ok
              ? undefined
              : rollback.errors,
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
    !finalizationConfirmed
  ) {
    return NextResponse.json(
      {
        error:
          'The registration approval could not be confirmed.',
      },
      {
        status:
          500,
      }
    )
  }

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
      finalization
        ?.already_finalized ===
        true,
  })
}