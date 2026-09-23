-- VERDANT
-- Hybrid household + resident-specific billing.
--
-- Existing invoices remain HOUSE invoices.
-- Existing due types remain HOUSE due types.
--
-- New resident-specific invoices:
--   house_id    = NULL
--   resident_id = resident UUID
--
-- Household invoices:
--   house_id    = house UUID
--   resident_id = NULL

BEGIN;

-- ============================================================
-- 1. DUE TYPE BILLING SCOPE
-- ============================================================

ALTER TABLE public.due_types
ADD COLUMN IF NOT EXISTS billing_scope text;

UPDATE public.due_types
SET billing_scope = 'house'
WHERE billing_scope IS NULL;

ALTER TABLE public.due_types
ALTER COLUMN billing_scope
SET DEFAULT 'house';

ALTER TABLE public.due_types
ALTER COLUMN billing_scope
SET NOT NULL;

ALTER TABLE public.due_types
DROP CONSTRAINT IF EXISTS due_types_billing_scope_check;

ALTER TABLE public.due_types
ADD CONSTRAINT due_types_billing_scope_check
CHECK (
  billing_scope IN (
    'house',
    'resident'
  )
);

ALTER TABLE public.due_types
DROP CONSTRAINT IF EXISTS due_types_frequency_check;

ALTER TABLE public.due_types
ADD CONSTRAINT due_types_frequency_check
CHECK (
  frequency IN (
    'monthly',
    'quarterly',
    'yearly',
    'one-time'
  )
)
NOT VALID;

-- Existing unusual historical values, if any, are not destroyed.
-- New/updated rows must use the supported frequencies.

-- ============================================================
-- 2. INVOICE TARGET
-- ============================================================

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS resident_id uuid
REFERENCES public.residents(id);

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS period_start date;

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS period_end date;

CREATE INDEX IF NOT EXISTS hybrid_invoice_resident_idx
ON public.invoices(resident_id);

-- Existing Verdant invoices should all already belong to houses.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.invoices
    WHERE house_id IS NULL
      AND resident_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Existing invoices without a house were found. Reconcile them before applying the hybrid billing migration.';
  END IF;
END;
$$;

ALTER TABLE public.invoices
DROP CONSTRAINT IF EXISTS hybrid_invoice_exactly_one_target;

ALTER TABLE public.invoices
ADD CONSTRAINT hybrid_invoice_exactly_one_target
CHECK (
  (
    house_id IS NOT NULL
    AND resident_id IS NULL
  )
  OR
  (
    house_id IS NULL
    AND resident_id IS NOT NULL
  )
);

ALTER TABLE public.invoices
DROP CONSTRAINT IF EXISTS hybrid_invoice_period_dates;

ALTER TABLE public.invoices
ADD CONSTRAINT hybrid_invoice_period_dates
CHECK (
  period_start IS NULL
  OR period_end IS NULL
  OR period_start <= period_end
);

-- A resident cannot receive the same charge twice
-- for the same generated billing period.
CREATE UNIQUE INDEX IF NOT EXISTS
hybrid_resident_invoice_period_unique
ON public.invoices (
  resident_id,
  due_type_id,
  period_start,
  period_end
)
WHERE resident_id IS NOT NULL;

-- ============================================================
-- 3. PROTECT BILLING SCOPE
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_invoice_billing_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_scope text;
BEGIN
  SELECT billing_scope
  INTO STRICT v_scope
  FROM public.due_types
  WHERE id = NEW.due_type_id;

  IF v_scope = 'house' THEN
    IF NEW.house_id IS NULL
       OR NEW.resident_id IS NOT NULL
    THEN
      RAISE EXCEPTION
        'This due type is a Household / Property charge and must be billed to a house.';
    END IF;
  ELSIF v_scope = 'resident' THEN
    IF NEW.resident_id IS NULL
       OR NEW.house_id IS NOT NULL
    THEN
      RAISE EXCEPTION
        'This due type is an Individual Resident charge and must be billed to a resident.';
    END IF;

    IF NEW.period_start IS NULL
       OR NEW.period_end IS NULL
    THEN
      RAISE EXCEPTION
        'Resident-specific invoices require a billing start and end date.';
    END IF;
  ELSE
    RAISE EXCEPTION
      'Unsupported billing scope.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
validate_invoice_billing_scope_trigger
ON public.invoices;

CREATE TRIGGER
validate_invoice_billing_scope_trigger
BEFORE INSERT OR UPDATE OF
  house_id,
  resident_id,
  due_type_id,
  period_start,
  period_end
ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.validate_invoice_billing_scope();

-- A due type cannot switch from house -> resident or vice versa
-- once it already has invoice history.
CREATE OR REPLACE FUNCTION public.protect_due_type_billing_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.billing_scope IS DISTINCT FROM OLD.billing_scope
     AND EXISTS (
       SELECT 1
       FROM public.invoices
       WHERE due_type_id = OLD.id
     )
  THEN
    RAISE EXCEPTION
      'This due type already has invoice history. Create a new due type instead of changing its billing scope.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
protect_due_type_billing_scope_trigger
ON public.due_types;

CREATE TRIGGER
protect_due_type_billing_scope_trigger
BEFORE UPDATE OF billing_scope
ON public.due_types
FOR EACH ROW
EXECUTE FUNCTION public.protect_due_type_billing_scope();

-- ============================================================
-- 4. RESIDENT INVOICE VISIBILITY
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_access_invoice_target(
  p_house uuid,
  p_resident uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.residents r
    LEFT JOIN public.houses h
      ON h.id = r.house_id
    WHERE r.auth_user_id = auth.uid()
      AND r.is_active
      AND (
        (
          p_resident IS NOT NULL
          AND p_resident = r.id
        )
        OR
        (
          p_house IS NOT NULL
          AND h.id = p_house
          AND (
            (
              h.billing_responsible_resident_id IS NOT NULL
              AND
              h.billing_responsible_resident_id = r.id
            )
            OR
            (
              h.billing_responsible_resident_id IS NULL
              AND r.relationship = 'owner'
            )
          )
        )
      )
  );
$$;

REVOKE ALL
ON FUNCTION public.can_access_invoice_target(uuid, uuid)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.can_access_invoice_target(uuid, uuid)
TO authenticated;

DROP POLICY IF EXISTS
"residents view home invoices"
ON public.invoices;

DROP POLICY IF EXISTS
"repair responsible residents view invoices"
ON public.invoices;

DROP POLICY IF EXISTS
"hybrid residents view invoices"
ON public.invoices;

CREATE POLICY
"hybrid residents view invoices"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  public.can_access_invoice_target(
    house_id,
    resident_id
  )
);

DROP POLICY IF EXISTS
"repair invoice visibility boundary"
ON public.invoices;

DROP POLICY IF EXISTS
"hybrid invoice visibility boundary"
ON public.invoices;

CREATE POLICY
"hybrid invoice visibility boundary"
ON public.invoices
AS RESTRICTIVE
FOR SELECT
TO public
USING (
  public.is_estate_admin()
  OR public.can_access_invoice_target(
    house_id,
    resident_id
  )
);

-- ============================================================
-- 5. DATE PERIOD HELPERS
-- ============================================================

-- Adds months while trying to preserve the original billing day.
-- 31 January + 1 month becomes the final valid day in February.
CREATE OR REPLACE FUNCTION public.anchored_month_date(
  p_anchor date,
  p_months integer
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_month_start date;
  v_month_end date;
  v_day integer;
BEGIN
  IF p_anchor IS NULL THEN
    RETURN NULL;
  END IF;

  v_month_start :=
    (
      date_trunc(
        'month',
        p_anchor
      )::date
      +
      make_interval(
        months => p_months
      )
    )::date;

  v_month_end :=
    (
      v_month_start
      +
      interval '1 month - 1 day'
    )::date;

  v_day :=
    least(
      extract(day FROM p_anchor)::integer,
      extract(day FROM v_month_end)::integer
    );

  RETURN make_date(
    extract(year FROM v_month_start)::integer,
    extract(month FROM v_month_start)::integer,
    v_day
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resident_invoice_periods(
  p_frequency text,
  p_start date,
  p_end date
)
RETURNS TABLE (
  sequence_no integer,
  bill_start date,
  bill_end date,
  bill_label text
)
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_month_step integer;
  v_index integer := 0;
  v_start date;
  v_next date;
  v_end date;
BEGIN
  IF p_start IS NULL
     OR p_end IS NULL
     OR p_start > p_end
  THEN
    RAISE EXCEPTION
      'Choose a valid billing date range.';
  END IF;

  IF p_frequency = 'one-time' THEN
    sequence_no := 1;
    bill_start := p_start;
    bill_end := p_end;
    bill_label :=
      to_char(
        p_start,
        'DD/MM/YYYY'
      )
      || ' - ' ||
      to_char(
        p_end,
        'DD/MM/YYYY'
      );

    RETURN NEXT;
    RETURN;
  END IF;

  v_month_step :=
    CASE p_frequency
      WHEN 'monthly'
        THEN 1
      WHEN 'quarterly'
        THEN 3
      WHEN 'yearly'
        THEN 12
      ELSE NULL
    END;

  IF v_month_step IS NULL THEN
    RAISE EXCEPTION
      'Unsupported billing frequency.';
  END IF;

  LOOP
    IF v_index >= 600 THEN
      RAISE EXCEPTION
        'The selected period creates too many invoices.';
    END IF;

    v_start :=
      public.anchored_month_date(
        p_start,
        v_index * v_month_step
      );

    EXIT WHEN v_start > p_end;

    v_next :=
      public.anchored_month_date(
        p_start,
        (v_index + 1) * v_month_step
      );

    v_end :=
      least(
        p_end,
        v_next - 1
      );

    sequence_no :=
      v_index + 1;

    bill_start :=
      v_start;

    bill_end :=
      v_end;

    bill_label :=
      to_char(
        v_start,
        'DD/MM/YYYY'
      )
      || ' - ' ||
      to_char(
        v_end,
        'DD/MM/YYYY'
      );

    RETURN NEXT;

    v_index :=
      v_index + 1;
  END LOOP;
END;
$$;

-- ============================================================
-- 6. PREVIEW RESIDENT INVOICES
-- ============================================================

CREATE OR REPLACE FUNCTION public.preview_resident_invoices(
  p_resident uuid,
  p_due_type uuid,
  p_start date,
  p_end date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resident public.residents%rowtype;
  v_due public.due_types%rowtype;
  v_period record;
  v_periods jsonb := '[]'::jsonb;
  v_exists boolean;
  v_total numeric := 0;
  v_create_count integer := 0;
  v_duplicate_count integer := 0;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION
      'Not authorized';
  END IF;

  SELECT *
  INTO STRICT v_resident
  FROM public.residents
  WHERE id = p_resident;

  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id = p_due_type;

  IF v_due.billing_scope <> 'resident' THEN
    RAISE EXCEPTION
      'Select an Individual Resident due type.';
  END IF;

  IF v_due.amount <= 0 THEN
    RAISE EXCEPTION
      'The due type amount must be greater than zero.';
  END IF;

  FOR v_period IN
    SELECT *
    FROM public.resident_invoice_periods(
      v_due.frequency,
      p_start,
      p_end
    )
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.resident_id = p_resident
        AND i.due_type_id = p_due_type
        AND i.period_start = v_period.bill_start
        AND i.period_end = v_period.bill_end
    )
    INTO v_exists;

    IF v_exists THEN
      v_duplicate_count :=
        v_duplicate_count + 1;
    ELSE
      v_create_count :=
        v_create_count + 1;

      v_total :=
        v_total + v_due.amount;
    END IF;

    v_periods :=
      v_periods ||
      jsonb_build_array(
        jsonb_build_object(
          'period_start',
          v_period.bill_start,
          'period_end',
          v_period.bill_end,
          'period_label',
          v_period.bill_label,
          'due_date',
          v_period.bill_end,
          'amount',
          v_due.amount,
          'already_exists',
          v_exists
        )
      );
  END LOOP;

  RETURN jsonb_build_object(
    'resident_id',
    v_resident.id,
    'resident_name',
    v_resident.full_name,
    'due_type_id',
    v_due.id,
    'due_type_name',
    v_due.name,
    'frequency',
    v_due.frequency,
    'amount_per_period',
    v_due.amount,
    'periods',
    v_periods,
    'create_count',
    v_create_count,
    'duplicate_count',
    v_duplicate_count,
    'total_to_create',
    v_total
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.preview_resident_invoices(
  uuid,
  uuid,
  date,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.preview_resident_invoices(
  uuid,
  uuid,
  date,
  date
)
TO authenticated;

-- ============================================================
-- 7. GENERATE RESIDENT INVOICES
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_resident_invoices(
  p_resident uuid,
  p_due_type uuid,
  p_start date,
  p_end date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due public.due_types%rowtype;
  v_period record;
  v_created integer := 0;
  v_skipped integer := 0;
  v_row_count integer;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION
      'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.residents
    WHERE id = p_resident
  ) THEN
    RAISE EXCEPTION
      'Resident not found.';
  END IF;

  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id = p_due_type;

  IF v_due.billing_scope <> 'resident' THEN
    RAISE EXCEPTION
      'Select an Individual Resident due type.';
  END IF;

  IF v_due.amount <= 0 THEN
    RAISE EXCEPTION
      'The due type amount must be greater than zero.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'resident-billing:'
      || p_resident::text
      || ':'
      || p_due_type::text,
      0
    )
  );

  FOR v_period IN
    SELECT *
    FROM public.resident_invoice_periods(
      v_due.frequency,
      p_start,
      p_end
    )
  LOOP
    INSERT INTO public.invoices (
      house_id,
      resident_id,
      due_type_id,
      period_start,
      period_end,
      period_label,
      amount,
      amount_paid,
      status,
      due_date
    )
    VALUES (
      NULL,
      p_resident,
      p_due_type,
      v_period.bill_start,
      v_period.bill_end,
      v_period.bill_label,
      v_due.amount,
      0,
      'unpaid',
      v_period.bill_end
    )
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS
      v_row_count = ROW_COUNT;

    IF v_row_count = 1 THEN
      v_created :=
        v_created + 1;
    ELSE
      v_skipped :=
        v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'created',
    v_created,
    'skipped',
    v_skipped
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.generate_resident_invoices(
  uuid,
  uuid,
  date,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.generate_resident_invoices(
  uuid,
  uuid,
  date,
  date
)
TO authenticated;

-- ============================================================
-- 8. HOUSE INVOICE GENERATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_house_invoices(
  p_due_type uuid,
  p_period_label text,
  p_due_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due public.due_types%rowtype;
  v_created integer;
  v_total integer;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION
      'Not authorized';
  END IF;

  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id = p_due_type;

  IF v_due.billing_scope <> 'house' THEN
    RAISE EXCEPTION
      'Select a Household / Property due type.';
  END IF;

  IF coalesce(
    btrim(p_period_label),
    ''
  ) = '' THEN
    RAISE EXCEPTION
      'Enter a billing period.';
  END IF;

  IF v_due.amount <= 0 THEN
    RAISE EXCEPTION
      'The due type amount must be greater than zero.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'house-billing:'
      || p_due_type::text
      || ':'
      || public.normalize_label(
        p_period_label
      ),
      0
    )
  );

  SELECT count(*)
  INTO v_total
  FROM public.houses;

  INSERT INTO public.invoices (
    house_id,
    resident_id,
    due_type_id,
    period_label,
    amount,
    amount_paid,
    due_date,
    status
  )
  SELECT
    h.id,
    NULL,
    v_due.id,
    btrim(p_period_label),
    v_due.amount,
    0,
    p_due_date,
    'unpaid'
  FROM public.houses h
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS
    v_created = ROW_COUNT;

  RETURN jsonb_build_object(
    'created',
    v_created,
    'skipped',
    greatest(
      0,
      v_total - v_created
    )
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.generate_house_invoices(
  uuid,
  text,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.generate_house_invoices(
  uuid,
  text,
  date
)
TO authenticated;

-- ============================================================
-- 9. PAYMENT AUTHORIZATION
-- ============================================================

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
  r public.residents%rowtype;
  h public.houses%rowtype;
  item jsonb;
  inv public.invoices%rowtype;
  dt public.due_types%rowtype;
  m date;
  period text;
  due date;
  amount_due numeric;
  total_kobo bigint := 0;
  line_kobo bigint;
  lines jsonb := '[]'::jsonb;
  seen text[] := '{}';
  key text;
  house_payer boolean := false;

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

  IF r.house_id IS NOT NULL THEN
    SELECT *
    INTO STRICT h
    FROM public.houses
    WHERE id = r.house_id
    FOR UPDATE;

    house_payer :=
      CASE
        WHEN
          h.billing_responsible_resident_id
          IS NOT NULL
        THEN
          h.billing_responsible_resident_id = r.id
        ELSE
          r.relationship = 'owner'
      END;
  END IF;

  IF jsonb_typeof(p_items)
     IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items)
        NOT BETWEEN 1 AND 120
  THEN
    RAISE EXCEPTION
      'Choose between 1 and 120 payment items';
  END IF;

  IF NOT p_quote_only
     AND (
       p_reference IS NULL
       OR length(p_reference) < 10
     )
  THEN
    RAISE EXCEPTION
      'Missing payment reference';
  END IF;

  FOR item IN
    SELECT value
    FROM jsonb_array_elements(
      p_items
    )
  LOOP
    inv := NULL;

    IF item ? 'invoice_id' THEN
      SELECT *
      INTO STRICT inv
      FROM public.invoices
      WHERE id =
        (item->>'invoice_id')::uuid
      FOR UPDATE;

      IF inv.resident_id IS NOT NULL THEN
        IF inv.resident_id
           IS DISTINCT FROM r.id
        THEN
          RAISE EXCEPTION
            'This personal invoice belongs to another resident.';
        END IF;
      ELSIF inv.house_id IS NOT NULL THEN
        IF r.house_id
           IS DISTINCT FROM inv.house_id
        THEN
          RAISE EXCEPTION
            'This household invoice belongs to another house.';
        END IF;

        IF NOT house_payer THEN
          RAISE EXCEPTION
            'You are not the billing contact for this household.';
        END IF;
      ELSE
        RAISE EXCEPTION
          'Invoice has no valid billing target.';
      END IF;

      amount_due :=
        (item->>'amount')::numeric;

      IF amount_due IS NULL
         OR amount_due::text IN (
           'NaN',
           'Infinity',
           '-Infinity'
         )
         OR amount_due <= 0
         OR round(
           amount_due,
           2
         ) <> amount_due
         OR amount_due >
           (
             inv.amount
             -
             coalesce(
               inv.amount_paid,
               0
             )
           )
      THEN
        RAISE EXCEPTION
          'Enter an amount within the outstanding balance, with at most two decimal places';
      END IF;

      SELECT *
      INTO STRICT dt
      FROM public.due_types
      WHERE id = inv.due_type_id;

      period :=
        inv.period_label;

      due :=
        inv.due_date;

      key :=
        'invoice:'
        || inv.id::text;

    ELSE
      -- Advance payments remain HOUSEHOLD billing only.
      IF NOT house_payer THEN
        RAISE EXCEPTION
          'You are not responsible for this household''s bills';
      END IF;

      SELECT *
      INTO STRICT dt
      FROM public.due_types
      WHERE id =
        (item->>'due_type_id')::uuid
        AND billing_scope = 'house'
        AND name IN (
          'Service Charge',
          'CDA Levy'
        );

      IF coalesce(
        item->>'month',
        ''
      ) !~
        '^\d{4}-(0[1-9]|1[0-2])$'
      THEN
        RAISE EXCEPTION
          'Invalid billing month';
      END IF;

      m :=
        (
          (item->>'month')
          || '-01'
        )::date;

      IF m < current_month
         OR
         m >=
           current_month
           + interval '60 months'
      THEN
        RAISE EXCEPTION
          'Choose a month within the next five years';
      END IF;

      period :=
        to_char(
          m,
          'FMMonth YYYY'
        );

      due :=
        (
          m
          +
          interval '1 month - 1 day'
        )::date;

      SELECT *
      INTO inv
      FROM public.invoices
      WHERE house_id = h.id
        AND resident_id IS NULL
        AND due_type_id = dt.id
        AND
          public.normalize_label(
            period_label
          )
          =
          public.normalize_label(
            period
          )
      FOR UPDATE;

      amount_due :=
        CASE
          WHEN inv.id IS NULL
          THEN dt.amount
          ELSE greatest(
            0,
            inv.amount
            -
            coalesce(
              inv.amount_paid,
              0
            )
          )
        END;

      key :=
        'advance:'
        || dt.id::text
        || ':'
        || public.normalize_label(
          period
        );
    END IF;

    IF key = ANY(seen) THEN
      RAISE EXCEPTION
        'The same bill was selected more than once';
    END IF;

    seen :=
      array_append(
        seen,
        key
      );

    IF amount_due < 0
       OR dt.amount <= 0
    THEN
      RAISE EXCEPTION
        'Invalid charge amount';
    END IF;

    line_kobo :=
      round(
        amount_due * 100
      )::bigint;

    total_kobo :=
      total_kobo
      + line_kobo;

    IF NOT p_quote_only
       AND line_kobo > 0
       AND inv.id IS NULL
    THEN
      INSERT INTO public.invoices (
        house_id,
        resident_id,
        due_type_id,
        period_label,
        amount,
        due_date,
        status
      )
      VALUES (
        h.id,
        NULL,
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
      lines
      ||
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
      RAISE EXCEPTION
        'Nothing left to pay for';
    END IF;

    IF p_expected_kobo IS NULL
       OR
       total_kobo
       <> p_expected_kobo
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
      (x->>'amount_kobo')::numeric
        / 100,
      p_reference,
      'pending'
    FROM jsonb_array_elements(
      lines
    ) x
    WHERE
      (x->>'amount_kobo')::bigint
      > 0;
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

-- ============================================================
-- 10. MANUAL PAYMENTS
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_estate_manual_payment(
  p_invoice uuid,
  p_resident uuid,
  p_amount numeric,
  p_reference text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.invoices%rowtype;
  payment_id uuid;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION
      'Not authorized';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_reference,
      0
    )
  );

  SELECT id
  INTO payment_id
  FROM public.payments
  WHERE paystack_reference =
    p_reference;

  IF FOUND THEN
    RETURN payment_id;
  END IF;

  SELECT *
  INTO STRICT inv
  FROM public.invoices
  WHERE id = p_invoice
  FOR UPDATE;

  IF inv.resident_id IS NOT NULL THEN
    IF inv.resident_id
       IS DISTINCT FROM p_resident
    THEN
      RAISE EXCEPTION
        'This personal invoice belongs to another resident.';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.residents
      WHERE id = p_resident
        AND house_id = inv.house_id
    ) THEN
      RAISE EXCEPTION
        'Resident does not belong to this house.';
    END IF;
  END IF;

  IF p_amount IS NULL
     OR p_amount::text IN (
       'NaN',
       'Infinity',
       '-Infinity'
     )
     OR p_amount <= 0
     OR round(
       p_amount,
       2
     ) <> p_amount
     OR p_amount >
       (
         inv.amount
         -
         coalesce(
           inv.amount_paid,
           0
         )
       )
  THEN
    RAISE EXCEPTION
      'Invalid payment amount';
  END IF;

  INSERT INTO public.payments (
    invoice_id,
    resident_id,
    amount,
    paystack_reference,
    status,
    paid_at
  )
  VALUES (
    p_invoice,
    p_resident,
    p_amount,
    p_reference,
    'success',
    now()
  )
  RETURNING id
  INTO payment_id;

  UPDATE public.invoices
  SET
    amount_paid =
      coalesce(
        amount_paid,
        0
      )
      +
      p_amount,

    status =
      CASE
        WHEN
          coalesce(
            amount_paid,
            0
          )
          +
          p_amount
          >= amount
        THEN 'paid'
        ELSE 'partial'
      END
  WHERE id = p_invoice;

  RETURN payment_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.record_estate_manual_payment(
  uuid,
  uuid,
  numeric,
  text
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.record_estate_manual_payment(
  uuid,
  uuid,
  numeric,
  text
)
TO authenticated;

-- ============================================================
-- 11. EXISTING AUTOMATIC HOUSE CHARGES
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_estate_fixed_charges()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h public.houses%rowtype;
  d public.due_types%rowtype;
  period text;
  due date;
  n integer;
  created integer := 0;
  skipped integer := 0;

  m date :=
    date_trunc(
      'month',
      now() AT TIME ZONE 'Africa/Lagos'
    )::date;
BEGIN
  period :=
    to_char(
      m,
      'FMMonth YYYY'
    );

  due :=
    (
      m
      +
      interval '1 month - 1 day'
    )::date;

  IF (
    SELECT count(*)
    FROM public.due_types
    WHERE name IN (
      'Service Charge',
      'CDA Levy'
    )
      AND billing_scope = 'house'
  ) <> 2
  THEN
    RAISE EXCEPTION
      'Both fixed charges must be configured exactly once as Household / Property charges';
  END IF;

  FOR h IN
    SELECT *
    FROM public.houses
    ORDER BY id
    FOR UPDATE
  LOOP
    FOR d IN
      SELECT *
      FROM public.due_types
      WHERE name IN (
        'Service Charge',
        'CDA Levy'
      )
        AND billing_scope = 'house'
      ORDER BY id
    LOOP
      IF d.amount <= 0 THEN
        RAISE EXCEPTION
          'Fixed charge amount must be positive';
      END IF;

      INSERT INTO public.invoices (
        house_id,
        resident_id,
        due_type_id,
        period_label,
        amount,
        due_date,
        status
      )
      VALUES (
        h.id,
        NULL,
        d.id,
        period,
        d.amount,
        due,
        'unpaid'
      )
      ON CONFLICT DO NOTHING;

      GET DIAGNOSTICS
        n = ROW_COUNT;

      created :=
        created + n;

      skipped :=
        skipped + (
          1 - n
        );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'periodLabel',
    period,
    'created',
    created,
    'skipped',
    skipped
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.generate_estate_fixed_charges()
FROM public, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.generate_estate_fixed_charges()
TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;