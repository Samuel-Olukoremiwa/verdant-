BEGIN;

-- ============================================================
-- ATOMIC REGISTRATION DECLINE
--
-- A decline and an approval must never race each other.
--
-- If an approval claim is still active, decline is blocked.
-- If the claim has expired, decline is allowed and the
-- existing status trigger clears the stale claim.
-- ============================================================

CREATE OR REPLACE FUNCTION public.decline_registration_request(
  p_registration uuid,
  p_admin uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;

  v_claim_token uuid;

  v_claimed_at timestamptz;

  v_admin_role text;

  v_reason text :=
    btrim(
      coalesce(
        p_reason,
        ''
      )
    );
BEGIN
  -- ----------------------------------------------------------
  -- Validate the administrator.
  -- ----------------------------------------------------------

  SELECT role
  INTO v_admin_role
  FROM public.admins
  WHERE id =
    p_admin;

  IF coalesce(
    v_admin_role,
    ''
  ) NOT IN (
    'admin',
    'super_admin'
  ) THEN
    RAISE EXCEPTION
      'Not authorized';
  END IF;

  -- ----------------------------------------------------------
  -- Enforce the same decline reason rules as the application.
  -- ----------------------------------------------------------

  IF char_length(
    v_reason
  ) < 3 THEN
    RAISE EXCEPTION
      'Decline reason is required';
  END IF;

  IF char_length(
    v_reason
  ) > 500 THEN
    RAISE EXCEPTION
      'Decline reason must be 500 characters or fewer';
  END IF;

  -- ----------------------------------------------------------
  -- Lock the registration row.
  --
  -- This makes the status + approval-claim decision atomic.
  -- ----------------------------------------------------------

  SELECT
    status,
    approval_claim_token,
    approval_claimed_at

  INTO
    v_status,
    v_claim_token,
    v_claimed_at

  FROM public.registration_requests

  WHERE id =
    p_registration

  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'declined',
      false,

      'reason',
      'not_found'
    );
  END IF;

  -- ----------------------------------------------------------
  -- Only pending registrations may be declined.
  -- ----------------------------------------------------------

  IF v_status IS DISTINCT FROM
    'pending'
  THEN
    RETURN jsonb_build_object(
      'declined',
      false,

      'reason',
      'already_reviewed',

      'status',
      v_status
    );
  END IF;

  -- ----------------------------------------------------------
  -- An active approval owns this registration for 15 minutes.
  --
  -- Do not decline it while account provisioning is underway.
  -- ----------------------------------------------------------

  IF
    v_claim_token IS NOT NULL
    AND v_claimed_at IS NOT NULL
    AND v_claimed_at >
      now() - interval '15 minutes'
  THEN
    RETURN jsonb_build_object(
      'declined',
      false,

      'reason',
      'approval_in_progress',

      'claimed_at',
      v_claimed_at
    );
  END IF;

  -- ----------------------------------------------------------
  -- Decline atomically.
  --
  -- The clear_registration_approval_claim trigger created in
  -- Phase 5B clears any stale claim automatically because
  -- status changes away from pending.
  -- ----------------------------------------------------------

  UPDATE public.registration_requests

  SET
    status =
      'declined',

    decline_reason =
      v_reason,

    reviewed_by =
      p_admin,

    reviewed_at =
      now()

  WHERE id =
    p_registration;

  RETURN jsonb_build_object(
    'declined',
    true,

    'reason',
    'declined'
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.decline_registration_request(
  uuid,
  uuid,
  text
)
FROM
  PUBLIC,
  anon,
  authenticated;

GRANT EXECUTE
ON FUNCTION public.decline_registration_request(
  uuid,
  uuid,
  text
)
TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;