BEGIN;

-- Clean up matching signatures from earlier structured-billing attempts.
-- PostgreSQL will not let CREATE OR REPLACE remove existing parameter defaults,
-- so we explicitly drop these RPC signatures before recreating them below.
DROP FUNCTION IF EXISTS public.generate_house_invoices(
  uuid,
  date,
  date,
  date
);

DROP FUNCTION IF EXISTS public.generate_single_house_invoice(
  uuid,
  uuid,
  date,
  date,
  date
);

DROP FUNCTION IF EXISTS public.preview_resident_invoices(
  uuid,
  uuid,
  date,
  date,
  date
);

DROP FUNCTION IF EXISTS public.generate_resident_invoices(
  uuid,
  uuid,
  date,
  date,
  date
);

-- ============================================================
-- VERDANT
-- Multi-period single-house billing + resident due dates
-- ============================================================

CREATE OR REPLACE FUNCTION public.canonical_billing_frequency(
  p_frequency text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE lower(btrim(coalesce(p_frequency, '')))
    WHEN 'monthly' THEN 'monthly'
    WHEN 'quarterly' THEN 'quarterly'
    WHEN 'yearly' THEN 'yearly'
    WHEN 'annual' THEN 'yearly'
    WHEN 'annually' THEN 'yearly'
    WHEN 'one-time' THEN 'one-time'
    WHEN 'one_time' THEN 'one-time'
    WHEN 'one time' THEN 'one-time'
    WHEN 'one-off' THEN 'one-time'
    WHEN 'oneoff' THEN 'one-time'
    WHEN 'once' THEN 'one-time'
    ELSE lower(btrim(coalesce(p_frequency, '')))
  END;
$$;

CREATE OR REPLACE FUNCTION public.house_billing_period_label(
  p_frequency text,
  p_start date,
  p_end date
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_frequency text;
  v_quarter integer;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_start > p_end THEN
    RAISE EXCEPTION 'Choose a valid billing period.';
  END IF;

  v_frequency := public.canonical_billing_frequency(p_frequency);

  IF v_frequency = 'monthly' THEN
    IF p_start <> date_trunc('month', p_start)::date
       OR p_end <> (date_trunc('month', p_start) + interval '1 month - 1 day')::date
    THEN
      RAISE EXCEPTION 'Monthly billing must cover one complete calendar month.';
    END IF;

    RETURN to_char(p_start, 'FMMonth YYYY');
  END IF;

  IF v_frequency = 'quarterly' THEN
    IF extract(month FROM p_start)::integer NOT IN (1, 4, 7, 10)
       OR extract(day FROM p_start)::integer <> 1
       OR p_end <> (p_start + interval '3 months - 1 day')::date
    THEN
      RAISE EXCEPTION 'Quarterly billing must cover one complete calendar quarter.';
    END IF;

    v_quarter := ((extract(month FROM p_start)::integer - 1) / 3) + 1;

    RETURN 'Q' || v_quarter::text || ' ' || extract(year FROM p_start)::integer::text;
  END IF;

  IF v_frequency = 'yearly' THEN
    IF p_start <> make_date(extract(year FROM p_start)::integer, 1, 1)
       OR p_end <> make_date(extract(year FROM p_start)::integer, 12, 31)
    THEN
      RAISE EXCEPTION 'Yearly billing must cover one complete calendar year.';
    END IF;

    RETURN extract(year FROM p_start)::integer::text;
  END IF;

  RETURN to_char(p_start, 'DD/MM/YYYY') || ' - ' || to_char(p_end, 'DD/MM/YYYY');
END;
$$;

-- Produce canonical invoice periods across a selected range.
CREATE OR REPLACE FUNCTION public.billing_periods_canonical(
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
  v_frequency text;
  v_cursor date;
  v_period_end date;
  v_sequence integer := 0;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_start > p_end THEN
    RAISE EXCEPTION 'Choose a valid billing date range.';
  END IF;

  v_frequency := public.canonical_billing_frequency(p_frequency);

  IF v_frequency = 'monthly' THEN
    IF p_start <> date_trunc('month', p_start)::date
       OR p_end <> (date_trunc('month', p_end) + interval '1 month - 1 day')::date
    THEN
      RAISE EXCEPTION 'Monthly From/To values must cover complete calendar months.';
    END IF;

    v_cursor := p_start;

    WHILE v_cursor <= p_end LOOP
      v_period_end := (date_trunc('month', v_cursor) + interval '1 month - 1 day')::date;
      v_sequence := v_sequence + 1;

      sequence_no := v_sequence;
      bill_start := v_cursor;
      bill_end := v_period_end;
      bill_label := to_char(v_cursor, 'FMMonth YYYY');
      RETURN NEXT;

      v_cursor := (v_cursor + interval '1 month')::date;
    END LOOP;

    RETURN;
  END IF;

  IF v_frequency = 'quarterly' THEN
    IF extract(month FROM p_start)::integer NOT IN (1, 4, 7, 10)
       OR extract(day FROM p_start)::integer <> 1
       OR extract(month FROM p_end)::integer NOT IN (3, 6, 9, 12)
       OR p_end <> (date_trunc('month', p_end) + interval '1 month - 1 day')::date
    THEN
      RAISE EXCEPTION 'Quarterly From/To values must cover complete calendar quarters.';
    END IF;

    v_cursor := p_start;

    WHILE v_cursor <= p_end LOOP
      v_period_end := (v_cursor + interval '3 months - 1 day')::date;

      IF v_period_end > p_end THEN
        RAISE EXCEPTION 'The selected quarterly range does not end on a complete quarter.';
      END IF;

      v_sequence := v_sequence + 1;
      sequence_no := v_sequence;
      bill_start := v_cursor;
      bill_end := v_period_end;
      bill_label :=
        'Q'
        || (((extract(month FROM v_cursor)::integer - 1) / 3) + 1)::text
        || ' '
        || extract(year FROM v_cursor)::integer::text;
      RETURN NEXT;

      v_cursor := (v_cursor + interval '3 months')::date;
    END LOOP;

    RETURN;
  END IF;

  IF v_frequency = 'yearly' THEN
    IF p_start <> make_date(extract(year FROM p_start)::integer, 1, 1)
       OR p_end <> make_date(extract(year FROM p_end)::integer, 12, 31)
    THEN
      RAISE EXCEPTION 'Yearly From/To values must cover complete calendar years.';
    END IF;

    v_cursor := p_start;

    WHILE v_cursor <= p_end LOOP
      v_period_end := make_date(extract(year FROM v_cursor)::integer, 12, 31);
      v_sequence := v_sequence + 1;

      sequence_no := v_sequence;
      bill_start := v_cursor;
      bill_end := v_period_end;
      bill_label := extract(year FROM v_cursor)::integer::text;
      RETURN NEXT;

      v_cursor := make_date(extract(year FROM v_cursor)::integer + 1, 1, 1);
    END LOOP;

    RETURN;
  END IF;

  -- One-time / legacy custom frequency = one invoice for the explicit range.
  sequence_no := 1;
  bill_start := p_start;
  bill_end := p_end;
  bill_label := to_char(p_start, 'DD/MM/YYYY') || ' - ' || to_char(p_end, 'DD/MM/YYYY');
  RETURN NEXT;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS hybrid_house_invoice_period_dates_unique
ON public.invoices (
  house_id,
  due_type_id,
  period_start,
  period_end
)
WHERE house_id IS NOT NULL
  AND resident_id IS NULL
  AND period_start IS NOT NULL
  AND period_end IS NOT NULL;

-- ============================================================
-- SINGLE HOUSEHOLD RANGE PREVIEW
-- ============================================================

CREATE OR REPLACE FUNCTION public.preview_single_house_invoices_range(
  p_house uuid,
  p_due_type uuid,
  p_start date,
  p_end date,
  p_due_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_house public.houses%rowtype;
  v_due public.due_types%rowtype;
  v_period record;
  v_periods jsonb := '[]'::jsonb;
  v_exists boolean;
  v_create_count integer := 0;
  v_duplicate_count integer := 0;
  v_total numeric := 0;
  v_contact_id uuid;
  v_contact_name text;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'Choose a due date.';
  END IF;

  SELECT *
  INTO STRICT v_house
  FROM public.houses
  WHERE id = p_house;

  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id = p_due_type;

  IF v_due.billing_scope <> 'house' THEN
    RAISE EXCEPTION 'Select a Household / Property due type.';
  END IF;

  IF v_due.amount <= 0 THEN
    RAISE EXCEPTION 'The due type amount must be greater than zero.';
  END IF;

  v_contact_id := v_house.billing_responsible_resident_id;

  IF v_contact_id IS NULL THEN
    SELECT r.id
    INTO v_contact_id
    FROM public.residents r
    WHERE r.house_id = p_house
      AND r.is_active
      AND r.relationship = 'owner'
    ORDER BY r.id
    LIMIT 1;
  END IF;

  IF v_contact_id IS NOT NULL THEN
    SELECT r.full_name
    INTO v_contact_name
    FROM public.residents r
    WHERE r.id = v_contact_id;
  END IF;

  FOR v_period IN
    SELECT *
    FROM public.billing_periods_canonical(
      v_due.frequency,
      p_start,
      p_end
    )
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.house_id = p_house
        AND i.resident_id IS NULL
        AND i.due_type_id = p_due_type
        AND (
          (
            i.period_start = v_period.bill_start
            AND i.period_end = v_period.bill_end
          )
          OR
          (
            i.period_start IS NULL
            AND i.period_end IS NULL
            AND public.normalize_label(i.period_label)
                = public.normalize_label(v_period.bill_label)
          )
        )
    )
    INTO v_exists;

    IF v_exists THEN
      v_duplicate_count := v_duplicate_count + 1;
    ELSE
      v_create_count := v_create_count + 1;
      v_total := v_total + v_due.amount;
    END IF;

    v_periods := v_periods || jsonb_build_array(
      jsonb_build_object(
        'period_start', v_period.bill_start,
        'period_end', v_period.bill_end,
        'period_label', v_period.bill_label,
        'due_date', p_due_date,
        'amount', v_due.amount,
        'already_exists', v_exists
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'house_id', v_house.id,
    'address', v_house.address,
    'due_type_id', v_due.id,
    'due_type_name', v_due.name,
    'frequency', v_due.frequency,
    'amount_per_period', v_due.amount,
    'billing_contact_id', v_contact_id,
    'billing_contact_name', v_contact_name,
    'periods', v_periods,
    'create_count', v_create_count,
    'duplicate_count', v_duplicate_count,
    'total_to_create', v_total
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.preview_single_house_invoices_range(
  uuid,
  uuid,
  date,
  date,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.preview_single_house_invoices_range(
  uuid,
  uuid,
  date,
  date,
  date
)
TO authenticated;

-- ============================================================
-- SINGLE HOUSEHOLD RANGE GENERATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_single_house_invoices_range(
  p_house uuid,
  p_due_type uuid,
  p_start date,
  p_end date,
  p_due_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_house public.houses%rowtype;
  v_due public.due_types%rowtype;
  v_period record;
  v_exists uuid;
  v_created integer := 0;
  v_skipped integer := 0;
  v_row_count integer;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'Choose a due date.';
  END IF;

  SELECT *
  INTO STRICT v_house
  FROM public.houses
  WHERE id = p_house;

  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id = p_due_type;

  IF v_due.billing_scope <> 'house' THEN
    RAISE EXCEPTION 'Select a Household / Property due type.';
  END IF;

  IF v_due.amount <= 0 THEN
    RAISE EXCEPTION 'The due type amount must be greater than zero.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'single-house-range:'
      || p_house::text
      || ':'
      || p_due_type::text
      || ':'
      || p_start::text
      || ':'
      || p_end::text,
      0
    )
  );

  FOR v_period IN
    SELECT *
    FROM public.billing_periods_canonical(
      v_due.frequency,
      p_start,
      p_end
    )
  LOOP
    v_exists := NULL;

    SELECT i.id
    INTO v_exists
    FROM public.invoices i
    WHERE i.house_id = p_house
      AND i.resident_id IS NULL
      AND i.due_type_id = p_due_type
      AND (
        (
          i.period_start = v_period.bill_start
          AND i.period_end = v_period.bill_end
        )
        OR
        (
          i.period_start IS NULL
          AND i.period_end IS NULL
          AND public.normalize_label(i.period_label)
              = public.normalize_label(v_period.bill_label)
        )
      )
    LIMIT 1;

    IF v_exists IS NOT NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.invoices (
      house_id,
      resident_id,
      due_type_id,
      period_start,
      period_end,
      period_label,
      amount,
      amount_paid,
      due_date,
      status
    )
    VALUES (
      p_house,
      NULL,
      p_due_type,
      v_period.bill_start,
      v_period.bill_end,
      v_period.bill_label,
      v_due.amount,
      0,
      p_due_date,
      'unpaid'
    )
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 1 THEN
      v_created := v_created + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'skipped', v_skipped,
    'house_id', v_house.id,
    'address', v_house.address
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.generate_single_house_invoices_range(
  uuid,
  uuid,
  date,
  date,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.generate_single_house_invoices_range(
  uuid,
  uuid,
  date,
  date,
  date
)
TO authenticated;

-- ============================================================
-- STRUCTURED SINGLE PERIOD WRAPPER (kept for compatibility)
-- ============================================================

DROP FUNCTION IF EXISTS public.generate_single_house_invoice(
  uuid,
  uuid,
  text,
  date
);

CREATE OR REPLACE FUNCTION public.generate_single_house_invoice(
  p_house uuid,
  p_due_type uuid,
  p_period_start date,
  p_period_end date,
  p_due_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due public.due_types%rowtype;
  v_label text;
BEGIN
  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id = p_due_type;

  -- This validates that the range represents exactly one canonical period.
  v_label := public.house_billing_period_label(
    v_due.frequency,
    p_period_start,
    p_period_end
  );

  RETURN public.generate_single_house_invoices_range(
    p_house,
    p_due_type,
    p_period_start,
    p_period_end,
    p_due_date
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.generate_single_house_invoice(
  uuid,
  uuid,
  date,
  date,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.generate_single_house_invoice(
  uuid,
  uuid,
  date,
  date,
  date
)
TO authenticated;

-- ============================================================
-- ALL HOUSEHOLDS: ONE STRUCTURED PERIOD AT A TIME
-- ============================================================

DROP FUNCTION IF EXISTS public.generate_house_invoices(
  uuid,
  text,
  date
);

CREATE OR REPLACE FUNCTION public.generate_house_invoices(
  p_due_type uuid,
  p_period_start date,
  p_period_end date,
  p_due_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due public.due_types%rowtype;
  v_period_label text;
  v_created integer := 0;
  v_skipped integer := 0;
  v_house record;
  v_result jsonb;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'Choose a due date.';
  END IF;

  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id = p_due_type;

  IF v_due.billing_scope <> 'house' THEN
    RAISE EXCEPTION 'Select a Household / Property due type.';
  END IF;

  IF v_due.amount <= 0 THEN
    RAISE EXCEPTION 'The due type amount must be greater than zero.';
  END IF;

  -- Deliberately validates ONE canonical period only for estate-wide billing.
  v_period_label := public.house_billing_period_label(
    v_due.frequency,
    p_period_start,
    p_period_end
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'all-house-billing:'
      || p_due_type::text
      || ':'
      || p_period_start::text
      || ':'
      || p_period_end::text,
      0
    )
  );

  FOR v_house IN
    SELECT id
    FROM public.houses
    ORDER BY id
  LOOP
    v_result := public.generate_single_house_invoice(
      v_house.id,
      p_due_type,
      p_period_start,
      p_period_end,
      p_due_date
    );

    v_created := v_created + coalesce((v_result->>'created')::integer, 0);
    v_skipped := v_skipped + coalesce((v_result->>'skipped')::integer, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'skipped', v_skipped,
    'period_label', v_period_label,
    'period_start', p_period_start,
    'period_end', p_period_end
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.generate_house_invoices(
  uuid,
  date,
  date,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.generate_house_invoices(
  uuid,
  date,
  date,
  date
)
TO authenticated;

-- ============================================================
-- RESIDENT PREVIEW WITH EXPLICIT DUE DATE
-- ============================================================

DROP FUNCTION IF EXISTS public.preview_resident_invoices(
  uuid,
  uuid,
  date,
  date
);

CREATE OR REPLACE FUNCTION public.preview_resident_invoices(
  p_resident uuid,
  p_due_type uuid,
  p_start date,
  p_end date,
  p_due_date date
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
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'Choose a due date.';
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
    RAISE EXCEPTION 'Select an Individual Resident due type.';
  END IF;

  IF v_due.amount <= 0 THEN
    RAISE EXCEPTION 'The due type amount must be greater than zero.';
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
      v_duplicate_count := v_duplicate_count + 1;
    ELSE
      v_create_count := v_create_count + 1;
      v_total := v_total + v_due.amount;
    END IF;

    v_periods := v_periods || jsonb_build_array(
      jsonb_build_object(
        'period_start', v_period.bill_start,
        'period_end', v_period.bill_end,
        'period_label', v_period.bill_label,
        'due_date', p_due_date,
        'amount', v_due.amount,
        'already_exists', v_exists
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'resident_id', v_resident.id,
    'resident_name', v_resident.full_name,
    'due_type_id', v_due.id,
    'due_type_name', v_due.name,
    'frequency', v_due.frequency,
    'amount_per_period', v_due.amount,
    'periods', v_periods,
    'create_count', v_create_count,
    'duplicate_count', v_duplicate_count,
    'total_to_create', v_total
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.preview_resident_invoices(
  uuid,
  uuid,
  date,
  date,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.preview_resident_invoices(
  uuid,
  uuid,
  date,
  date,
  date
)
TO authenticated;

-- ============================================================
-- RESIDENT GENERATION WITH EXPLICIT DUE DATE
-- ============================================================

DROP FUNCTION IF EXISTS public.generate_resident_invoices(
  uuid,
  uuid,
  date,
  date
);

CREATE OR REPLACE FUNCTION public.generate_resident_invoices(
  p_resident uuid,
  p_due_type uuid,
  p_start date,
  p_end date,
  p_due_date date
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
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'Choose a due date.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.residents
    WHERE id = p_resident
  ) THEN
    RAISE EXCEPTION 'Resident not found.';
  END IF;

  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id = p_due_type;

  IF v_due.billing_scope <> 'resident' THEN
    RAISE EXCEPTION 'Select an Individual Resident due type.';
  END IF;

  IF v_due.amount <= 0 THEN
    RAISE EXCEPTION 'The due type amount must be greater than zero.';
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
      p_due_date
    )
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 1 THEN
      v_created := v_created + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'skipped', v_skipped
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.generate_resident_invoices(
  uuid,
  uuid,
  date,
  date,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.generate_resident_invoices(
  uuid,
  uuid,
  date,
  date,
  date
)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
