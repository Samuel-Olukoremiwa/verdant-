-- VERDANT
-- Address, household, billing-responsibility and visitor-debt integrity upgrade.
--
-- Apply AFTER:
--   migration_phase1_6_repairs.sql
--   migration_phase7_12.sql
--   migration_gate_dues_dates.sql
--
-- This migration intentionally refuses to continue when ambiguous/duplicate
-- historical data is found. It does NOT delete or merge billing history.

BEGIN;

-- ---------------------------------------------------------------------------
-- NORMALISATION HELPERS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_address_key(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(
    regexp_replace(
      coalesce(p_text, ''),
      '[^a-zA-Z0-9]+',
      '',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.normalize_label(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(
    regexp_replace(
      btrim(coalesce(p_text, '')),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- PRE-FLIGHT INTEGRITY CHECKS
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- Every property must now use the structured address model.
  IF EXISTS (
    SELECT 1
    FROM public.houses
    WHERE street_id IS NULL
       OR house_number IS NULL
       OR btrim(house_number) = ''
  ) THEN
    RAISE EXCEPTION
      'Some houses do not have a structured street and house/block/flat number. Fix those records before applying this migration.';
  END IF;

  -- Duplicate street names such as:
  -- Palm Street / palm street / Palm-Street
  IF EXISTS (
    SELECT 1
    FROM public.streets
    GROUP BY public.normalize_address_key(name)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate street names exist. Reconcile them before applying this migration.';
  END IF;

  -- Duplicate properties on the same street.
  IF EXISTS (
    SELECT 1
    FROM public.houses
    GROUP BY
      street_id,
      public.normalize_address_key(house_number)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate houses/flats/blocks exist for the same street. Reconcile them before applying this migration.';
  END IF;

  -- More than one active owner on the same property.
  IF EXISTS (
    SELECT 1
    FROM public.residents
    WHERE is_active
      AND relationship = 'owner'
      AND house_id IS NOT NULL
    GROUP BY house_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'A household has more than one active Home Owner. Reconcile the ownership records before applying this migration.';
  END IF;

  -- Invalid existing billing delegation.
  IF EXISTS (
    SELECT 1
    FROM public.houses h
    LEFT JOIN public.residents r
      ON r.id = h.billing_responsible_resident_id
    WHERE h.billing_responsible_resident_id IS NOT NULL
      AND (
        r.id IS NULL
        OR NOT coalesce(r.is_active, false)
        OR r.house_id IS DISTINCT FROM h.id
      )
  ) THEN
    RAISE EXCEPTION
      'A house has an invalid billing-responsible resident. Fix the billing assignment before applying this migration.';
  END IF;

  -- One active resident login/email identity should correspond to one resident.
  IF EXISTS (
    SELECT 1
    FROM public.residents
    WHERE is_active
      AND nullif(btrim(email), '') IS NOT NULL
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate active resident email addresses exist. Reconcile them before applying this migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.residents
    WHERE auth_user_id IS NOT NULL
    GROUP BY auth_user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'The same Supabase Auth account is linked to more than one resident.';
  END IF;

  -- Prevent duplicate due types with cosmetic differences.
  IF EXISTS (
    SELECT 1
    FROM public.due_types
    GROUP BY public.normalize_label(name)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate due type names exist. Reconcile them before applying this migration.';
  END IF;

  -- Stronger invoice duplication check:
  -- "March 2027", " march 2027 " and "MARCH 2027" are the same period.
  IF EXISTS (
    SELECT 1
    FROM public.invoices
    WHERE period_label IS NOT NULL
    GROUP BY
      house_id,
      due_type_id,
      public.normalize_label(period_label)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate invoice periods exist after normalisation. Reconcile them before applying this migration.';
  END IF;

  -- Same pending registration email should not exist repeatedly.
  IF EXISTS (
    SELECT 1
    FROM public.registration_requests
    WHERE status = 'pending'
      AND nullif(btrim(email), '') IS NOT NULL
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate pending registration emails exist. Reconcile them before applying this migration.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- STRUCTURED ADDRESS GUARANTEES
-- ---------------------------------------------------------------------------

ALTER TABLE public.houses
  ALTER COLUMN street_id SET NOT NULL;

ALTER TABLE public.houses
  ALTER COLUMN house_number SET NOT NULL;

ALTER TABLE public.streets
  DROP CONSTRAINT IF EXISTS street_name_not_blank;

ALTER TABLE public.streets
  ADD CONSTRAINT street_name_not_blank
  CHECK (btrim(name) <> '');

ALTER TABLE public.houses
  DROP CONSTRAINT IF EXISTS house_number_not_blank;

ALTER TABLE public.houses
  ADD CONSTRAINT house_number_not_blank
  CHECK (btrim(house_number) <> '');

-- ---------------------------------------------------------------------------
-- DATABASE-LEVEL DUPLICATE PROTECTION
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS address_integrity_street_unique
ON public.streets (
  public.normalize_address_key(name)
);

CREATE UNIQUE INDEX IF NOT EXISTS address_integrity_house_unique
ON public.houses (
  street_id,
  public.normalize_address_key(house_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS address_integrity_one_active_owner
ON public.residents (house_id)
WHERE is_active
  AND relationship = 'owner'
  AND house_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS address_integrity_active_resident_email
ON public.residents (lower(btrim(email)))
WHERE is_active
  AND nullif(btrim(email), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS address_integrity_resident_auth_user
ON public.residents (auth_user_id)
WHERE auth_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS address_integrity_due_type_name
ON public.due_types (
  public.normalize_label(name)
);

CREATE UNIQUE INDEX IF NOT EXISTS address_integrity_invoice_period
ON public.invoices (
  house_id,
  due_type_id,
  public.normalize_label(period_label)
)
WHERE period_label IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS address_integrity_pending_registration_email
ON public.registration_requests (lower(btrim(email)))
WHERE status = 'pending'
  AND nullif(btrim(email), '') IS NOT NULL;

-- Keep the original exact invoice uniqueness protection as well.
CREATE UNIQUE INDEX IF NOT EXISTS repair_invoice_period_unique
ON public.invoices (
  house_id,
  due_type_id,
  period_label
);

-- ---------------------------------------------------------------------------
-- NORMALISE STREET NAMES
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_street_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.name :=
    regexp_replace(
      btrim(NEW.name),
      '[[:space:]]+',
      ' ',
      'g'
    );

  IF NEW.name = '' THEN
    RAISE EXCEPTION 'Street name cannot be empty';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_street_row
ON public.streets;

CREATE TRIGGER normalize_street_row
BEFORE INSERT OR UPDATE OF name
ON public.streets
FOR EACH ROW
EXECUTE FUNCTION public.normalize_street_row();

-- ---------------------------------------------------------------------------
-- ADDRESS IS DERIVED FROM STREET + HOUSE/BLOCK/FLAT NUMBER
--
-- This means somebody cannot change houses.address directly and create a
-- conflict between the displayed address and the actual structured address.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_house_address()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  street_name text;
BEGIN
  IF NEW.street_id IS NULL THEN
    RAISE EXCEPTION 'Every property must belong to a street';
  END IF;

  NEW.house_number :=
    regexp_replace(
      btrim(NEW.house_number),
      '[[:space:]]+',
      ' ',
      'g'
    );

  IF NEW.house_number = '' THEN
    RAISE EXCEPTION 'Enter a house, block or flat number';
  END IF;

  SELECT s.name
  INTO street_name
  FROM public.streets s
  WHERE s.id = NEW.street_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Street not found';
  END IF;

  NEW.address := NEW.house_number || ', ' || street_name;

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

-- Re-sync existing display addresses using their structured property fields.
UPDATE public.houses
SET address = address;

-- ---------------------------------------------------------------------------
-- BILLING RESPONSIBILITY
--
-- Ownership and billing responsibility are separate concepts.
--
-- billing_responsible_resident_id NULL:
--   active Home Owner is responsible
--
-- billing_responsible_resident_id NOT NULL:
--   ONLY that active resident is the resident-side billing contact.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_house_billing_responsible()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.billing_responsible_resident_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.residents r
       WHERE r.id = NEW.billing_responsible_resident_id
         AND r.house_id = NEW.id
         AND r.is_active
     )
  THEN
    RAISE EXCEPTION
      'Billing contact must be an active resident of this household';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_house_billing_responsible
ON public.houses;

CREATE TRIGGER validate_house_billing_responsible
BEFORE INSERT OR UPDATE OF billing_responsible_resident_id
ON public.houses
FOR EACH ROW
EXECUTE FUNCTION public.validate_house_billing_responsible();

-- Automatically clear a billing delegation if that resident becomes inactive
-- or moves to another house.
CREATE OR REPLACE FUNCTION public.clear_invalid_billing_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.house_id IS NOT NULL
     AND (
       NEW.house_id IS DISTINCT FROM OLD.house_id
       OR NEW.is_active IS NOT TRUE
     )
  THEN
    UPDATE public.houses
    SET billing_responsible_resident_id = NULL
    WHERE id = OLD.house_id
      AND billing_responsible_resident_id = OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_invalid_billing_assignment
ON public.residents;

CREATE TRIGGER clear_invalid_billing_assignment
BEFORE UPDATE OF house_id, is_active
ON public.residents
FOR EACH ROW
EXECUTE FUNCTION public.clear_invalid_billing_assignment();

CREATE OR REPLACE FUNCTION public.can_pay_house(p_house uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.residents r
    JOIN public.houses h
      ON h.id = r.house_id
    WHERE r.auth_user_id = auth.uid()
      AND r.is_active
      AND h.id = p_house
      AND (
        (
          h.billing_responsible_resident_id IS NOT NULL
          AND h.billing_responsible_resident_id = r.id
        )
        OR
        (
          h.billing_responsible_resident_id IS NULL
          AND r.relationship = 'owner'
        )
      )
  );
$$;

REVOKE ALL
ON FUNCTION public.can_pay_house(uuid)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.can_pay_house(uuid)
TO authenticated;

-- ---------------------------------------------------------------------------
-- RESOLVE A REGISTRATION ADDRESS
--
-- If the property already exists, reuse the same house_id.
-- Do NOT create a second house with the same address.
-- ---------------------------------------------------------------------------

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
  number_text text;
  street_name text;
BEGIN
  IF p_street_id IS NULL THEN
    RAISE EXCEPTION 'Select a street';
  END IF;

  number_text :=
    regexp_replace(
      btrim(coalesce(p_house_number, '')),
      '[[:space:]]+',
      ' ',
      'g'
    );

  IF number_text = '' THEN
    RAISE EXCEPTION 'Enter a house, block or flat number';
  END IF;

  SELECT name
  INTO street_name
  FROM public.streets
  WHERE id = p_street_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Street not found';
  END IF;

  -- Serialise creation for this exact property.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_street_id::text || ':' ||
      public.normalize_address_key(number_text),
      0
    )
  );

  SELECT h.id
  INTO house_uuid
  FROM public.houses h
  WHERE h.street_id = p_street_id
    AND public.normalize_address_key(h.house_number)
        = public.normalize_address_key(number_text)
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

-- ---------------------------------------------------------------------------
-- NEW RESIDENT CREATION
-- ---------------------------------------------------------------------------

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
  street_name text;
  number_text text;
  resident_name text;
  resident_phone text;
  resident_email text;
  resident_relationship text;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  resident_name := btrim(p_resident->>'full_name');
  resident_phone := btrim(p_resident->>'phone');
  resident_email := lower(btrim(p_resident->>'email'));
  resident_relationship := p_resident->>'relationship';

  IF coalesce(resident_name, '') = ''
     OR coalesce(resident_phone, '') = ''
     OR coalesce(resident_email, '') !~ '^[^ @]+@[^ @]+\.[^ @]+$'
     OR coalesce(resident_relationship, '')
        NOT IN ('owner', 'tenant', 'family_member')
  THEN
    RAISE EXCEPTION 'Enter valid resident details';
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
    street_uuid := (p_house->>'street_id')::uuid;

    number_text :=
      regexp_replace(
        btrim(coalesce(p_house->>'house_number', '')),
        '[[:space:]]+',
        ' ',
        'g'
      );

    IF street_uuid IS NULL THEN
      RAISE EXCEPTION 'Select a street';
    END IF;

    IF number_text = '' THEN
      RAISE EXCEPTION 'Enter a house, block or flat number';
    END IF;

    SELECT name
    INTO street_name
    FROM public.streets
    WHERE id = street_uuid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Street not found';
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        street_uuid::text || ':' ||
        public.normalize_address_key(number_text),
        0
      )
    );

    IF EXISTS (
      SELECT 1
      FROM public.houses h
      WHERE h.street_id = street_uuid
        AND public.normalize_address_key(h.house_number)
            = public.normalize_address_key(number_text)
    ) THEN
      RAISE EXCEPTION
        'This property already exists. Select it from the Household dropdown instead of creating another one.';
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
    nullif(btrim(p_resident->>'emergency_contact_phone'), ''),
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

-- ---------------------------------------------------------------------------
-- EDIT/MOVE RESIDENT
--
-- IMPORTANT:
-- Editing a resident does NOT rename their old house.
-- Changing p_house_id actually moves the resident to another household.
-- Existing invoices stay attached to their original house_id.
-- ---------------------------------------------------------------------------

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

  resident_name := btrim(p_resident->>'full_name');
  resident_phone := btrim(p_resident->>'phone');
  resident_email := lower(btrim(p_resident->>'email'));
  resident_relationship := p_resident->>'relationship';

  move_date := nullif(p_resident->>'move_in_date', '')::date;
  allocation_date :=
    nullif(p_resident->>'property_allocation_date', '')::date;

  IF coalesce(resident_name, '') = ''
     OR coalesce(resident_phone, '') = ''
     OR coalesce(resident_email, '') !~ '^[^ @]+@[^ @]+\.[^ @]+$'
     OR resident_relationship
        NOT IN ('owner', 'tenant', 'family_member')
     OR move_date IS NULL
     OR allocation_date IS NULL
  THEN
    RAISE EXCEPTION 'Enter valid resident details';
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
      nullif(btrim(p_resident->>'emergency_contact_phone'), ''),
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

-- ---------------------------------------------------------------------------
-- PAYMENT PREPARATION
--
-- When billing is delegated, the owner no longer remains a second
-- resident-side payer. There is one billing contact for the household.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prepare_estate_payment(
  p_auth_user uuid,
  p_items jsonb,
  p_reference text,
  p_expected_kobo bigint,
  p_quote_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r residents%rowtype;
  h houses%rowtype;
  item jsonb;
  inv invoices%rowtype;
  dt due_types%rowtype;
  m date;
  period text;
  due date;
  amount_due numeric;
  total_kobo bigint := 0;
  line_kobo bigint;
  lines jsonb := '[]'::jsonb;
  seen text[] := '{}';
  key text;
  current_month date :=
    date_trunc(
      'month',
      now() AT TIME ZONE 'Africa/Lagos'
    )::date;
BEGIN
  SELECT *
  INTO STRICT r
  FROM public.residents
  WHERE auth_user_id = p_auth_user
    AND is_active;

  SELECT *
  INTO STRICT h
  FROM public.houses
  WHERE id = r.house_id
  FOR UPDATE;

  IF h.billing_responsible_resident_id IS NOT NULL THEN
    IF h.billing_responsible_resident_id IS DISTINCT FROM r.id THEN
      RAISE EXCEPTION
        'You are not the billing contact for this household';
    END IF;
  ELSIF r.relationship IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION
      'You are not responsible for this household''s bills';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 120
  THEN
    RAISE EXCEPTION 'Choose between 1 and 120 payment items';
  END IF;

  IF NOT p_quote_only
     AND (
       p_reference IS NULL
       OR length(p_reference) < 10
     )
  THEN
    RAISE EXCEPTION 'Missing payment reference';
  END IF;

  FOR item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
  LOOP
    inv := NULL;

    IF item ? 'invoice_id' THEN
      SELECT *
      INTO STRICT inv
      FROM public.invoices
      WHERE id = (item->>'invoice_id')::uuid
        AND house_id = h.id
      FOR UPDATE;

      amount_due := (item->>'amount')::numeric;

      IF amount_due IS NULL
         OR amount_due::text IN (
           'NaN',
           'Infinity',
           '-Infinity'
         )
         OR amount_due <= 0
         OR round(amount_due, 2) <> amount_due
         OR amount_due >
            inv.amount - coalesce(inv.amount_paid, 0)
      THEN
        RAISE EXCEPTION
          'Enter an amount within the outstanding balance, with at most two decimal places';
      END IF;

      SELECT *
      INTO STRICT dt
      FROM public.due_types
      WHERE id = inv.due_type_id;

      period := inv.period_label;
      due := inv.due_date;
    ELSE
      SELECT *
      INTO STRICT dt
      FROM public.due_types
      WHERE id = (item->>'due_type_id')::uuid
        AND name IN ('Service Charge', 'CDA Levy');

      IF coalesce(item->>'month', '')
         !~ '^\d{4}-(0[1-9]|1[0-2])$'
      THEN
        RAISE EXCEPTION 'Invalid billing month';
      END IF;

      m := ((item->>'month') || '-01')::date;

      IF m < current_month
         OR m >= current_month + interval '60 months'
      THEN
        RAISE EXCEPTION
          'Choose a month within the next five years';
      END IF;

      period := to_char(m, 'FMMonth YYYY');
      due := (m + interval '1 month - 1 day')::date;

      SELECT *
      INTO inv
      FROM public.invoices
      WHERE house_id = h.id
        AND due_type_id = dt.id
        AND public.normalize_label(period_label)
            = public.normalize_label(period)
      FOR UPDATE;

      amount_due :=
        CASE
          WHEN inv.id IS NULL
          THEN dt.amount
          ELSE greatest(
            0,
            inv.amount - coalesce(inv.amount_paid, 0)
          )
        END;
    END IF;

    key :=
      dt.id::text || ':' ||
      coalesce(
        public.normalize_label(period),
        inv.id::text
      );

    IF key = ANY(seen) THEN
      RAISE EXCEPTION
        'The same bill was selected more than once';
    END IF;

    seen := array_append(seen, key);

    IF amount_due < 0 OR dt.amount <= 0 THEN
      RAISE EXCEPTION 'Invalid charge amount';
    END IF;

    line_kobo :=
      round(amount_due * 100)::bigint;

    total_kobo :=
      total_kobo + line_kobo;

    IF NOT p_quote_only
       AND line_kobo > 0
       AND inv.id IS NULL
    THEN
      INSERT INTO public.invoices (
        house_id,
        due_type_id,
        period_label,
        amount,
        due_date,
        status
      )
      VALUES (
        h.id,
        dt.id,
        period,
        dt.amount,
        due,
        'unpaid'
      )
      RETURNING *
      INTO inv;
    END IF;

    lines :=
      lines ||
      jsonb_build_array(
        jsonb_build_object(
          'invoice_id',
          inv.id,
          'charge',
          dt.name,
          'period',
          period,
          'amount_kobo',
          line_kobo
        )
      );
  END LOOP;

  IF NOT p_quote_only THEN
    IF total_kobo <= 0 THEN
      RAISE EXCEPTION 'Nothing left to pay for';
    END IF;

    IF p_expected_kobo IS NULL
       OR total_kobo <> p_expected_kobo
    THEN
      RAISE EXCEPTION
        'Your balance changed. Review the payment amount again.';
    END IF;

    INSERT INTO public.payments (
      invoice_id,
      resident_id,
      amount,
      paystack_reference,
      status
    )
    SELECT
      (x->>'invoice_id')::uuid,
      r.id,
      (x->>'amount_kobo')::numeric / 100,
      p_reference,
      'pending'
    FROM jsonb_array_elements(lines) x
    WHERE (x->>'amount_kobo')::bigint > 0;
  END IF;

  RETURN jsonb_build_object(
    'total_kobo',
    total_kobo,
    'lines',
    lines,
    'resident_id',
    r.id,
    'email',
    r.email
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.prepare_estate_payment(
  uuid,
  jsonb,
  text,
  bigint,
  boolean
)
FROM public, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.prepare_estate_payment(
  uuid,
  jsonb,
  text,
  bigint,
  boolean
)
TO service_role;

-- ---------------------------------------------------------------------------
-- GATE ALERTS NOW SUPPORT BOTH RESIDENT AND VISITOR ENTRY
-- ---------------------------------------------------------------------------

ALTER TABLE public.gate_due_alerts
  DROP CONSTRAINT IF EXISTS gate_due_alerts_id_fkey;

ALTER TABLE public.gate_due_alerts
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.gate_due_alerts
  ADD COLUMN IF NOT EXISTS source_type text;

ALTER TABLE public.gate_due_alerts
  ADD COLUMN IF NOT EXISTS source_id uuid;

UPDATE public.gate_due_alerts
SET
  source_type = coalesce(source_type, 'resident'),
  source_id = coalesce(source_id, id);

ALTER TABLE public.gate_due_alerts
  ALTER COLUMN source_type
  SET DEFAULT 'resident';

ALTER TABLE public.gate_due_alerts
  ALTER COLUMN source_type
  SET NOT NULL;

ALTER TABLE public.gate_due_alerts
  ALTER COLUMN source_id
  SET NOT NULL;

ALTER TABLE public.gate_due_alerts
  DROP CONSTRAINT IF EXISTS gate_due_alerts_source_type_check;

ALTER TABLE public.gate_due_alerts
  ADD CONSTRAINT gate_due_alerts_source_type_check
  CHECK (
    source_type IN ('resident', 'visitor')
  );

CREATE UNIQUE INDEX IF NOT EXISTS gate_due_alert_source_unique
ON public.gate_due_alerts (
  source_type,
  source_id
);

-- ---------------------------------------------------------------------------
-- RESIDENT ENTRY BILLING ALERT
--
-- The email now goes to the actual household billing contact:
--   delegated resident if present
--   otherwise active owner
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.queue_gate_due_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.residents%rowtype;
  h public.houses%rowtype;
  billing public.residents%rowtype;
  bills jsonb;
  balance numeric;
  recipient_email text;
  alert_uuid uuid;
BEGIN
  IF NEW.direction <> 'entry' THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO r
  FROM public.residents
  WHERE id = NEW.resident_id;

  IF r.id IS NULL
     OR NOT r.is_active
     OR r.house_id IS NULL
  THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO h
  FROM public.houses
  WHERE id = r.house_id;

  IF h.id IS NULL THEN
    RETURN NEW;
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
        ORDER BY i.due_date, i.id
      ) FILTER (
        WHERE i.id IS NOT NULL
      ),
      '[]'::jsonb
    )
  INTO balance, bills
  FROM public.invoices i
  LEFT JOIN public.due_types d
    ON d.id = i.due_type_id
  WHERE i.house_id = r.house_id
    AND i.status IN (
      'unpaid',
      'partial',
      'overdue'
    )
    AND i.amount > coalesce(i.amount_paid, 0);

  IF coalesce(balance, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT br.*
  INTO billing
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

  recipient_email :=
    nullif(
      btrim(billing.email),
      ''
    );

  IF recipient_email IS NULL
     AND billing.auth_user_id IS NOT NULL
  THEN
    SELECT u.email
    INTO recipient_email
    FROM auth.users u
    WHERE u.id = billing.auth_user_id;
  END IF;

  INSERT INTO public.gate_due_alerts (
    resident_id,
    source_type,
    source_id,
    details
  )
  VALUES (
    r.id,
    'resident',
    NEW.id,
    jsonb_build_object(
      'source_type',
      'resident',
      'name',
      r.full_name,
      'host',
      NULL,
      'billing_contact_name',
      billing.full_name,
      'email',
      recipient_email,
      'phone',
      billing.phone,
      'address',
      h.address,
      'entered_at',
      NEW.scanned_at,
      'balance',
      balance,
      'bills',
      bills
    )
  )
  RETURNING id
  INTO alert_uuid;

  IF recipient_email IS NOT NULL THEN
    INSERT INTO public.gate_due_emails (
      alert_id,
      recipient,
      audience
    )
    VALUES (
      alert_uuid,
      lower(recipient_email),
      'resident'
    )
    ON CONFLICT DO NOTHING;
  END IF;

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

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- VISITOR REDEMPTION + UNPAID-DUES WARNING
--
-- IMPORTANT:
-- Visitor entry is STILL APPROVED.
-- Outstanding dues produce an alert but DO NOT block the visitor.
-- ---------------------------------------------------------------------------

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
  billing public.residents%rowtype;
  h public.houses%rowtype;
  bills jsonb := '[]'::jsonb;
  balance numeric := 0;
  recipient_email text;
  alert_uuid uuid;
  entered_at timestamptz := clock_timestamp();
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
        ORDER BY i.due_date, i.id
      ) FILTER (
        WHERE i.id IS NOT NULL
      ),
      '[]'::jsonb
    )
  INTO balance, bills
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

  -- Valid visitor is admitted regardless of household debt.
  UPDATE public.visitor_passes
  SET
    redeemed_at = entered_at,
    redeemed_by = staff.id
  WHERE id = v.id;

  IF balance > 0 THEN
    SELECT br.*
    INTO billing
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

    recipient_email :=
      nullif(
        btrim(billing.email),
        ''
      );

    IF recipient_email IS NULL
       AND billing.auth_user_id IS NOT NULL
    THEN
      SELECT u.email
      INTO recipient_email
      FROM auth.users u
      WHERE u.id = billing.auth_user_id;
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
        'host',
        host_resident.full_name,
        'billing_contact_name',
        billing.full_name,
        'email',
        recipient_email,
        'phone',
        billing.phone,
        'address',
        h.address,
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

    IF recipient_email IS NOT NULL THEN
      INSERT INTO public.gate_due_emails (
        alert_id,
        recipient,
        audience
      )
      VALUES (
        alert_uuid,
        lower(recipient_email),
        'resident'
      )
      ON CONFLICT DO NOTHING;
    END IF;

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
    'host',
    host_resident.full_name,
    'address',
    h.address,
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

COMMIT;