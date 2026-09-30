BEGIN;

-- ============================================================
-- COLLECTED PAYMENTS REPORT — CANONICAL TRANSACTION IDS
--
-- Phase 6C
--
-- Accounting/report rows remain allocation-based so that:
--
--   invoice
--   charge type
--   billing period
--   allocated amount
--
-- remain visible independently.
--
-- However, Payment ID must identify the real payment
-- transaction rather than the individual allocation row.
--
-- Example:
--
--   PAY-202609-000123
--       -> Service Charge / Jan / 3,000
--       -> Service Charge / Feb / 3,000
--       -> CDA Levy       / Jan / 2,000
--
-- All rows above carry the same Payment ID.
-- ============================================================


CREATE OR REPLACE FUNCTION
  public.admin_collected_payments_page(
    p_from date,
    p_to date,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
  )

RETURNS jsonb

LANGUAGE plpgsql

STABLE

SECURITY DEFINER

SET search_path =
  public,
  pg_temp

AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- ----------------------------------------------------------
  -- ACCESS CONTROL
  -- ----------------------------------------------------------

  IF NOT public.is_estate_admin()
  THEN
    RAISE EXCEPTION
      'Only estate administrators can view collected payments'
      USING ERRCODE = '42501';
  END IF;


  -- ----------------------------------------------------------
  -- INPUT VALIDATION
  -- ----------------------------------------------------------

  IF
    p_from IS NULL
    OR p_to IS NULL
    OR p_to < p_from
  THEN
    RAISE EXCEPTION
      'Invalid report date range';
  END IF;


  IF
    p_limit < 1
    OR p_limit > 500
  THEN
    RAISE EXCEPTION
      'Report page size must be between 1 and 500';
  END IF;


  IF p_offset < 0
  THEN
    RAISE EXCEPTION
      'Report offset cannot be negative';
  END IF;


  -- ----------------------------------------------------------
  -- COLLECTED PAYMENT ALLOCATIONS
  --
  -- We intentionally retain one row per allocation.
  --
  -- payment_transactions.payment_code is the canonical
  -- real-world Payment ID.
  -- ----------------------------------------------------------

  WITH base AS (
    SELECT
      p.id,

      p.paid_at,

      p.amount::numeric
        AS amount,

      jsonb_build_object(
        'house',
          COALESCE(
            h.address,
            r.full_name,
            '—'
          ),

        'charge',
          COALESCE(
            dt.name,
            'Estate charge'
          ),

        'period',
          COALESCE(
            i.period_label,
            '—'
          ),

        'amount',
          p.amount,

        'date',
          p.paid_at,

        'reference',
          COALESCE(
            t.payment_code,
            p.payment_code,
            p.paystack_reference,
            '—'
          )
      ) AS row_data

    FROM public.payments p

    LEFT JOIN public.payment_transactions t
      ON t.id =
        p.transaction_id

    LEFT JOIN public.invoices i
      ON i.id =
        p.invoice_id

    LEFT JOIN public.houses h
      ON h.id =
        i.house_id

    LEFT JOIN public.residents r
      ON r.id =
        i.resident_id

    LEFT JOIN public.due_types dt
      ON dt.id =
        i.due_type_id

    WHERE
      p.status =
        'success'

      AND p.paid_at >=
        (
          p_from::timestamp
          AT TIME ZONE
            'Africa/Lagos'
        )

      AND p.paid_at <
        (
          (p_to + 1)::timestamp
          AT TIME ZONE
            'Africa/Lagos'
        )
  ),

  page_rows AS (
    SELECT *

    FROM base

    ORDER BY
      paid_at DESC,
      id

    LIMIT p_limit

    OFFSET p_offset
  )

  SELECT
    jsonb_build_object(
      'total',
        (
          SELECT count(*)

          FROM base
        ),

      'total_amount',
        COALESCE(
          (
            SELECT SUM(
              amount
            )

            FROM base
          ),
          0
        ),

      'rows',
        COALESCE(
          (
            SELECT jsonb_agg(
              row_data

              ORDER BY
                paid_at DESC,
                id
            )

            FROM page_rows
          ),
          '[]'::jsonb
        )
    )

  INTO
    v_result;


  RETURN
    v_result;
END;
$$;


REVOKE ALL

ON FUNCTION
  public.admin_collected_payments_page(
    date,
    date,
    integer,
    integer
  )

FROM
  PUBLIC,
  anon;


GRANT EXECUTE

ON FUNCTION
  public.admin_collected_payments_page(
    date,
    date,
    integer,
    integer
  )

TO
  authenticated,
  service_role;


NOTIFY pgrst, 'reload schema';

COMMIT;