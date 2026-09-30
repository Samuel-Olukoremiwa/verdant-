
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_dashboard_summary(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
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
    RAISE EXCEPTION
      'Only estate administrators can view dashboard financials'
      USING ERRCODE = '42501';
  END IF;

  IF
    (p_from IS NULL AND p_to IS NOT NULL)
    OR
    (p_from IS NOT NULL AND p_to IS NULL)
  THEN
    RAISE EXCEPTION
      'Both p_from and p_to must be supplied together';
  END IF;

  IF
    p_from IS NOT NULL
    AND p_to < p_from
  THEN
    RAISE EXCEPTION
      'p_to cannot be earlier than p_from';
  END IF;

  WITH selected_invoices AS (
    SELECT
      i.id,
      i.house_id,
      i.resident_id,
      i.amount::numeric AS amount,
      COALESCE(i.amount_paid, 0)::numeric AS amount_paid,
      COALESCE(dt.name, 'Other charges') AS charge_name
    FROM public.invoices i
    LEFT JOIN public.due_types dt ON dt.id = i.due_type_id
    WHERE
      p_from IS NULL
      OR (
        i.due_date >= p_from
        AND i.due_date <= p_to
      )
  ),
  selected_payments AS (
    SELECT
      p.amount::numeric AS amount,
      COALESCE(dt.name, 'Other charges') AS charge_name
    FROM public.payments p
    LEFT JOIN public.invoices i ON i.id = p.invoice_id
    LEFT JOIN public.due_types dt ON dt.id = i.due_type_id
    WHERE
      p.status = 'success'
      AND (
        p_from IS NULL
        OR (
          p.paid_at IS NOT NULL
          AND (p.paid_at AT TIME ZONE 'Africa/Lagos')::date >= p_from
          AND (p.paid_at AT TIME ZONE 'Africa/Lagos')::date <= p_to
        )
      )
  ),
  selected_expenses AS (
    SELECT e.amount::numeric AS amount
    FROM public.expenses e
    WHERE
      p_from IS NULL
      OR (
        e.expense_date >= p_from
        AND e.expense_date <= p_to
      )
  ),
  invoice_totals AS (
    SELECT
      charge_name,
      SUM(amount) AS billed,
      SUM(GREATEST(0::numeric, amount - amount_paid)) AS outstanding
    FROM selected_invoices
    GROUP BY charge_name
  ),
  payment_totals AS (
    SELECT
      charge_name,
      SUM(amount) AS collected
    FROM selected_payments
    GROUP BY charge_name
  ),
  charge_names AS (
    SELECT 'Service Charge'::text AS name
    UNION
    SELECT 'CDA Levy'::text
    UNION
    SELECT charge_name FROM selected_invoices
    UNION
    SELECT charge_name FROM selected_payments
  ),
  charge_rows AS (
    SELECT
      names.name,
      COALESCE(invoice_totals.billed, 0)::numeric AS billed,
      COALESCE(payment_totals.collected, 0)::numeric AS collected,
      COALESCE(invoice_totals.outstanding, 0)::numeric AS outstanding
    FROM charge_names names
    LEFT JOIN invoice_totals
      ON invoice_totals.charge_name = names.name
    LEFT JOIN payment_totals
      ON payment_totals.charge_name = names.name
  ),
  totals AS (
    SELECT
      COALESCE((SELECT SUM(amount) FROM selected_invoices), 0)::numeric AS billed,
      COALESCE((SELECT SUM(amount) FROM selected_payments), 0)::numeric AS collected,
      COALESCE((SELECT SUM(GREATEST(0::numeric, amount - amount_paid)) FROM selected_invoices), 0)::numeric AS outstanding,
      COALESCE((SELECT SUM(amount) FROM selected_expenses), 0)::numeric AS spent,
      (
        SELECT COUNT(DISTINCT house_id)
        FROM selected_invoices
        WHERE house_id IS NOT NULL
      )::integer AS homes,
      (
        SELECT COUNT(DISTINCT resident_id)
        FROM selected_invoices
        WHERE resident_id IS NOT NULL
      )::integer AS residents
  )
  SELECT
    jsonb_build_object(
      'billed', totals.billed,
      'collected', totals.collected,
      'outstanding', totals.outstanding,
      'homes', totals.homes,
      'residents', totals.residents,
      'spent', totals.spent,
      'balance', totals.collected - totals.spent,
      'charges',
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'name', charge_rows.name,
                'billed', charge_rows.billed,
                'collected', charge_rows.collected,
                'outstanding', charge_rows.outstanding
              )
              ORDER BY
                CASE
                  WHEN charge_rows.name = 'Service Charge' THEN 0
                  WHEN charge_rows.name = 'CDA Levy' THEN 1
                  ELSE 2
                END,
                charge_rows.name
            )
            FROM charge_rows
          ),
          '[]'::jsonb
        )
    )
  INTO v_result
  FROM totals;

  RETURN v_result;
END;
$$;

REVOKE ALL
ON FUNCTION public.admin_dashboard_summary(date, date)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.admin_dashboard_summary(date, date)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_house_balances()
RETURNS TABLE (
  id uuid,
  address text,
  street_id uuid,
  street text,
  owed numeric,
  paid numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION
      'Only estate administrators can view household balances'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    h.id,
    h.address,
    h.street_id,
    COALESCE(s.name, 'Unassigned street') AS street,
    SUM(i.amount)::numeric AS owed,
    SUM(COALESCE(i.amount_paid, 0))::numeric AS paid
  FROM public.invoices i
  JOIN public.houses h
    ON h.id = i.house_id
  LEFT JOIN public.streets s
    ON s.id = h.street_id
  WHERE i.house_id IS NOT NULL
  GROUP BY
    h.id,
    h.address,
    h.street_id,
    s.name
  ORDER BY
    (
      SUM(i.amount)
      -
      SUM(COALESCE(i.amount_paid, 0))
    ) DESC,
    h.address;
END;
$$;

REVOKE ALL
ON FUNCTION public.admin_house_balances()
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.admin_house_balances()
TO authenticated, service_role;

COMMIT;
;
