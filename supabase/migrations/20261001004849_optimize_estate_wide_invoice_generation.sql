BEGIN;

-- ============================================================
-- OPTIMIZE ESTATE-WIDE HOUSEHOLD INVOICE GENERATION
--
-- Previously generate_house_invoices(...) looped through every
-- house and called generate_single_house_invoice(...) once per
-- property.
--
-- That approach is correct, but its runtime grows with the
-- number of houses and places the entire browser-triggered RPC
-- behind the authenticated PostgREST statement timeout.
--
-- This version preserves:
--
--   * estate-admin authorization
--   * household-only due types
--   * positive charge validation
--   * canonical billing-period validation
--   * the estate-wide advisory transaction lock
--   * legacy period-label duplicate detection
--   * structured period-date duplicate detection
--   * atomic generation
--   * { created, skipped, period_* } return shape
--
-- The difference is that every household is now processed by
-- one INSERT ... SELECT statement instead of one nested
-- function invocation per house.
-- ============================================================

CREATE OR REPLACE FUNCTION
  public.generate_house_invoices(
    p_due_type uuid,
    p_period_start date,
    p_period_end date,
    p_due_date date
  )
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_due public.due_types%rowtype;

  v_period_label text;

  v_house_count integer :=
    0;

  v_created integer :=
    0;

  v_skipped integer :=
    0;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION
      'Not authorized';
  END IF;

  IF p_due_date IS NULL THEN
    RAISE EXCEPTION
      'Choose a due date.';
  END IF;

  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id =
    p_due_type;

  IF v_due.billing_scope <>
    'house'
  THEN
    RAISE EXCEPTION
      'Select a Household / Property due type.';
  END IF;

  IF v_due.amount <=
    0
  THEN
    RAISE EXCEPTION
      'The due type amount must be greater than zero.';
  END IF;

  -- Validate that estate-wide billing represents exactly one
  -- canonical period and obtain its canonical label.
  v_period_label :=
    public.house_billing_period_label(
      v_due.frequency,
      p_period_start,
      p_period_end
    );

  -- Serialize duplicate estate-wide generation attempts for
  -- the same due type and period.
  PERFORM
    pg_advisory_xact_lock(
      hashtextextended(
        'all-house-billing:'
        ||
        p_due_type::text
        ||
        ':'
        ||
        p_period_start::text
        ||
        ':'
        ||
        p_period_end::text,
        0
      )
    );

  /*
   * candidate_houses and inserted are evaluated as one
   * statement/snapshot.
   *
   * NOT EXISTS handles both:
   *
   *   1. Current structured invoices using period_start /
   *      period_end.
   *
   *   2. Older invoices that have only period_label.
   *
   * ON CONFLICT DO NOTHING remains the final concurrency
   * safeguard if another compatible billing path inserts the
   * same invoice at the same time.
   */
  WITH candidate_houses AS (
    SELECT
      h.id

    FROM public.houses h
  ),

  inserted AS (
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

    SELECT
      h.id,
      NULL,
      p_due_type,
      p_period_start,
      p_period_end,
      v_period_label,
      v_due.amount,
      0,
      p_due_date,
      'unpaid'

    FROM candidate_houses h

    WHERE NOT EXISTS (
      SELECT
        1

      FROM public.invoices i

      WHERE
        i.house_id =
          h.id

        AND i.resident_id
          IS NULL

        AND i.due_type_id =
          p_due_type

        AND (
          (
            i.period_start =
              p_period_start

            AND i.period_end =
              p_period_end
          )

          OR

          (
            i.period_start
              IS NULL

            AND i.period_end
              IS NULL

            AND
              public.normalize_label(
                i.period_label
              )
              =
              public.normalize_label(
                v_period_label
              )
          )
        )
    )

    ON CONFLICT DO NOTHING

    RETURNING 1
  )

  SELECT
    (
      SELECT
        count(*)::integer

      FROM candidate_houses
    ),

    (
      SELECT
        count(*)::integer

      FROM inserted
    )

  INTO
    v_house_count,
    v_created;

  v_skipped :=
    v_house_count -
    v_created;

  RETURN
    jsonb_build_object(
      'created',
      v_created,

      'skipped',
      v_skipped,

      'period_label',
      v_period_label,

      'period_start',
      p_period_start,

      'period_end',
      p_period_end
    );
END;
$function$;

COMMIT;