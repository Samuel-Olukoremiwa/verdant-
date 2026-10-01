BEGIN;

-- ============================================================
-- ATOMIC REGISTRATION FINALIZATION
--
-- The registration approval workflow crosses two systems:
--
--   1. Supabase Auth
--   2. PostgreSQL
--
-- Auth invitation must still happen outside PostgreSQL.
-- However, after Auth returns the new user ID, all remaining
-- database state is now committed atomically here:
--
--   * verify the approval claim
--   * verify the resident
--   * link residents.auth_user_id
--   * mark registration approved
--   * record reviewer and dates
--   * record created_resident_id
--
-- Either every DB change commits or none does.
--
-- The function is service-role only.
-- ============================================================


CREATE OR REPLACE FUNCTION
  public.finalize_registration_approval(
    p_registration uuid,
    p_admin uuid,
    p_claim_token uuid,
    p_resident uuid,
    p_auth_user uuid,
    p_email text,
    p_move_in_date date,
    p_property_allocation_date date
  )
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_registration
    public.registration_requests%rowtype;

  v_resident
    public.residents%rowtype;

  v_admin_role text;

  v_email text;

  v_rows integer :=
    0;

  v_constraint text;
BEGIN
  IF
    p_registration IS NULL
    OR p_admin IS NULL
    OR p_claim_token IS NULL
    OR p_resident IS NULL
    OR p_auth_user IS NULL
  THEN
    RAISE EXCEPTION
      'Missing registration finalization identifiers';
  END IF;

  IF
    p_move_in_date IS NULL
    OR p_property_allocation_date IS NULL
  THEN
    RAISE EXCEPTION
      'Move-in date and property allocation date are required';
  END IF;

  v_email :=
    lower(
      btrim(
        coalesce(
          p_email,
          ''
        )
      )
    );

  IF
    v_email = ''
    OR v_email !~
      '^[^ @]+@[^ @]+\.[^ @]+$'
  THEN
    RAISE EXCEPTION
      'Enter a valid email address';
  END IF;

  SELECT
    role

  INTO
    v_admin_role

  FROM public.admins

  WHERE id =
    p_admin;

  IF
    coalesce(
      v_admin_role,
      ''
    ) NOT IN (
      'admin',
      'super_admin'
    )
  THEN
    RAISE EXCEPTION
      'Not authorized';
  END IF;


  -- ==========================================================
  -- LOCK THE REGISTRATION
  -- ==========================================================

  SELECT
    *

  INTO
    v_registration

  FROM public.registration_requests

  WHERE id =
    p_registration

  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN
      jsonb_build_object(
        'finalized',
        false,

        'reason',
        'not_found'
      );
  END IF;


  -- ==========================================================
  -- IDEMPOTENT RETRY
  --
  -- A transport failure may occur after PostgreSQL commits.
  -- Repeating the finalizer for the same resident/Auth pair
  -- must therefore return success instead of creating another
  -- state transition.
  -- ==========================================================

  IF
    v_registration.status =
      'approved'
  THEN
    IF
      v_registration
        .created_resident_id
      IS DISTINCT FROM
        p_resident
    THEN
      RETURN
        jsonb_build_object(
          'finalized',
          false,

          'reason',
          'already_reviewed',

          'status',
          v_registration.status
        );
    END IF;

    SELECT
      *

    INTO
      v_resident

    FROM public.residents

    WHERE id =
      p_resident

    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN
        jsonb_build_object(
          'finalized',
          false,

          'reason',
          'resident_not_found'
        );
    END IF;

    IF
      lower(
        btrim(
          coalesce(
            v_resident.email,
            ''
          )
        )
      ) =
        v_email

      AND
        v_resident.auth_user_id =
        p_auth_user
    THEN
      RETURN
        jsonb_build_object(
          'finalized',
          true,

          'already_finalized',
          true,

          'registration_id',
          p_registration,

          'resident_id',
          p_resident,

          'auth_user_id',
          p_auth_user,

          'house_id',
          v_resident.house_id
        );
    END IF;

    RETURN
      jsonb_build_object(
        'finalized',
        false,

        'reason',
        'approved_identity_mismatch'
      );
  END IF;


  IF
    v_registration.status
    IS DISTINCT FROM
      'pending'
  THEN
    RETURN
      jsonb_build_object(
        'finalized',
        false,

        'reason',
        'already_reviewed',

        'status',
        v_registration.status
      );
  END IF;


  -- ==========================================================
  -- VERIFY CLAIM OWNERSHIP
  -- ==========================================================

  IF
    v_registration
      .approval_claim_token
    IS DISTINCT FROM
      p_claim_token

    OR
      v_registration
        .approval_claimed_by
      IS DISTINCT FROM
        p_admin
  THEN
    RETURN
      jsonb_build_object(
        'finalized',
        false,

        'reason',
        'claim_lost'
      );
  END IF;


  IF
    v_registration
      .created_resident_id
    IS NOT NULL

    AND
      v_registration
        .created_resident_id
      IS DISTINCT FROM
        p_resident
  THEN
    RETURN
      jsonb_build_object(
        'finalized',
        false,

        'reason',
        'resident_conflict'
      );
  END IF;


  -- ==========================================================
  -- LOCK + VERIFY RESIDENT
  -- ==========================================================

  SELECT
    *

  INTO
    v_resident

  FROM public.residents

  WHERE id =
    p_resident

  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN
      jsonb_build_object(
        'finalized',
        false,

        'reason',
        'resident_not_found'
      );
  END IF;


  IF
    lower(
      btrim(
        coalesce(
          v_resident.email,
          ''
        )
      )
    ) <>
      v_email
  THEN
    RETURN
      jsonb_build_object(
        'finalized',
        false,

        'reason',
        'email_mismatch'
      );
  END IF;


  /*
   * Normally auth_user_id is still NULL.
   *
   * Allow the same Auth ID as well so the function can safely
   * heal/retry a compatible previous state.
   */
  IF
    v_resident.auth_user_id
    IS NOT NULL

    AND
      v_resident.auth_user_id
      IS DISTINCT FROM
        p_auth_user
  THEN
    RETURN
      jsonb_build_object(
        'finalized',
        false,

        'reason',
        'auth_user_conflict'
      );
  END IF;


  -- ==========================================================
  -- LINK AUTH USER
  --
  -- The existing FK to auth.users confirms that p_auth_user
  -- actually exists.
  --
  -- The existing unique index prevents one Auth user from
  -- being linked to multiple residents.
  -- ==========================================================

  BEGIN
    UPDATE public.residents

    SET
      auth_user_id =
        p_auth_user

    WHERE
      id =
        p_resident

      AND (
        auth_user_id
          IS NULL

        OR
          auth_user_id =
          p_auth_user
      );

    GET DIAGNOSTICS
      v_rows =
        ROW_COUNT;

  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS
        v_constraint =
          CONSTRAINT_NAME;

      IF
        v_constraint =
          'address_integrity_resident_auth_user'
      THEN
        RETURN
          jsonb_build_object(
            'finalized',
            false,

            'reason',
            'auth_user_in_use'
          );
      END IF;

      RAISE;
  END;


  IF
    v_rows <>
      1
  THEN
    RETURN
      jsonb_build_object(
        'finalized',
        false,

        'reason',
        'resident_link_failed'
      );
  END IF;


  -- ==========================================================
  -- FINALIZE REGISTRATION
  --
  -- The existing clear_registration_approval_claim trigger
  -- automatically clears:
  --
  --   approval_claimed_by
  --   approval_claim_token
  --   approval_claimed_at
  --
  -- when status changes away from pending.
  -- ==========================================================

  UPDATE public.registration_requests

  SET
    status =
      'approved',

    move_in_date =
      p_move_in_date,

    property_allocation_date =
      p_property_allocation_date,

    reviewed_by =
      p_admin,

    reviewed_at =
      now(),

    created_resident_id =
      p_resident

  WHERE
    id =
      p_registration

    AND status =
      'pending'

    AND approval_claim_token =
      p_claim_token

    AND approval_claimed_by =
      p_admin;

  GET DIAGNOSTICS
    v_rows =
      ROW_COUNT;


  IF
    v_rows <>
      1
  THEN
    /*
     * Raising instead of returning is deliberate.
     *
     * It rolls the earlier resident Auth link back as part of
     * the same PostgreSQL transaction.
     */
    RAISE EXCEPTION
      'Registration finalization state changed unexpectedly';
  END IF;


  RETURN
    jsonb_build_object(
      'finalized',
      true,

      'already_finalized',
      false,

      'registration_id',
      p_registration,

      'resident_id',
      p_resident,

      'auth_user_id',
      p_auth_user,

      'house_id',
      v_resident.house_id
    );
END;
$function$;


REVOKE EXECUTE
ON FUNCTION
  public.finalize_registration_approval(
    uuid,
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    date,
    date
  )
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION
  public.finalize_registration_approval(
    uuid,
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    date,
    date
  )
FROM anon;

REVOKE EXECUTE
ON FUNCTION
  public.finalize_registration_approval(
    uuid,
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    date,
    date
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.finalize_registration_approval(
    uuid,
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    date,
    date
  )
TO service_role;


COMMIT;