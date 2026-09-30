-- ZADANT
-- Reconstructs the original registration_requests base table that exists
-- in production but was previously missing from the repository migration chain.
--
-- Run after:
--   schema.sql
--   auth.sql
--   migration_phase1_6_repairs.sql
--
-- Later migrations add consent, dates, block/flat, vehicles,
-- emergency contacts and stricter registration rules.
--
-- Safe on an existing database.

BEGIN;

CREATE TABLE IF NOT EXISTS public.registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  surname text NOT NULL,

  first_name text NOT NULL,

  other_names text,

  phone text NOT NULL,

  email text NOT NULL,

  street_id uuid
    REFERENCES public.streets(id),

  house_number text NOT NULL,

  house_type text,

  relationship text
    DEFAULT 'owner',

  status text
    DEFAULT 'pending',

  decline_reason text,

  reviewed_by uuid
    REFERENCES public.admins(id),

  reviewed_at timestamptz,

  created_resident_id uuid
    REFERENCES public.residents(id),

  created_at timestamptz
    DEFAULT now()
);

-- Preserve the database-level validation currently present in production.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid =
      'public.registration_requests'::regclass
      AND conname =
        'registration_phone_format'
  ) THEN
    ALTER TABLE
      public.registration_requests

    ADD CONSTRAINT
      registration_phone_format

    CHECK (
      phone ~
      '^[0-9+[:space:]-]{7,15}$'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid =
      'public.registration_requests'::regclass
      AND conname =
        'registration_email_format'
  ) THEN
    ALTER TABLE
      public.registration_requests

    ADD CONSTRAINT
      registration_email_format

    CHECK (
      email ~
      '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    );
  END IF;
END
$$;

ALTER TABLE
  public.registration_requests
ENABLE ROW LEVEL SECURITY;

-- Registration administration is restricted to estate administrators.
DROP POLICY IF EXISTS
  "admins manage registration requests"
ON public.registration_requests;

CREATE POLICY
  "admins manage registration requests"
ON public.registration_requests
FOR ALL
TO authenticated
USING (
  public.is_estate_admin()
)
WITH CHECK (
  public.is_estate_admin()
);

-- Public registrations now go through the validated server API,
-- which uses the service role.
REVOKE ALL
ON public.registration_requests
FROM anon;

REVOKE INSERT
ON public.registration_requests
FROM authenticated;

GRANT
  SELECT,
  UPDATE,
  DELETE
ON public.registration_requests
TO authenticated;

GRANT
  SELECT,
  INSERT,
  UPDATE,
  DELETE
ON public.registration_requests
TO service_role;

COMMIT;