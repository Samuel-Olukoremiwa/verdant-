-- VERDANT
-- Registration, structured resident location, visitor phone,
-- visitor-debt notification and house-number cleanup.
--
-- IMPORTANT:
-- Run AFTER migration_address_billing_integrity.sql.
--
-- BILLING RULE:
-- Invoices belong to houses.
-- Block/Flat are resident-location information and DO NOT create
-- separate billing accounts.

BEGIN;

-- =========================================================
-- HOUSE NUMBER NORMALISATION
-- =========================================================

CREATE OR REPLACE FUNCTION public.canonical_house_number(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  value_text text;
BEGIN
  value_text :=
    lower(
      regexp_replace(
        btrim(coalesce(p_text, '')),
        '[[:space:]]+',
        ' ',
        'g'
      )
    );

  value_text :=
    regexp_replace(
      value_text,
      '^house[[:space:]#-]*',
      '',
      'i'
    );

  IF value_text ~ '^[0-9]+$' THEN
    RETURN (value_text::integer)::text;
  END IF;

  RETURN public.normalize_address_key(p_text);
END;
$$;

-- Detect legacy duplicates such as:
-- 18
-- House 18
-- house-18
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.houses
    WHERE street_id IS NOT NULL
    GROUP BY
      street_id,
      public.canonical_house_number(house_number)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate house records exist after house-number normalisation. Reconcile them before applying this migration.';
  END IF;
END $$;

DROP INDEX IF EXISTS public.address_integrity_house_unique;

CREATE UNIQUE INDEX address_integrity_house_unique
ON public.houses (
  street_id,
  public.canonical_house_number(house_number)
);

-- =========================================================
-- RESIDENT-SPECIFIC BLOCK / FLAT
--
-- House is the billing unit.
-- Block and flat do NOT affect invoice uniqueness.
-- =========================================================

ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS block_number text;

ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS flat_number text;

ALTER TABLE public.registration_requests
  ADD COLUMN IF NOT EXISTS block_number text;

ALTER TABLE public.registration_requests
  ADD COLUMN IF NOT EXISTS flat_number text;

ALTER TABLE public.registration_requests
  ADD COLUMN IF NOT EXISTS vehicle_plate_numbers text[];

ALTER TABLE public.registration_requests
  ADD COLUMN IF NOT EXISTS emergency_contact_name text;

ALTER TABLE public.registration_requests
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text;

ALTER TABLE public.residents
  DROP CONSTRAINT IF EXISTS residents_block_number_check;

ALTER TABLE public.residents
  ADD CONSTRAINT residents_block_number_check
  CHECK (
    block_number IS NULL
    OR block_number ~ '^(10|[1-9])$'
  );

ALTER TABLE public.residents
  DROP CONSTRAINT IF EXISTS residents_flat_number_check;

ALTER TABLE public.residents
  ADD CONSTRAINT residents_flat_number_check
  CHECK (
    flat_number IS NULL
    OR flat_number ~ '^(10|[1-9])$'
  );

ALTER TABLE public.registration_requests
  DROP CONSTRAINT IF EXISTS registration_block_number_check;

ALTER TABLE public.registration_requests
  ADD CONSTRAINT registration_block_number_check
  CHECK (
    block_number IS NULL
    OR block_number ~ '^(10|[1-9])$'
  );

ALTER TABLE public.registration_requests
  DROP CONSTRAINT IF EXISTS registration_flat_number_check;

ALTER TABLE public.registration_requests
  ADD CONSTRAINT registration_flat_number_check
  CHECK (
    flat_number IS NULL
    OR flat_number ~ '^(10|[1-9])$'
  );

-- =========================================================
-- DISPLAY ADDRESS FOR A RESIDENT
--
-- Example:
-- House 18, Block 2, Flat 4, Chateau Street
--
-- The actual billing house remains just one house_id.
-- =========================================================

CREATE OR REPLACE FUNCTION public.resident_display_address(
  p_house_id uuid,
  p_block_number text DEFAULT NULL,
  p_flat_number text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  h public.houses%rowtype;
  street_name text;
  house_label text;
  result_text text;
BEGIN
  SELECT *
  INTO h
  FROM public.houses
  WHERE id = p_house_id;

  IF h.id IS NULL THEN
    RETURN 'Unknown household';
  END IF;

  SELECT name
  INTO street_name
  FROM public.streets
  WHERE id = h.street_id;

  house_label :=
    CASE
      WHEN lower(btrim(h.house_number)) LIKE 'house %'
        THEN btrim(h.house_number)
      WHEN btrim(h.house_number) ~ '^[0-9]+$'
        THEN 'House ' || btrim(h.house_number)
      ELSE btrim(h.house_number)
    END;

  result_text := house_label;

  IF nullif(btrim(p_block_number), '') IS NOT NULL THEN
    result_text :=
      result_text || ', Block ' || btrim(p_block_number);
  END IF;

  IF nullif(btrim(p_flat_number), '') IS NOT NULL THEN
    result_text :=
      result_text || ', Flat ' || btrim(p_flat_number);
  END IF;

  IF nullif(btrim(street_name), '') IS NOT NULL THEN
    result_text :=
      result_text || ', ' || btrim(street_name);
  END IF;

  RETURN result_text;
END;
$$;

-- =========================================================
-- HOUSE DISPLAY ADDRESS
-- =========================================================

CREATE OR REPLACE FUNCTION public.sync_house_address()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  street_name text;
  number_text text;
BEGIN
  IF NEW.street_id IS NULL THEN
    RAISE EXCEPTION 'Every property must belong to a street';
  END IF;

  number_text :=
    regexp_replace(
      btrim(coalesce(NEW.house_number, '')),
      '[[:space:]]+',
      ' ',
      'g'
    );

  IF number_text = '' THEN
    RAISE EXCEPTION 'Select a house number';
  END IF;

  SELECT s.name
  INTO street_name
  FROM public.streets s
  WHERE s.id = NEW.street_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Street not found';
  END IF;

  NEW.house_number := number_text;

  NEW.address :=
    CASE
      WHEN lower(number_text) LIKE 'house %'
        THEN number_text || ', ' || street_name
      WHEN number_text ~ '^[0-9]+$'
        THEN 'House ' || number_text || ', ' || street_name
      ELSE number_text || ', ' || street_name
    END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_house_address
ON public.houses;

CREATE TRIGGER sync_house_address
BEFORE INSERT OR UPDATE OF street_id, house_number, address
ON public.houses
FOR EACH ROW
EXECUTE FUNCTION public.sync_house_address();

UPDATE public.houses
SET address = address;

-- =========================================================
-- RESOLVE HOUSE FROM PUBLIC REGISTRATION
--
-- House Number + Street = billing house identity.
-- Block and Flat deliberately do NOT participate.
--
-- Therefore:
-- Owner + Tenant + Relative registering House 18
-- independently all resolve to the same house_id.
-- =========================================================

CREATE OR REPLACE FUNCTION public.resolve_registration_house(
  p_street_id uuid,
  p_house_number text,
  p_house_type text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  house_uuid uuid;
  number_integer integer;
  number_text text;
BEGIN
  IF p_street_id IS NULL THEN
    RAISE EXCEPTION 'Select a street';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.streets
    WHERE id = p_street_id
  ) THEN
    RAISE EXCEPTION 'Street not found';
  END IF;

  IF coalesce(btrim(p_house_number), '') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'Select a valid house number';
  END IF;

  number_integer := btrim(p_house_number)::integer;

  IF number_integer < 1 OR number_integer > 50 THEN
    RAISE EXCEPTION 'House number must be between 1 and 50';
  END IF;

  number_text := number_integer::text;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_street_id::text || ':' || number_text,
      0
    )
  );

  SELECT h.id
  INTO house_uuid
  FROM public.houses h
  WHERE h.street_id = p_street_id
    AND public.canonical_house_number(h.house_number) = number_text
  LIMIT 1;

  IF house_uuid IS NOT NULL THEN
    RETURN house_uuid;
  END IF;

  INSERT INTO public.houses (
    address,
    house_type,
    street_id,
    house_number
  )
  VALUES (
    number_text,
    nullif(btrim(p_house_type), ''),
    p_street_id,
    number_text
  )
  RETURNING id
  INTO house_uuid;

  RETURN house_uuid;
END;
$$;

REVOKE ALL
ON FUNCTION public.resolve_registration_house(uuid, text, text)
FROM public, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.resolve_registration_house(uuid, text, text)
TO service_role;

-- =========================================================
-- ADMIN ADD RESIDENT RPC
-- =========================================================

CREATE OR REPLACE FUNCTION public.add_estate_resident(
  p_house_id uuid,
  p_house jsonb,
  p_resident jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  house_uuid uuid := p_house_id;
  resident_uuid uuid;
  street_uuid uuid;
  number_integer integer;
  number_text text;
  resident_name text;
  resident_phone text;
  resident_email text;
  resident_relationship text;
  resident_block text;
  resident_flat text;
  emergency_phone text;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  resident_name :=
    btrim(p_resident->>'full_name');

  resident_phone :=
    btrim(p_resident->>'phone');

  resident_email :=
    lower(btrim(p_resident->>'email'));

  resident_relationship :=
    p_resident->>'relationship';

  resident_block :=
    nullif(btrim(p_resident->>'block_number'), '');

  resident_flat :=
    nullif(btrim(p_resident->>'flat_number'), '');

  emergency_phone :=
    nullif(btrim(p_resident->>'emergency_contact_phone'), '');

  IF coalesce(resident_name, '') = '' THEN
    RAISE EXCEPTION 'Enter the resident name';
  END IF;

  IF length(resident_phone) < 11
     OR resident_phone !~ '^\+?[0-9]{10,15}$'
  THEN
    RAISE EXCEPTION
      'Phone number must contain only numbers and an optional leading +, with at least 11 characters';
  END IF;

  IF resident_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address';
  END IF;

  IF resident_relationship
     NOT IN ('owner', 'tenant', 'family_member')
  THEN
    RAISE EXCEPTION 'Select a resident status';
  END IF;

  IF resident_block IS NOT NULL
     AND resident_block !~ '^(10|[1-9])$'
  THEN
    RAISE EXCEPTION 'Block number must be between 1 and 10';
  END IF;

  IF resident_flat IS NOT NULL
     AND resident_flat !~ '^(10|[1-9])$'
  THEN
    RAISE EXCEPTION 'Flat number must be between 1 and 10';
  END IF;

  IF emergency_phone IS NOT NULL
     AND (
       length(emergency_phone) < 11
       OR emergency_phone !~ '^\+?[0-9]{10,15}$'
     )
  THEN
    RAISE EXCEPTION 'Enter a valid emergency contact phone number';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.residents
    WHERE is_active
      AND lower(btrim(email)) = resident_email
  ) THEN
    RAISE EXCEPTION
      'An active resident already uses this email address';
  END IF;

  IF house_uuid IS NULL THEN
    street_uuid :=
      (p_house->>'street_id')::uuid;

    IF street_uuid IS NULL THEN
      RAISE EXCEPTION 'Select a street';
    END IF;

    IF coalesce(btrim(p_house->>'house_number'), '')
       !~ '^[0-9]+$'
    THEN
      RAISE EXCEPTION 'Select a valid house number';
    END IF;

    number_integer :=
      btrim(p_house->>'house_number')::integer;

    IF number_integer < 1 OR number_integer > 50 THEN
      RAISE EXCEPTION
        'House number must be between 1 and 50';
    END IF;

    number_text := number_integer::text;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        street_uuid::text || ':' || number_text,
        0
      )
    );

    IF EXISTS (
      SELECT 1
      FROM public.houses h
      WHERE h.street_id = street_uuid
        AND public.canonical_house_number(h.house_number) = number_text
    ) THEN
      RAISE EXCEPTION
        'This house already exists. Select it from the Household dropdown.';
    END IF;

    INSERT INTO public.houses (
      address,
      house_type,
      street_id,
      house_number
    )
    VALUES (
      number_text,
      nullif(btrim(p_house->>'house_type'), ''),
      street_uuid,
      number_text
    )
    RETURNING id
    INTO house_uuid;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.houses
      WHERE id = house_uuid
    ) THEN
      RAISE EXCEPTION 'Household not found';
    END IF;
  END IF;

  IF resident_relationship = 'owner'
     AND EXISTS (
       SELECT 1
       FROM public.residents
       WHERE house_id = house_uuid
         AND is_active
         AND relationship = 'owner'
     )
  THEN
    RAISE EXCEPTION
      'This household already has an active Home Owner';
  END IF;

  INSERT INTO public.residents (
    house_id,
    full_name,
    phone,
    email,
    relationship,
    block_number,
    flat_number,
    vehicle_plate_numbers,
    emergency_contact_name,
    emergency_contact_phone,
    move_in_date,
    property_allocation_date,
    qr_code_value
  )
  VALUES (
    house_uuid,
    resident_name,
    resident_phone,
    resident_email,
    resident_relationship,
    resident_block,
    resident_flat,
    ARRAY(
      SELECT btrim(value)
      FROM jsonb_array_elements_text(
        coalesce(
          p_resident->'vehicle_plate_numbers',
          '[]'::jsonb
        )
      ) AS value
      WHERE btrim(value) <> ''
    ),
    nullif(btrim(p_resident->>'emergency_contact_name'), ''),
    emergency_phone,
    nullif(p_resident->>'move_in_date', '')::date,
    nullif(p_resident->>'property_allocation_date', '')::date,
    'RES-' || gen_random_uuid()::text
  )
  RETURNING id
  INTO resident_uuid;

  RETURN resident_uuid;
END;
$$;

REVOKE ALL
ON FUNCTION public.add_estate_resident(uuid, jsonb, jsonb)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.add_estate_resident(uuid, jsonb, jsonb)
TO authenticated;

-- =========================================================
-- EDIT / MOVE RESIDENT
-- =========================================================

CREATE OR REPLACE FUNCTION public.update_estate_resident(
  p_resident_id uuid,
  p_house_id uuid,
  p_resident jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_resident public.residents%rowtype;
  resident_name text;
  resident_phone text;
  resident_email text;
  resident_relationship text;
  resident_block text;
  resident_flat text;
  emergency_phone text;
  move_date date;
  allocation_date date;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT *
  INTO current_resident
  FROM public.residents
  WHERE id = p_resident_id
  FOR UPDATE;

  IF current_resident.id IS NULL THEN
    RAISE EXCEPTION 'Resident not found';
  END IF;

  IF p_house_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.houses
       WHERE id = p_house_id
     )
  THEN
    RAISE EXCEPTION 'Select a valid household';
  END IF;

  resident_name :=
    btrim(p_resident->>'full_name');

  resident_phone :=
    btrim(p_resident->>'phone');

  resident_email :=
    lower(btrim(p_resident->>'email'));

  resident_relationship :=
    p_resident->>'relationship';

  resident_block :=
    nullif(btrim(p_resident->>'block_number'), '');

  resident_flat :=
    nullif(btrim(p_resident->>'flat_number'), '');

  emergency_phone :=
    nullif(btrim(p_resident->>'emergency_contact_phone'), '');

  move_date :=
    nullif(p_resident->>'move_in_date', '')::date;

  allocation_date :=
    nullif(p_resident->>'property_allocation_date', '')::date;

  IF resident_name = '' THEN
    RAISE EXCEPTION 'Enter the resident name';
  END IF;

  IF length(resident_phone) < 11
     OR resident_phone !~ '^\+?[0-9]{10,15}$'
  THEN
    RAISE EXCEPTION 'Enter a valid phone number';
  END IF;

  IF resident_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address';
  END IF;

  IF resident_relationship
     NOT IN ('owner', 'tenant', 'family_member')
  THEN
    RAISE EXCEPTION 'Select a resident status';
  END IF;

  IF resident_block IS NOT NULL
     AND resident_block !~ '^(10|[1-9])$'
  THEN
    RAISE EXCEPTION 'Block number must be between 1 and 10';
  END IF;

  IF resident_flat IS NOT NULL
     AND resident_flat !~ '^(10|[1-9])$'
  THEN
    RAISE EXCEPTION 'Flat number must be between 1 and 10';
  END IF;

  IF emergency_phone IS NOT NULL
     AND (
       length(emergency_phone) < 11
       OR emergency_phone !~ '^\+?[0-9]{10,15}$'
     )
  THEN
    RAISE EXCEPTION 'Enter a valid emergency contact phone number';
  END IF;

  IF move_date IS NULL
     OR allocation_date IS NULL
  THEN
    RAISE EXCEPTION
      'Move-in date and property allocation date are required';
  END IF;

  IF current_resident.is_active
     AND EXISTS (
       SELECT 1
       FROM public.residents r
       WHERE r.id <> p_resident_id
         AND r.is_active
         AND lower(btrim(r.email)) = resident_email
     )
  THEN
    RAISE EXCEPTION
      'Another active resident already uses this email address';
  END IF;

  IF current_resident.is_active
     AND resident_relationship = 'owner'
     AND EXISTS (
       SELECT 1
       FROM public.residents r
       WHERE r.id <> p_resident_id
         AND r.house_id = p_house_id
         AND r.is_active
         AND r.relationship = 'owner'
     )
  THEN
    RAISE EXCEPTION
      'The selected household already has an active Home Owner';
  END IF;

  UPDATE public.residents
  SET
    house_id = p_house_id,
    full_name = resident_name,
    phone = resident_phone,
    email = resident_email,
    relationship = resident_relationship,
    block_number = resident_block,
    flat_number = resident_flat,
    vehicle_plate_numbers = ARRAY(
      SELECT btrim(value)
      FROM jsonb_array_elements_text(
        coalesce(
          p_resident->'vehicle_plate_numbers',
          '[]'::jsonb
        )
      ) AS value
      WHERE btrim(value) <> ''
    ),
    emergency_contact_name =
      nullif(btrim(p_resident->>'emergency_contact_name'), ''),
    emergency_contact_phone =
      emergency_phone,
    move_in_date = move_date,
    property_allocation_date = allocation_date
  WHERE id = p_resident_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.update_estate_resident(uuid, uuid, jsonb)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.update_estate_resident(uuid, uuid, jsonb)
TO authenticated;

-- =========================================================
-- VISITOR PHONE
-- =========================================================

ALTER TABLE public.visitor_passes
  ADD COLUMN IF NOT EXISTS visitor_phone text;

ALTER TABLE public.visitor_passes
  DROP CONSTRAINT IF EXISTS visitor_phone_format_check;

ALTER TABLE public.visitor_passes
  ADD CONSTRAINT visitor_phone_format_check
  CHECK (
    visitor_phone IS NULL
    OR visitor_phone ~ '^\+?[0-9]{10,15}$'
  );

ALTER TABLE public.visitor_passes
  DROP CONSTRAINT IF EXISTS visitor_name_not_blank;

ALTER TABLE public.visitor_passes
  ADD CONSTRAINT visitor_name_not_blank
  CHECK (btrim(visitor_name) <> '');

ALTER TABLE public.visitor_passes
  ALTER COLUMN visitor_name DROP DEFAULT;

-- Replace old 2-argument visitor-pass function.
DROP FUNCTION IF EXISTS public.create_visitor_pass(text, timestamptz);

CREATE OR REPLACE FUNCTION public.create_visitor_pass(
  p_visitor_name text,
  p_visitor_phone text,
  p_expires_at timestamptz
)
RETURNS public.visitor_passes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.residents%rowtype;
  v public.visitor_passes%rowtype;
  visitor_name_text text;
  visitor_phone_text text;
  addr text;
  attempts integer := 0;
BEGIN
  SELECT *
  INTO r
  FROM public.residents
  WHERE auth_user_id = auth.uid()
    AND is_active
  ORDER BY id
  LIMIT 1
  FOR UPDATE;

  IF r.id IS NULL
     OR r.house_id IS NULL
  THEN
    RAISE EXCEPTION
      'An active resident with a house is required';
  END IF;

  visitor_name_text :=
    btrim(coalesce(p_visitor_name, ''));

  IF visitor_name_text = '' THEN
    RAISE EXCEPTION 'Visitor name is required';
  END IF;

  IF length(visitor_name_text) > 100 THEN
    RAISE EXCEPTION
      'Visitor name must be 100 characters or fewer';
  END IF;

  visitor_phone_text :=
    nullif(btrim(p_visitor_phone), '');

  IF visitor_phone_text IS NOT NULL
     AND visitor_phone_text !~ '^\+?[0-9]{10,15}$'
  THEN
    RAISE EXCEPTION
      'Enter a valid visitor mobile number';
  END IF;

  IF p_expires_at IS NULL
     OR NOT isfinite(p_expires_at)
     OR p_expires_at <= clock_timestamp()
  THEN
    RAISE EXCEPTION
      'Choose an expiry time in the future';
  END IF;

  addr :=
    public.resident_display_address(
      r.house_id,
      r.block_number,
      r.flat_number
    );

  LOOP
    attempts := attempts + 1;

    BEGIN
      INSERT INTO public.visitor_passes (
        resident_id,
        house_id,
        code,
        visitor_name,
        visitor_phone,
        address,
        starts_at,
        expires_at
      )
      VALUES (
        r.id,
        r.house_id,
        upper(
          substr(
            replace(
              gen_random_uuid()::text,
              '-',
              ''
            ),
            1,
            10
          )
        ),
        visitor_name_text,
        visitor_phone_text,
        addr,
        clock_timestamp(),
        p_expires_at
      )
      RETURNING *
      INTO v;

      RETURN v;

    EXCEPTION
      WHEN unique_violation THEN
        IF attempts >= 5 THEN
          RAISE EXCEPTION
            'Please try generating the code again';
        END IF;
    END;
  END LOOP;
END;
$$;

REVOKE ALL
ON FUNCTION public.create_visitor_pass(text, text, timestamptz)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.create_visitor_pass(text, text, timestamptz)
TO authenticated;

-- =========================================================
-- VISITOR REDEMPTION + HOUSE DEBT ALERT
--
-- ENTRY IS NEVER BLOCKED ONLY BECAUSE OF DEBT.
--
-- When debt exists:
--   Host resident receives alert
--   Designated payee receives alert if different
--   Admin/Super Admin receives alert
-- =========================================================

CREATE OR REPLACE FUNCTION public.redeem_visitor_pass(
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.visitor_passes%rowtype;
  staff public.admins%rowtype;
  host_resident public.residents%rowtype;
  billing_resident public.residents%rowtype;
  h public.houses%rowtype;

  bills jsonb := '[]'::jsonb;
  balance numeric := 0;

  host_email text;
  billing_email text;
  alert_uuid uuid;

  entered_at timestamptz :=
    clock_timestamp();
BEGIN
  SELECT *
  INTO staff
  FROM public.admins
  WHERE auth_user_id = auth.uid()
    AND role IN (
      'admin',
      'super_admin',
      'gate_staff'
    )
  ORDER BY id
  LIMIT 1;

  IF staff.id IS NULL THEN
    RAISE EXCEPTION
      'Only estate staff can verify visitor entry';
  END IF;

  SELECT *
  INTO v
  FROM public.visitor_passes
  WHERE code = upper(trim(p_code))
  FOR UPDATE;

  IF v.id IS NULL THEN
    RAISE EXCEPTION 'Invalid visitor code';
  END IF;

  IF v.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION
      'This visitor code was cancelled';
  END IF;

  IF v.redeemed_at IS NOT NULL THEN
    RAISE EXCEPTION
      'This visitor code has already been used';
  END IF;

  IF entered_at < v.starts_at
     OR entered_at >= v.expires_at
  THEN
    RAISE EXCEPTION
      'This visitor code has expired or is not yet valid';
  END IF;

  SELECT *
  INTO host_resident
  FROM public.residents
  WHERE id = v.resident_id
  FOR SHARE;

  IF host_resident.is_active IS NOT TRUE
     OR host_resident.house_id IS DISTINCT FROM v.house_id
  THEN
    RAISE EXCEPTION
      'The host no longer has access to this house';
  END IF;

  SELECT *
  INTO h
  FROM public.houses
  WHERE id = v.house_id;

  IF h.id IS NULL THEN
    RAISE EXCEPTION
      'The household record is unavailable';
  END IF;

  SELECT
    coalesce(
      sum(
        greatest(
          i.amount - coalesce(i.amount_paid, 0),
          0
        )
      ),
      0
    ),

    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'label',
          coalesce(d.name, 'Estate charge'),

          'amount',
          greatest(
            i.amount - coalesce(i.amount_paid, 0),
            0
          ),

          'due_date',
          i.due_date
        )

        ORDER BY
          i.due_date,
          i.id
      )
      FILTER (
        WHERE i.id IS NOT NULL
      ),

      '[]'::jsonb
    )
  INTO
    balance,
    bills

  FROM public.invoices i

  LEFT JOIN public.due_types d
    ON d.id = i.due_type_id

  WHERE i.house_id = v.house_id
    AND i.status IN (
      'unpaid',
      'partial',
      'overdue'
    )
    AND i.amount > coalesce(i.amount_paid, 0);

  -- Entry is approved before notifications.
  UPDATE public.visitor_passes
  SET
    redeemed_at = entered_at,
    redeemed_by = staff.id
  WHERE id = v.id;

  IF balance > 0 THEN

    -- Resolve designated billing resident.
    SELECT br.*
    INTO billing_resident
    FROM public.residents br
    WHERE br.house_id = h.id
      AND br.is_active
      AND (
        (
          h.billing_responsible_resident_id IS NOT NULL
          AND br.id = h.billing_responsible_resident_id
        )
        OR
        (
          h.billing_responsible_resident_id IS NULL
          AND br.relationship = 'owner'
        )
      )
    LIMIT 1;

    -- Host email.
    host_email :=
      nullif(
        btrim(host_resident.email),
        ''
      );

    IF host_email IS NULL
       AND host_resident.auth_user_id IS NOT NULL
    THEN
      SELECT u.email
      INTO host_email
      FROM auth.users u
      WHERE u.id = host_resident.auth_user_id;
    END IF;

    -- Billing contact email.
    billing_email :=
      nullif(
        btrim(billing_resident.email),
        ''
      );

    IF billing_email IS NULL
       AND billing_resident.auth_user_id IS NOT NULL
    THEN
      SELECT u.email
      INTO billing_email
      FROM auth.users u
      WHERE u.id = billing_resident.auth_user_id;
    END IF;

    INSERT INTO public.gate_due_alerts (
      resident_id,
      source_type,
      source_id,
      details
    )
    VALUES (
      host_resident.id,
      'visitor',
      v.id,

      jsonb_build_object(
        'source_type',
        'visitor',

        'name',
        v.visitor_name,

        'visitor_phone',
        v.visitor_phone,

        'host',
        host_resident.full_name,

        'host_email',
        host_email,

        'host_phone',
        host_resident.phone,

        'billing_contact_name',
        billing_resident.full_name,

        'email',
        billing_email,

        'phone',
        billing_resident.phone,

        'address',
        v.address,

        'entered_at',
        entered_at,

        'balance',
        balance,

        'bills',
        bills
      )
    )
    RETURNING id
    INTO alert_uuid;

    -- Notify the host resident.
    IF host_email IS NOT NULL THEN
      INSERT INTO public.gate_due_emails (
        alert_id,
        recipient,
        audience
      )
      VALUES (
        alert_uuid,
        lower(host_email),
        'resident'
      )
      ON CONFLICT DO NOTHING;
    END IF;

    -- Notify designated payee if different.
    IF billing_email IS NOT NULL THEN
      INSERT INTO public.gate_due_emails (
        alert_id,
        recipient,
        audience
      )
      VALUES (
        alert_uuid,
        lower(billing_email),
        'resident'
      )
      ON CONFLICT DO NOTHING;
    END IF;

    -- Notify Admin and Super Admin.
    INSERT INTO public.gate_due_emails (
      alert_id,
      recipient,
      audience
    )
    SELECT DISTINCT
      alert_uuid,
      lower(u.email),
      'admin'
    FROM public.admins a
    JOIN auth.users u
      ON u.id = a.auth_user_id
    WHERE a.role IN (
      'admin',
      'super_admin'
    )
      AND nullif(btrim(u.email), '') IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'visitor',
    v.visitor_name,

    'visitor_phone',
    v.visitor_phone,

    'host',
    host_resident.full_name,

    'address',
    v.address,

    'message',
    'Entry recorded. This code cannot be used again.',

    'has_outstanding',
    balance > 0,

    'balance',
    balance,

    'alert_queued',
    balance > 0
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.redeem_visitor_pass(text)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.redeem_visitor_pass(text)
TO authenticated;

-- Force PostgREST/Supabase API schema refresh.
NOTIFY pgrst, 'reload schema';

COMMIT;