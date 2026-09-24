BEGIN;

CREATE OR REPLACE FUNCTION public.generate_single_house_invoice(
  p_house uuid,
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
  v_house public.houses%rowtype;
  v_existing uuid;
  v_invoice uuid;
  v_period text;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Not authorized';
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
    RAISE EXCEPTION
      'Select a Household / Property due type.';
  END IF;

  IF v_due.amount <= 0 THEN
    RAISE EXCEPTION
      'The due type amount must be greater than zero.';
  END IF;

  v_period := btrim(coalesce(p_period_label, ''));

  IF v_period = '' THEN
    RAISE EXCEPTION 'Enter a billing period.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'single-house-billing:'
      || p_house::text
      || ':'
      || p_due_type::text
      || ':'
      || public.normalize_label(v_period),
      0
    )
  );

  SELECT i.id
  INTO v_existing
  FROM public.invoices i
  WHERE i.house_id = p_house
    AND i.resident_id IS NULL
    AND i.due_type_id = p_due_type
    AND public.normalize_label(i.period_label)
        = public.normalize_label(v_period)
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'created', 0,
      'skipped', 1,
      'invoice_id', v_existing,
      'house_id', v_house.id,
      'address', v_house.address
    );
  END IF;

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
  VALUES (
    p_house,
    NULL,
    p_due_type,
    v_period,
    v_due.amount,
    0,
    p_due_date,
    'unpaid'
  )
  RETURNING id
  INTO v_invoice;

  RETURN jsonb_build_object(
    'created', 1,
    'skipped', 0,
    'invoice_id', v_invoice,
    'house_id', v_house.id,
    'address', v_house.address
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.generate_single_house_invoice(
  uuid,
  uuid,
  text,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.generate_single_house_invoice(
  uuid,
  uuid,
  text,
  date
)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;