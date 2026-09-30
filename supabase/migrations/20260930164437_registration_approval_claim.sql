-- ============================================================
-- HISTORICAL MIGRATION BRIDGE
--
-- Registration approval claiming was deployed before the
-- tracked production migration history captured this change.
--
-- Production already contains this schema.
-- ============================================================

BEGIN;

-- ============================================================
-- REGISTRATION APPROVAL CLAIMING
--
-- Prevent two administrators from provisioning the same
-- pending registration at the same time.
--
-- Claims automatically expire after 15 minutes so a crashed
-- server request cannot permanently lock a registration.
-- ============================================================

ALTER TABLE public.registration_requests
  ADD COLUMN IF NOT EXISTS approval_claimed_by uuid
    REFERENCES public.admins(id)
    ON DELETE SET NULL;

ALTER TABLE public.registration_requests
  ADD COLUMN IF NOT EXISTS approval_claim_token uuid;

ALTER TABLE public.registration_requests
  ADD COLUMN IF NOT EXISTS approval_claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS
  idx_registration_requests_approval_claim
ON public.registration_requests (
  approval_claimed_at
)
WHERE approval_claim_token IS NOT NULL;

-- ============================================================
-- CLAIM A REGISTRATION FOR APPROVAL
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_registration_approval(
  p_registration uuid,
  p_admin uuid,
  p_claim_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_existing_token uuid;
  v_claimed_at timestamptz;
  v_admin_role text;
BEGIN
  IF p_claim_token IS NULL THEN
    RAISE EXCEPTION
      'Missing approval claim token';
  END IF;

  SELECT role
  INTO v_admin_role
  FROM public.admins
  WHERE id = p_admin;

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

  /*
   * Lock the registration row while deciding
   * whether this request may claim it.
   */
  SELECT
    status,
    approval_claim_token,
    approval_claimed_at
  INTO
    v_status,
    v_existing_token,
    v_claimed_at
  FROM public.registration_requests
  WHERE id = p_registration
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'claimed',
      false,
      'reason',
      'not_found'
    );
  END IF;

  IF v_status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object(
      'claimed',
      false,
      'reason',
      'already_reviewed',
      'status',
      v_status
    );
  END IF;

  /*
   * The same token may safely reclaim its own
   * registration. A different active token blocks.
   */
  IF
    v_existing_token IS NOT NULL
    AND v_existing_token IS DISTINCT FROM p_claim_token
    AND v_claimed_at IS NOT NULL
    AND v_claimed_at >
      now() - interval '15 minutes'
  THEN
    RETURN jsonb_build_object(
      'claimed',
      false,
      'reason',
      'in_progress',
      'claimed_at',
      v_claimed_at
    );
  END IF;

  UPDATE public.registration_requests
  SET
    approval_claimed_by = p_admin,
    approval_claim_token = p_claim_token,
    approval_claimed_at = now()
  WHERE id = p_registration;

  RETURN jsonb_build_object(
    'claimed',
    true,
    'reason',
    'claimed'
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.claim_registration_approval(
  uuid,
  uuid,
  uuid
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.claim_registration_approval(
  uuid,
  uuid,
  uuid
)
TO service_role;

-- ============================================================
-- RELEASE AN APPROVAL CLAIM
-- ============================================================

CREATE OR REPLACE FUNCTION public.release_registration_approval_claim(
  p_registration uuid,
  p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  UPDATE public.registration_requests
  SET
    approval_claimed_by = NULL,
    approval_claim_token = NULL,
    approval_claimed_at = NULL
  WHERE id = p_registration
    AND approval_claim_token = p_claim_token;

  GET DIAGNOSTICS
    v_rows = ROW_COUNT;

  RETURN v_rows = 1;
END;
$$;

REVOKE ALL
ON FUNCTION public.release_registration_approval_claim(
  uuid,
  uuid
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.release_registration_approval_claim(
  uuid,
  uuid
)
TO service_role;

-- ============================================================
-- CLEAR CLAIM WHEN REVIEW IS COMPLETED
--
-- Approval and decline both clear any outstanding claim.
-- ============================================================

CREATE OR REPLACE FUNCTION public.clear_registration_approval_claim()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    NEW.approval_claimed_by = NULL;
    NEW.approval_claim_token = NULL;
    NEW.approval_claimed_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.clear_registration_approval_claim()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS
  clear_registration_approval_claim
ON public.registration_requests;

CREATE TRIGGER
  clear_registration_approval_claim
BEFORE UPDATE OF status
ON public.registration_requests
FOR EACH ROW
EXECUTE FUNCTION
  public.clear_registration_approval_claim();

NOTIFY pgrst, 'reload schema';

COMMIT;