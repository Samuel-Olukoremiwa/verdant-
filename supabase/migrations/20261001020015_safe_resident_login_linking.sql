BEGIN;

-- ============================================================
-- SAFE RESIDENT LOGIN LINKING
--
-- Admin-created resident logins previously used:
--
--   1. Supabase Auth invite
--   2. direct UPDATE residents.auth_user_id
--
-- The Auth invitation is necessarily external to PostgreSQL,
-- but the database-side link is now centralized in one
-- service-role-only, retry-safe function.
--
-- The function:
--
--   * locks the resident row
--   * verifies the resident email
--   * allows an exact retry of the same Auth link
--   * refuses replacement of an existing different Auth user
--   * preserves the unique one-Auth-user-per-resident rule
--   * returns structured outcomes to the API route
-- ============================================================


CREATE OR REPLACE FUNCTION
  public.link_resident_auth_user(
    p_resident uuid,
    p_auth_user uuid,
    p_email text
  )
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resident
    public.residents%rowtype;

  v_email text;

  v_rows integer :=
    0;

  v_constraint text;
BEGIN
  IF
    p_resident IS NULL
    OR p_auth_user IS NULL
  THEN
    RAISE EXCEPTION
      'Missing resident login identifiers';
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
        'linked',
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
        'linked',
        false,

        'reason',
        'email_mismatch'
      );
  END IF;


  -- ==========================================================
  -- IDEMPOTENT RETRY
  -- ==========================================================

  IF
    v_resident.auth_user_id =
      p_auth_user
  THEN
    RETURN
      jsonb_build_object(
        'linked',
        true,

        'already_linked',
        true,

        'resident_id',
        p_resident,

        'auth_user_id',
        p_auth_user,

        'email',
        v_email
      );
  END IF;


  IF
    v_resident.auth_user_id
    IS NOT NULL
  THEN
    RETURN
      jsonb_build_object(
        'linked',
        false,

        'reason',
        'resident_already_linked',

        'existing_auth_user_id',
        v_resident.auth_user_id
      );
  END IF;


  -- ==========================================================
  -- LINK AUTH USER
  --
  -- residents_auth_user_id_fkey proves the Auth user exists.
  --
  -- address_integrity_resident_auth_user prevents one Auth
  -- account from being attached to more than one resident.
  -- ==========================================================

  BEGIN
    UPDATE public.residents

    SET
      auth_user_id =
        p_auth_user

    WHERE
      id =
        p_resident

      AND auth_user_id
        IS NULL;

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
            'linked',
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
    /*
     * This should only occur if another transaction changed
     * the resident while this request was being processed.
     */
    RETURN
      jsonb_build_object(
        'linked',
        false,

        'reason',
        'link_state_changed'
      );
  END IF;


  RETURN
    jsonb_build_object(
      'linked',
      true,

      'already_linked',
      false,

      'resident_id',
      p_resident,

      'auth_user_id',
      p_auth_user,

      'email',
      v_email
    );
END;
$function$;


REVOKE EXECUTE
ON FUNCTION
  public.link_resident_auth_user(
    uuid,
    uuid,
    text
  )
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION
  public.link_resident_auth_user(
    uuid,
    uuid,
    text
  )
FROM anon;

REVOKE EXECUTE
ON FUNCTION
  public.link_resident_auth_user(
    uuid,
    uuid,
    text
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.link_resident_auth_user(
    uuid,
    uuid,
    text
  )
TO service_role;


COMMIT;