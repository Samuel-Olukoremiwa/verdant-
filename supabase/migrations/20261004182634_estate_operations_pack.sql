BEGIN;

-- ============================================================
-- ESTATE OPERATIONS PACK
--
-- Adds:
--   1. Gate revenue / external Paystack payments
--   2. In-app announcements
--   3. Emergency incident tracking
--   4. Visitor check-out / currently-inside tracking
--   5. Admin reporting helpers for gate revenue and income
--
-- This migration is intentionally additive. Existing resident,
-- invoice, payment, visitor, and reporting data is preserved.
-- ============================================================


-- ============================================================
-- SHARED UPDATED-AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_estate_operations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.set_estate_operations_updated_at()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.set_estate_operations_updated_at()
FROM anon;

REVOKE ALL
ON FUNCTION public.set_estate_operations_updated_at()
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.set_estate_operations_updated_at()
TO service_role;


-- ============================================================
-- 1. GATE REVENUE / EXTERNAL PAYMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gate_charge_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  name text NOT NULL,
  description text,
  amount numeric(12,2) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,

  created_by uuid
    REFERENCES public.admins(id)
    ON DELETE SET NULL,

  updated_by uuid
    REFERENCES public.admins(id)
    ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gate_charge_types_name_not_blank
    CHECK (btrim(name) <> ''),

  CONSTRAINT gate_charge_types_name_length
    CHECK (char_length(btrim(name)) <= 120),

  CONSTRAINT gate_charge_types_description_length
    CHECK (description IS NULL OR char_length(description) <= 500),

  CONSTRAINT gate_charge_types_amount_positive
    CHECK (amount > 0),

  CONSTRAINT gate_charge_types_sort_order_nonnegative
    CHECK (sort_order >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS gate_charge_types_name_unique
ON public.gate_charge_types (lower(btrim(name)));

CREATE INDEX IF NOT EXISTS gate_charge_types_active_sort_idx
ON public.gate_charge_types (active, sort_order, name);

CREATE INDEX IF NOT EXISTS gate_charge_types_created_by_idx
ON public.gate_charge_types (created_by)
WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS gate_charge_types_updated_by_idx
ON public.gate_charge_types (updated_by)
WHERE updated_by IS NOT NULL;

DROP TRIGGER IF EXISTS gate_charge_types_touch_updated_at
ON public.gate_charge_types;

CREATE TRIGGER gate_charge_types_touch_updated_at
BEFORE UPDATE ON public.gate_charge_types
FOR EACH ROW
EXECUTE FUNCTION public.set_estate_operations_updated_at();

ALTER TABLE public.gate_charge_types
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estate staff view gate charge types"
ON public.gate_charge_types;

CREATE POLICY "estate staff view gate charge types"
ON public.gate_charge_types
FOR SELECT
TO authenticated
USING (
  (SELECT public.is_estate_staff())
);

REVOKE ALL
ON public.gate_charge_types
FROM PUBLIC;

REVOKE ALL
ON public.gate_charge_types
FROM anon;

REVOKE ALL
ON public.gate_charge_types
FROM authenticated;

GRANT SELECT
ON public.gate_charge_types
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.gate_charge_types
TO service_role;


CREATE SEQUENCE IF NOT EXISTS public.gate_payment_code_seq;

REVOKE ALL
ON SEQUENCE public.gate_payment_code_seq
FROM PUBLIC;

REVOKE ALL
ON SEQUENCE public.gate_payment_code_seq
FROM anon;

REVOKE ALL
ON SEQUENCE public.gate_payment_code_seq
FROM authenticated;

GRANT USAGE, SELECT
ON SEQUENCE public.gate_payment_code_seq
TO service_role;


CREATE TABLE IF NOT EXISTS public.gate_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  payment_code text NOT NULL UNIQUE DEFAULT (
    'GATE-' ||
    to_char(
      now() AT TIME ZONE 'Africa/Lagos',
      'YYYYMM'
    ) ||
    '-' ||
    lpad(
      nextval('public.gate_payment_code_seq'::regclass)::text,
      6,
      '0'
    )
  ),

  reference text NOT NULL UNIQUE,

  gate_charge_type_id uuid NOT NULL
    REFERENCES public.gate_charge_types(id)
    ON DELETE RESTRICT,

  charge_name text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',

  payer_name text NOT NULL,
  payer_email text NOT NULL,
  payer_phone text NOT NULL,
  company_name text,
  vehicle_plate text,
  host_reference text,
  purpose_note text,

  provider text NOT NULL DEFAULT 'paystack',
  provider_transaction_id text,
  status text NOT NULL DEFAULT 'pending',

  paid_at timestamptz,
  confirmed_at timestamptz,

  admitted_at timestamptz,
  admitted_by uuid
    REFERENCES public.admins(id)
    ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gate_payments_reference_not_blank
    CHECK (btrim(reference) <> ''),

  CONSTRAINT gate_payments_charge_name_not_blank
    CHECK (btrim(charge_name) <> ''),

  CONSTRAINT gate_payments_amount_positive
    CHECK (amount > 0),

  CONSTRAINT gate_payments_currency_ngn
    CHECK (currency = 'NGN'),

  CONSTRAINT gate_payments_payer_name_length
    CHECK (
      char_length(btrim(payer_name)) BETWEEN 2 AND 120
    ),

  CONSTRAINT gate_payments_payer_email_format
    CHECK (
      payer_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    ),

  CONSTRAINT gate_payments_payer_phone_format
    CHECK (
      payer_phone ~ '^[0-9+[:space:]-]{7,20}$'
    ),

  CONSTRAINT gate_payments_company_name_length
    CHECK (
      company_name IS NULL OR char_length(company_name) <= 160
    ),

  CONSTRAINT gate_payments_vehicle_plate_length
    CHECK (
      vehicle_plate IS NULL OR char_length(vehicle_plate) <= 40
    ),

  CONSTRAINT gate_payments_host_reference_length
    CHECK (
      host_reference IS NULL OR char_length(host_reference) <= 160
    ),

  CONSTRAINT gate_payments_purpose_note_length
    CHECK (
      purpose_note IS NULL OR char_length(purpose_note) <= 500
    ),

  CONSTRAINT gate_payments_provider_check
    CHECK (provider = 'paystack'),

  CONSTRAINT gate_payments_status_check
    CHECK (
      status IN (
        'pending',
        'success',
        'failed',
        'abandoned'
      )
    ),

  CONSTRAINT gate_payments_success_requires_paid_at
    CHECK (
      status <> 'success' OR paid_at IS NOT NULL
    ),

  CONSTRAINT gate_payments_admission_requires_success
    CHECK (
      admitted_at IS NULL OR status = 'success'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS gate_payments_provider_transaction_unique
ON public.gate_payments (provider_transaction_id)
WHERE provider_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS gate_payments_charge_type_idx
ON public.gate_payments (gate_charge_type_id);

CREATE INDEX IF NOT EXISTS gate_payments_status_paid_idx
ON public.gate_payments (status, paid_at DESC);

CREATE INDEX IF NOT EXISTS gate_payments_created_idx
ON public.gate_payments (created_at DESC);

CREATE INDEX IF NOT EXISTS gate_payments_admitted_by_idx
ON public.gate_payments (admitted_by)
WHERE admitted_by IS NOT NULL;

DROP TRIGGER IF EXISTS gate_payments_touch_updated_at
ON public.gate_payments;

CREATE TRIGGER gate_payments_touch_updated_at
BEFORE UPDATE ON public.gate_payments
FOR EACH ROW
EXECUTE FUNCTION public.set_estate_operations_updated_at();

ALTER TABLE public.gate_payments
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estate staff view gate payments"
ON public.gate_payments;

CREATE POLICY "estate staff view gate payments"
ON public.gate_payments
FOR SELECT
TO authenticated
USING (
  (SELECT public.is_estate_staff())
);

REVOKE ALL
ON public.gate_payments
FROM PUBLIC;

REVOKE ALL
ON public.gate_payments
FROM anon;

REVOKE ALL
ON public.gate_payments
FROM authenticated;

GRANT SELECT
ON public.gate_payments
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.gate_payments
TO service_role;


-- Public callers never invoke this directly. The Next.js public payment
-- endpoint calls it with the server-side service client after its own
-- validation / rate limiting. The database remains the source of truth
-- for the amount charged.
CREATE OR REPLACE FUNCTION public.prepare_gate_payment(
  p_charge_type uuid,
  p_payer_name text,
  p_payer_email text,
  p_payer_phone text,
  p_company_name text DEFAULT NULL,
  p_vehicle_plate text DEFAULT NULL,
  p_host_reference text DEFAULT NULL,
  p_purpose_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_charge public.gate_charge_types;
  v_payment public.gate_payments;
  v_reference text;
BEGIN
  IF p_charge_type IS NULL THEN
    RAISE EXCEPTION 'Choose what you are paying for';
  END IF;

  IF char_length(btrim(coalesce(p_payer_name, ''))) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Enter a valid payer name';
  END IF;

  IF coalesce(p_payer_email, '') !~
    '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  THEN
    RAISE EXCEPTION 'Enter a valid email address';
  END IF;

  IF coalesce(p_payer_phone, '') !~
    '^[0-9+[:space:]-]{7,20}$'
  THEN
    RAISE EXCEPTION 'Enter a valid phone number';
  END IF;

  IF p_company_name IS NOT NULL
    AND char_length(btrim(p_company_name)) > 160
  THEN
    RAISE EXCEPTION 'Company name is too long';
  END IF;

  IF p_vehicle_plate IS NOT NULL
    AND char_length(btrim(p_vehicle_plate)) > 40
  THEN
    RAISE EXCEPTION 'Vehicle plate is too long';
  END IF;

  IF p_host_reference IS NOT NULL
    AND char_length(btrim(p_host_reference)) > 160
  THEN
    RAISE EXCEPTION 'Host or house reference is too long';
  END IF;

  IF p_purpose_note IS NOT NULL
    AND char_length(btrim(p_purpose_note)) > 500
  THEN
    RAISE EXCEPTION 'Purpose note is too long';
  END IF;

  SELECT *
  INTO v_charge
  FROM public.gate_charge_types
  WHERE id = p_charge_type
    AND active IS TRUE;

  IF v_charge.id IS NULL THEN
    RAISE EXCEPTION 'This gate charge is not available';
  END IF;

  v_reference :=
    'GATE-' ||
    replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.gate_payments (
    reference,
    gate_charge_type_id,
    charge_name,
    amount,
    payer_name,
    payer_email,
    payer_phone,
    company_name,
    vehicle_plate,
    host_reference,
    purpose_note
  )
  VALUES (
    v_reference,
    v_charge.id,
    btrim(v_charge.name),
    v_charge.amount,
    btrim(p_payer_name),
    lower(btrim(p_payer_email)),
    btrim(p_payer_phone),
    nullif(btrim(coalesce(p_company_name, '')), ''),
    nullif(upper(btrim(coalesce(p_vehicle_plate, ''))), ''),
    nullif(btrim(coalesce(p_host_reference, '')), ''),
    nullif(btrim(coalesce(p_purpose_note, '')), '')
  )
  RETURNING *
  INTO v_payment;

  RETURN jsonb_build_object(
    'id', v_payment.id,
    'reference', v_payment.reference,
    'payment_code', v_payment.payment_code,
    'charge_name', v_payment.charge_name,
    'amount', v_payment.amount,
    'amount_kobo', round(v_payment.amount * 100)::bigint,
    'currency', v_payment.currency,
    'payer_email', v_payment.payer_email
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.prepare_gate_payment(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.prepare_gate_payment(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
)
FROM anon;

REVOKE ALL
ON FUNCTION public.prepare_gate_payment(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
)
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.prepare_gate_payment(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
)
TO service_role;


CREATE OR REPLACE FUNCTION public.confirm_gate_payment(
  p_reference text,
  p_amount_kobo bigint,
  p_currency text,
  p_paid_at timestamptz,
  p_provider_transaction_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.gate_payments;
  v_expected_kobo bigint;
BEGIN
  IF btrim(coalesce(p_reference, '')) = '' THEN
    RAISE EXCEPTION 'Payment reference is required';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.gate_payments
  WHERE reference = btrim(p_reference)
  FOR UPDATE;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Gate payment not found';
  END IF;

  v_expected_kobo :=
    round(v_payment.amount * 100)::bigint;

  IF upper(coalesce(p_currency, '')) <> 'NGN' THEN
    RAISE EXCEPTION 'Payment currency mismatch';
  END IF;

  IF p_amount_kobo IS NULL
    OR p_amount_kobo <> v_expected_kobo
  THEN
    RAISE EXCEPTION 'Payment amount mismatch';
  END IF;

  IF v_payment.status = 'success' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_confirmed', true,
      'id', v_payment.id,
      'payment_code', v_payment.payment_code,
      'reference', v_payment.reference,
      'charge_name', v_payment.charge_name,
      'amount', v_payment.amount,
      'paid_at', v_payment.paid_at
    );
  END IF;

  UPDATE public.gate_payments
  SET
    status = 'success',
    paid_at = coalesce(p_paid_at, clock_timestamp()),
    confirmed_at = clock_timestamp(),
    provider_transaction_id = coalesce(
      nullif(btrim(coalesce(p_provider_transaction_id, '')), ''),
      provider_transaction_id
    )
  WHERE id = v_payment.id
  RETURNING *
  INTO v_payment;

  RETURN jsonb_build_object(
    'ok', true,
    'already_confirmed', false,
    'id', v_payment.id,
    'payment_code', v_payment.payment_code,
    'reference', v_payment.reference,
    'charge_name', v_payment.charge_name,
    'amount', v_payment.amount,
    'paid_at', v_payment.paid_at
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.confirm_gate_payment(
  text,
  bigint,
  text,
  timestamptz,
  text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.confirm_gate_payment(
  text,
  bigint,
  text,
  timestamptz,
  text
)
FROM anon;

REVOKE ALL
ON FUNCTION public.confirm_gate_payment(
  text,
  bigint,
  text,
  timestamptz,
  text
)
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.confirm_gate_payment(
  text,
  bigint,
  text,
  timestamptz,
  text
)
TO service_role;


-- Gate staff can consume a successful payment once at admission.
-- A repeated scan returns the existing admission state instead of
-- creating a second admission.
CREATE OR REPLACE FUNCTION public.admit_gate_payment(
  p_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff public.admins;
  v_payment public.gate_payments;
BEGIN
  SELECT *
  INTO v_staff
  FROM public.admins
  WHERE auth_user_id = auth.uid()
    AND role IN ('admin', 'super_admin', 'gate_staff')
  ORDER BY id
  LIMIT 1;

  IF v_staff.id IS NULL THEN
    RAISE EXCEPTION 'Only estate staff can admit gate payments'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.gate_payments
  WHERE reference = btrim(coalesce(p_reference, ''))
     OR payment_code = upper(btrim(coalesce(p_reference, '')))
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Gate payment not found';
  END IF;

  IF v_payment.status <> 'success' THEN
    RAISE EXCEPTION 'This gate payment has not been verified';
  END IF;

  IF v_payment.admitted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_admitted', true,
      'id', v_payment.id,
      'payment_code', v_payment.payment_code,
      'reference', v_payment.reference,
      'charge_name', v_payment.charge_name,
      'amount', v_payment.amount,
      'payer_name', v_payment.payer_name,
      'company_name', v_payment.company_name,
      'vehicle_plate', v_payment.vehicle_plate,
      'host_reference', v_payment.host_reference,
      'paid_at', v_payment.paid_at,
      'admitted_at', v_payment.admitted_at
    );
  END IF;

  UPDATE public.gate_payments
  SET
    admitted_at = clock_timestamp(),
    admitted_by = v_staff.id
  WHERE id = v_payment.id
  RETURNING *
  INTO v_payment;

  RETURN jsonb_build_object(
    'ok', true,
    'already_admitted', false,
    'id', v_payment.id,
    'payment_code', v_payment.payment_code,
    'reference', v_payment.reference,
    'charge_name', v_payment.charge_name,
    'amount', v_payment.amount,
    'payer_name', v_payment.payer_name,
    'company_name', v_payment.company_name,
    'vehicle_plate', v_payment.vehicle_plate,
    'host_reference', v_payment.host_reference,
    'paid_at', v_payment.paid_at,
    'admitted_at', v_payment.admitted_at
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.admit_gate_payment(text)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.admit_gate_payment(text)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.admit_gate_payment(text)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.admit_gate_payment(text)
TO service_role;


-- ============================================================
-- 2. ANNOUNCEMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  title text NOT NULL,
  body text NOT NULL,

  priority text NOT NULL DEFAULT 'normal',
  audience text NOT NULL DEFAULT 'all',

  street_id uuid
    REFERENCES public.streets(id)
    ON DELETE CASCADE,

  house_id uuid
    REFERENCES public.houses(id)
    ON DELETE CASCADE,

  pinned boolean NOT NULL DEFAULT false,
  publish_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,

  created_by uuid
    REFERENCES public.admins(id)
    ON DELETE SET NULL,

  updated_by uuid
    REFERENCES public.admins(id)
    ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT announcements_title_not_blank
    CHECK (btrim(title) <> ''),

  CONSTRAINT announcements_title_length
    CHECK (char_length(btrim(title)) <= 160),

  CONSTRAINT announcements_body_not_blank
    CHECK (btrim(body) <> ''),

  CONSTRAINT announcements_body_length
    CHECK (char_length(body) <= 5000),

  CONSTRAINT announcements_priority_check
    CHECK (
      priority IN (
        'normal',
        'important',
        'urgent',
        'emergency'
      )
    ),

  CONSTRAINT announcements_audience_check
    CHECK (
      audience IN (
        'all',
        'residents',
        'staff',
        'street',
        'household'
      )
    ),

  CONSTRAINT announcements_expiry_after_publish
    CHECK (
      expires_at IS NULL OR expires_at > publish_at
    ),

  CONSTRAINT announcements_target_matches_audience
    CHECK (
      (
        audience = 'street'
        AND street_id IS NOT NULL
        AND house_id IS NULL
      )
      OR
      (
        audience = 'household'
        AND house_id IS NOT NULL
        AND street_id IS NULL
      )
      OR
      (
        audience IN ('all', 'residents', 'staff')
        AND street_id IS NULL
        AND house_id IS NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS announcements_publish_idx
ON public.announcements (
  pinned DESC,
  publish_at DESC
);

CREATE INDEX IF NOT EXISTS announcements_street_idx
ON public.announcements (street_id)
WHERE street_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS announcements_house_idx
ON public.announcements (house_id)
WHERE house_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS announcements_created_by_idx
ON public.announcements (created_by)
WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS announcements_updated_by_idx
ON public.announcements (updated_by)
WHERE updated_by IS NOT NULL;

DROP TRIGGER IF EXISTS announcements_touch_updated_at
ON public.announcements;

CREATE TRIGGER announcements_touch_updated_at
BEFORE UPDATE ON public.announcements
FOR EACH ROW
EXECUTE FUNCTION public.set_estate_operations_updated_at();

ALTER TABLE public.announcements
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authorized users view announcements"
ON public.announcements;

CREATE POLICY "authorized users view announcements"
ON public.announcements
FOR SELECT
TO authenticated
USING (
  (SELECT public.is_estate_admin())
  OR
  (
    publish_at <= clock_timestamp()
    AND (
      expires_at IS NULL
      OR expires_at > clock_timestamp()
    )
    AND (
      (
        audience = 'all'
        AND (
          (SELECT public.is_estate_staff())
          OR EXISTS (
            SELECT 1
            FROM public.residents r
            WHERE r.auth_user_id = (SELECT auth.uid())
              AND r.is_active IS TRUE
          )
        )
      )
      OR
      (
        audience = 'residents'
        AND EXISTS (
          SELECT 1
          FROM public.residents r
          WHERE r.auth_user_id = (SELECT auth.uid())
            AND r.is_active IS TRUE
        )
      )
      OR
      (
        audience = 'staff'
        AND (SELECT public.is_estate_staff())
      )
      OR
      (
        audience = 'street'
        AND EXISTS (
          SELECT 1
          FROM public.residents r
          JOIN public.houses h
            ON h.id = r.house_id
          WHERE r.auth_user_id = (SELECT auth.uid())
            AND r.is_active IS TRUE
            AND h.street_id = announcements.street_id
        )
      )
      OR
      (
        audience = 'household'
        AND EXISTS (
          SELECT 1
          FROM public.residents r
          WHERE r.auth_user_id = (SELECT auth.uid())
            AND r.is_active IS TRUE
            AND r.house_id = announcements.house_id
        )
      )
    )
  )
);

REVOKE ALL
ON public.announcements
FROM PUBLIC;

REVOKE ALL
ON public.announcements
FROM anon;

REVOKE ALL
ON public.announcements
FROM authenticated;

GRANT SELECT
ON public.announcements
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.announcements
TO service_role;


-- ============================================================
-- 3. EMERGENCY INCIDENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.emergency_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  resident_id uuid NOT NULL
    REFERENCES public.residents(id)
    ON DELETE RESTRICT,

  house_id uuid NOT NULL
    REFERENCES public.houses(id)
    ON DELETE RESTRICT,

  category text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open',

  raised_at timestamptz NOT NULL DEFAULT now(),

  acknowledged_at timestamptz,
  acknowledged_by uuid
    REFERENCES public.admins(id)
    ON DELETE SET NULL,

  responding_at timestamptz,
  responding_by uuid
    REFERENCES public.admins(id)
    ON DELETE SET NULL,

  resolved_at timestamptz,
  resolved_by uuid
    REFERENCES public.admins(id)
    ON DELETE SET NULL,

  resolution_note text,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT emergency_incidents_category_check
    CHECK (
      category IN (
        'security',
        'medical',
        'fire',
        'accident',
        'suspicious_activity',
        'other'
      )
    ),

  CONSTRAINT emergency_incidents_details_length
    CHECK (
      details IS NULL OR char_length(details) <= 1500
    ),

  CONSTRAINT emergency_incidents_status_check
    CHECK (
      status IN (
        'open',
        'acknowledged',
        'responding',
        'resolved',
        'false_alarm'
      )
    ),

  CONSTRAINT emergency_incidents_resolution_note_length
    CHECK (
      resolution_note IS NULL OR char_length(resolution_note) <= 2000
    ),

  CONSTRAINT emergency_incidents_resolved_fields_check
    CHECK (
      (
        status IN ('resolved', 'false_alarm')
        AND resolved_at IS NOT NULL
      )
      OR
      (
        status NOT IN ('resolved', 'false_alarm')
        AND resolved_at IS NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS emergency_incidents_status_raised_idx
ON public.emergency_incidents (status, raised_at DESC);

CREATE INDEX IF NOT EXISTS emergency_incidents_resident_raised_idx
ON public.emergency_incidents (resident_id, raised_at DESC);

CREATE INDEX IF NOT EXISTS emergency_incidents_house_idx
ON public.emergency_incidents (house_id);

CREATE INDEX IF NOT EXISTS emergency_incidents_ack_by_idx
ON public.emergency_incidents (acknowledged_by)
WHERE acknowledged_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS emergency_incidents_responding_by_idx
ON public.emergency_incidents (responding_by)
WHERE responding_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS emergency_incidents_resolved_by_idx
ON public.emergency_incidents (resolved_by)
WHERE resolved_by IS NOT NULL;

DROP TRIGGER IF EXISTS emergency_incidents_touch_updated_at
ON public.emergency_incidents;

CREATE TRIGGER emergency_incidents_touch_updated_at
BEFORE UPDATE ON public.emergency_incidents
FOR EACH ROW
EXECUTE FUNCTION public.set_estate_operations_updated_at();

ALTER TABLE public.emergency_incidents
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authorized users view emergency incidents"
ON public.emergency_incidents;

CREATE POLICY "authorized users view emergency incidents"
ON public.emergency_incidents
FOR SELECT
TO authenticated
USING (
  (SELECT public.is_estate_staff())
  OR EXISTS (
    SELECT 1
    FROM public.residents r
    WHERE r.id = emergency_incidents.resident_id
      AND r.auth_user_id = (SELECT auth.uid())
      AND r.is_active IS TRUE
  )
);

REVOKE ALL
ON public.emergency_incidents
FROM PUBLIC;

REVOKE ALL
ON public.emergency_incidents
FROM anon;

REVOKE ALL
ON public.emergency_incidents
FROM authenticated;

GRANT SELECT
ON public.emergency_incidents
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.emergency_incidents
TO service_role;


CREATE OR REPLACE FUNCTION public.raise_emergency_incident(
  p_category text,
  p_details text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_resident public.residents;
  v_existing public.emergency_incidents;
  v_incident public.emergency_incidents;
BEGIN
  SELECT *
  INTO v_resident
  FROM public.residents
  WHERE auth_user_id = auth.uid()
    AND is_active IS TRUE
  ORDER BY id
  LIMIT 1;

  IF v_resident.id IS NULL OR v_resident.house_id IS NULL THEN
    RAISE EXCEPTION 'An active resident with a house is required'
      USING ERRCODE = '42501';
  END IF;

  IF p_category NOT IN (
    'security',
    'medical',
    'fire',
    'accident',
    'suspicious_activity',
    'other'
  ) THEN
    RAISE EXCEPTION 'Choose a valid emergency type';
  END IF;

  IF p_details IS NOT NULL
    AND char_length(btrim(p_details)) > 1500
  THEN
    RAISE EXCEPTION 'Emergency details are too long';
  END IF;

  -- Protect against accidental double taps / request retries.
  SELECT *
  INTO v_existing
  FROM public.emergency_incidents
  WHERE resident_id = v_resident.id
    AND category = p_category
    AND status IN ('open', 'acknowledged', 'responding')
    AND raised_at >= clock_timestamp() - interval '60 seconds'
  ORDER BY raised_at DESC
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'duplicate_suppressed', true,
      'id', v_existing.id,
      'status', v_existing.status,
      'category', v_existing.category,
      'raised_at', v_existing.raised_at
    );
  END IF;

  INSERT INTO public.emergency_incidents (
    resident_id,
    house_id,
    category,
    details
  )
  VALUES (
    v_resident.id,
    v_resident.house_id,
    p_category,
    nullif(btrim(coalesce(p_details, '')), '')
  )
  RETURNING *
  INTO v_incident;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate_suppressed', false,
    'id', v_incident.id,
    'status', v_incident.status,
    'category', v_incident.category,
    'raised_at', v_incident.raised_at
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.raise_emergency_incident(text, text)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.raise_emergency_incident(text, text)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.raise_emergency_incident(text, text)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.raise_emergency_incident(text, text)
TO service_role;


CREATE OR REPLACE FUNCTION public.update_emergency_incident(
  p_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff public.admins;
  v_incident public.emergency_incidents;
BEGIN
  SELECT *
  INTO v_staff
  FROM public.admins
  WHERE auth_user_id = auth.uid()
    AND role IN ('admin', 'super_admin', 'gate_staff')
  ORDER BY id
  LIMIT 1;

  IF v_staff.id IS NULL THEN
    RAISE EXCEPTION 'Only estate staff can update emergency incidents'
      USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN (
    'acknowledged',
    'responding',
    'resolved',
    'false_alarm'
  ) THEN
    RAISE EXCEPTION 'Choose a valid emergency status';
  END IF;

  IF p_note IS NOT NULL
    AND char_length(btrim(p_note)) > 2000
  THEN
    RAISE EXCEPTION 'Emergency note is too long';
  END IF;

  IF p_status IN ('resolved', 'false_alarm')
    AND btrim(coalesce(p_note, '')) = ''
  THEN
    RAISE EXCEPTION 'A resolution note is required';
  END IF;

  SELECT *
  INTO v_incident
  FROM public.emergency_incidents
  WHERE id = p_id
  FOR UPDATE;

  IF v_incident.id IS NULL THEN
    RAISE EXCEPTION 'Emergency incident not found';
  END IF;

  IF v_incident.status IN ('resolved', 'false_alarm') THEN
    IF v_incident.status = p_status THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_updated', true,
        'id', v_incident.id,
        'status', v_incident.status,
        'updated_at', v_incident.updated_at
      );
    END IF;

    RAISE EXCEPTION 'This emergency incident is already closed';
  END IF;

  IF v_incident.status = 'responding'
    AND p_status = 'acknowledged'
  THEN
    RAISE EXCEPTION 'Emergency status cannot move backwards';
  END IF;

  UPDATE public.emergency_incidents
  SET
    status = p_status,

    acknowledged_at = CASE
      WHEN p_status IN (
        'acknowledged',
        'responding',
        'resolved',
        'false_alarm'
      )
      THEN coalesce(acknowledged_at, clock_timestamp())
      ELSE acknowledged_at
    END,

    acknowledged_by = CASE
      WHEN p_status IN (
        'acknowledged',
        'responding',
        'resolved',
        'false_alarm'
      )
      THEN coalesce(acknowledged_by, v_staff.id)
      ELSE acknowledged_by
    END,

    responding_at = CASE
      WHEN p_status = 'responding'
      THEN coalesce(responding_at, clock_timestamp())
      ELSE responding_at
    END,

    responding_by = CASE
      WHEN p_status = 'responding'
      THEN coalesce(responding_by, v_staff.id)
      ELSE responding_by
    END,

    resolved_at = CASE
      WHEN p_status IN ('resolved', 'false_alarm')
      THEN clock_timestamp()
      ELSE NULL
    END,

    resolved_by = CASE
      WHEN p_status IN ('resolved', 'false_alarm')
      THEN v_staff.id
      ELSE NULL
    END,

    resolution_note = CASE
      WHEN p_status IN ('resolved', 'false_alarm')
      THEN btrim(p_note)
      ELSE resolution_note
    END
  WHERE id = v_incident.id
  RETURNING *
  INTO v_incident;

  RETURN jsonb_build_object(
    'ok', true,
    'already_updated', false,
    'id', v_incident.id,
    'status', v_incident.status,
    'acknowledged_at', v_incident.acknowledged_at,
    'responding_at', v_incident.responding_at,
    'resolved_at', v_incident.resolved_at,
    'updated_at', v_incident.updated_at
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.update_emergency_incident(uuid, text, text)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.update_emergency_incident(uuid, text, text)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.update_emergency_incident(uuid, text, text)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.update_emergency_incident(uuid, text, text)
TO service_role;


-- ============================================================
-- 4. VISITOR CHECK-OUT
-- ============================================================

ALTER TABLE public.visitor_passes
ADD COLUMN IF NOT EXISTS checked_out_at timestamptz;

ALTER TABLE public.visitor_passes
ADD COLUMN IF NOT EXISTS checked_out_by uuid
REFERENCES public.admins(id)
ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.visitor_passes'::regclass
      AND conname = 'visitor_passes_checkout_requires_entry'
  ) THEN
    ALTER TABLE public.visitor_passes
    ADD CONSTRAINT visitor_passes_checkout_requires_entry
    CHECK (
      checked_out_at IS NULL
      OR (
        redeemed_at IS NOT NULL
        AND checked_out_at >= redeemed_at
      )
    );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS visitor_passes_inside_idx
ON public.visitor_passes (redeemed_at DESC)
WHERE redeemed_at IS NOT NULL
  AND checked_out_at IS NULL
  AND cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS visitor_passes_checked_out_by_idx
ON public.visitor_passes (checked_out_by)
WHERE checked_out_by IS NOT NULL;


CREATE OR REPLACE FUNCTION public.checkout_visitor_pass(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff public.admins;
  v_pass public.visitor_passes;
  v_host public.residents;
BEGIN
  SELECT *
  INTO v_staff
  FROM public.admins
  WHERE auth_user_id = auth.uid()
    AND role IN ('admin', 'super_admin', 'gate_staff')
  ORDER BY id
  LIMIT 1;

  IF v_staff.id IS NULL THEN
    RAISE EXCEPTION 'Only estate staff can check visitors out'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_pass
  FROM public.visitor_passes
  WHERE id = p_id
  FOR UPDATE;

  IF v_pass.id IS NULL THEN
    RAISE EXCEPTION 'Visitor pass not found';
  END IF;

  IF v_pass.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'This visitor pass was cancelled';
  END IF;

  IF v_pass.redeemed_at IS NULL THEN
    RAISE EXCEPTION 'This visitor has not checked in';
  END IF;

  SELECT *
  INTO v_host
  FROM public.residents
  WHERE id = v_pass.resident_id;

  IF v_pass.checked_out_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_checked_out', true,
      'id', v_pass.id,
      'visitor', v_pass.visitor_name,
      'host', coalesce(v_host.full_name, 'Resident'),
      'address', v_pass.address,
      'checked_in_at', v_pass.redeemed_at,
      'checked_out_at', v_pass.checked_out_at
    );
  END IF;

  UPDATE public.visitor_passes
  SET
    checked_out_at = clock_timestamp(),
    checked_out_by = v_staff.id
  WHERE id = v_pass.id
  RETURNING *
  INTO v_pass;

  RETURN jsonb_build_object(
    'ok', true,
    'already_checked_out', false,
    'id', v_pass.id,
    'visitor', v_pass.visitor_name,
    'host', coalesce(v_host.full_name, 'Resident'),
    'address', v_pass.address,
    'checked_in_at', v_pass.redeemed_at,
    'checked_out_at', v_pass.checked_out_at
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.checkout_visitor_pass(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.checkout_visitor_pass(uuid)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.checkout_visitor_pass(uuid)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.checkout_visitor_pass(uuid)
TO service_role;


-- ============================================================
-- 5. GATE REVENUE REPORTING
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_gate_revenue_page(
  p_from date,
  p_to date,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Only estate administrators can view reports'
      USING ERRCODE = '42501';
  END IF;

  IF p_from IS NULL
    OR p_to IS NULL
    OR p_to < p_from
  THEN
    RAISE EXCEPTION 'Invalid report date range';
  END IF;

  IF p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'Report page size must be between 1 and 500';
  END IF;

  IF p_offset < 0 THEN
    RAISE EXCEPTION 'Report offset cannot be negative';
  END IF;

  WITH base AS (
    SELECT
      gp.id,
      gp.paid_at,
      gp.amount::numeric AS amount,
      jsonb_build_object(
        'house',
          coalesce(
            nullif(gp.company_name, ''),
            gp.payer_name
          ),
        'charge',
          gp.charge_name,
        'period',
          coalesce(
            nullif(gp.vehicle_plate, ''),
            nullif(gp.host_reference, ''),
            'Gate / external'
          ),
        'amount',
          gp.amount,
        'date',
          gp.paid_at,
        'reference',
          gp.payment_code
      ) AS row_data
    FROM public.gate_payments gp
    WHERE gp.status = 'success'
      AND gp.paid_at >= (
        p_from::timestamp
        AT TIME ZONE 'Africa/Lagos'
      )
      AND gp.paid_at < (
        (p_to + 1)::timestamp
        AT TIME ZONE 'Africa/Lagos'
      )
  ),

  page_rows AS (
    SELECT *
    FROM base
    ORDER BY paid_at DESC, id
    LIMIT p_limit
    OFFSET p_offset
  )

  SELECT jsonb_build_object(
    'total',
      (SELECT count(*) FROM base),
    'total_amount',
      coalesce((SELECT sum(amount) FROM base), 0),
    'rows',
      coalesce(
        (
          SELECT jsonb_agg(
            row_data
            ORDER BY paid_at DESC, id
          )
          FROM page_rows
        ),
        '[]'::jsonb
      )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL
ON FUNCTION public.admin_gate_revenue_page(
  date,
  date,
  integer,
  integer
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.admin_gate_revenue_page(
  date,
  date,
  integer,
  integer
)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.admin_gate_revenue_page(
  date,
  date,
  integer,
  integer
)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.admin_gate_revenue_page(
  date,
  date,
  integer,
  integer
)
TO service_role;


-- Income statement equivalent of the existing report branch, extended
-- so successful gate payments count as estate income.
CREATE OR REPLACE FUNCTION public.admin_income_statement_page(
  p_from date,
  p_to date,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Only estate administrators can view reports'
      USING ERRCODE = '42501';
  END IF;

  IF p_from IS NULL
    OR p_to IS NULL
    OR p_to < p_from
  THEN
    RAISE EXCEPTION 'Invalid report date range';
  END IF;

  IF p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'Report page size must be between 1 and 500';
  END IF;

  IF p_offset < 0 THEN
    RAISE EXCEPTION 'Report offset cannot be negative';
  END IF;

  WITH resident_income AS (
    SELECT
      'resident:' ||
        coalesce(
          i.due_type_id::text,
          coalesce(dt.name, 'unallocated')
        ) AS group_key,

      coalesce(
        dt.name,
        'Unallocated income'
      ) AS charge_name,

      coalesce(
        h.street_id::text,
        rh.street_id::text,
        hs.name,
        rhs.name,
        'Unassigned street'
      ) AS detail_key,

      coalesce(
        hs.name,
        rhs.name,
        'Unassigned street'
      ) AS detail_name,

      round(p.amount::numeric * 100)::bigint AS kobo

    FROM public.payments p

    LEFT JOIN public.invoices i
      ON i.id = p.invoice_id

    LEFT JOIN public.due_types dt
      ON dt.id = i.due_type_id

    LEFT JOIN public.houses h
      ON h.id = i.house_id

    LEFT JOIN public.streets hs
      ON hs.id = h.street_id

    LEFT JOIN public.residents r
      ON r.id = i.resident_id

    LEFT JOIN public.houses rh
      ON rh.id = r.house_id

    LEFT JOIN public.streets rhs
      ON rhs.id = rh.street_id

    WHERE p.status = 'success'
      AND p.paid_at >= (
        p_from::timestamp
        AT TIME ZONE 'Africa/Lagos'
      )
      AND p.paid_at < (
        (p_to + 1)::timestamp
        AT TIME ZONE 'Africa/Lagos'
      )
  ),

  gate_income AS (
    SELECT
      'gate:' || gp.gate_charge_type_id::text AS group_key,
      'Gate — ' || gp.charge_name AS charge_name,
      'gate' AS detail_key,
      'Gate / external' AS detail_name,
      round(gp.amount::numeric * 100)::bigint AS kobo
    FROM public.gate_payments gp
    WHERE gp.status = 'success'
      AND gp.paid_at >= (
        p_from::timestamp
        AT TIME ZONE 'Africa/Lagos'
      )
      AND gp.paid_at < (
        (p_to + 1)::timestamp
        AT TIME ZONE 'Africa/Lagos'
      )
  ),

  income_detail_base AS (
    SELECT * FROM resident_income
    UNION ALL
    SELECT * FROM gate_income
  ),

  income_groups AS (
    SELECT
      group_key,
      charge_name,
      sum(kobo)::bigint AS total_kobo
    FROM income_detail_base
    GROUP BY group_key, charge_name
  ),

  detail_groups AS (
    SELECT
      group_key,
      charge_name,
      detail_key,
      detail_name,
      sum(kobo)::bigint AS total_kobo
    FROM income_detail_base
    GROUP BY
      group_key,
      charge_name,
      detail_key,
      detail_name
  ),

  expense_base AS (
    SELECT
      e.id,
      e.description,
      e.category,
      e.expense_date,
      round(e.amount::numeric * 100)::bigint AS kobo
    FROM public.expenses e
    WHERE e.expense_date >= p_from
      AND e.expense_date <= p_to
  ),

  statement_totals AS (
    SELECT
      coalesce(
        (SELECT sum(kobo) FROM income_detail_base),
        0
      )::bigint AS income_kobo,

      coalesce(
        (SELECT sum(kobo) FROM expense_base),
        0
      )::bigint AS expense_kobo
  ),

  ordered_rows AS (
    SELECT
      0 AS sort_major,
      ''::text AS sort_a,
      ''::text AS sort_b,
      ''::text AS sort_c,
      jsonb_build_object(
        'kind', 'section',
        'label', 'INCOME',
        'detail', NULL,
        'total', NULL
      ) AS row_data

    UNION ALL

    SELECT
      1,
      lower(income_groups.charge_name),
      income_groups.group_key,
      '0',
      jsonb_build_object(
        'kind', 'income',
        'label', income_groups.charge_name,
        'detail', NULL,
        'total', income_groups.total_kobo / 100.0
      )
    FROM income_groups

    UNION ALL

    SELECT
      1,
      lower(detail_groups.charge_name),
      detail_groups.group_key,
      '1:' ||
        lower(detail_groups.detail_name) ||
        ':' ||
        detail_groups.detail_key,
      jsonb_build_object(
        'kind', 'street',
        'label', detail_groups.detail_name,
        'detail', detail_groups.total_kobo / 100.0,
        'total', NULL
      )
    FROM detail_groups

    UNION ALL

    SELECT
      2,
      '',
      '',
      '',
      jsonb_build_object(
        'kind', 'subtotal',
        'label', 'TOTAL INCOME',
        'detail', NULL,
        'total', statement_totals.income_kobo / 100.0
      )
    FROM statement_totals

    UNION ALL

    SELECT
      3,
      '',
      '',
      '',
      jsonb_build_object(
        'kind', 'section',
        'label', 'EXPENSES',
        'detail', NULL,
        'total', NULL
      )

    UNION ALL

    SELECT
      4,
      expense_base.expense_date::text,
      expense_base.id::text,
      '',
      jsonb_build_object(
        'kind', 'expense',
        'label', coalesce(
          nullif(expense_base.description, ''),
          expense_base.category
        ),
        'category', expense_base.category,
        'date', expense_base.expense_date,
        'detail', expense_base.kobo / 100.0,
        'total', NULL
      )
    FROM expense_base

    UNION ALL

    SELECT
      5,
      '',
      '',
      '',
      jsonb_build_object(
        'kind', 'subtotal',
        'label', 'TOTAL EXPENSES',
        'detail', NULL,
        'total', statement_totals.expense_kobo / 100.0
      )
    FROM statement_totals

    UNION ALL

    SELECT
      6,
      '',
      '',
      '',
      jsonb_build_object(
        'kind',
          CASE
            WHEN statement_totals.income_kobo < statement_totals.expense_kobo
            THEN 'deficit'
            ELSE 'surplus'
          END,
        'label',
          CASE
            WHEN statement_totals.income_kobo < statement_totals.expense_kobo
            THEN 'DEFICIT'
            ELSE 'SURPLUS'
          END,
        'detail', NULL,
        'total',
          abs(
            statement_totals.income_kobo -
            statement_totals.expense_kobo
          ) / 100.0
      )
    FROM statement_totals
  ),

  page_rows AS (
    SELECT *
    FROM ordered_rows
    ORDER BY
      sort_major,
      sort_a,
      sort_b,
      sort_c
    LIMIT p_limit
    OFFSET p_offset
  )

  SELECT jsonb_build_object(
    'total',
      (SELECT count(*) FROM ordered_rows),
    'total_amount',
      (
        SELECT abs(income_kobo - expense_kobo) / 100.0
        FROM statement_totals
      ),
    'rows',
      coalesce(
        (
          SELECT jsonb_agg(
            row_data
            ORDER BY
              sort_major,
              sort_a,
              sort_b,
              sort_c
          )
          FROM page_rows
        ),
        '[]'::jsonb
      )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL
ON FUNCTION public.admin_income_statement_page(
  date,
  date,
  integer,
  integer
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.admin_income_statement_page(
  date,
  date,
  integer,
  integer
)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.admin_income_statement_page(
  date,
  date,
  integer,
  integer
)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.admin_income_statement_page(
  date,
  date,
  integer,
  integer
)
TO service_role;


COMMIT;
