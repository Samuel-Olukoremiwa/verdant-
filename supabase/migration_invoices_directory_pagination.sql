BEGIN;

CREATE OR REPLACE FUNCTION public.admin_invoices_page(
  p_query text DEFAULT NULL,
  p_target text DEFAULT NULL,
  p_scope text DEFAULT 'all',
  p_charge text DEFAULT NULL,
  p_period text DEFAULT NULL,
  p_due_date text DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_outstanding text DEFAULT 'all',
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
  v_query text :=
    lower(
      btrim(
        coalesce(
          p_query,
          ''
        )
      )
    );

  v_result jsonb;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION
      'Only estate administrators can view invoices'
      USING ERRCODE = '42501';
  END IF;

  IF p_scope NOT IN (
    'all',
    'house',
    'resident'
  ) THEN
    RAISE EXCEPTION
      'Invalid invoice scope filter';
  END IF;

  IF p_status NOT IN (
    'all',
    'unpaid',
    'partial',
    'paid',
    'overdue'
  ) THEN
    RAISE EXCEPTION
      'Invalid invoice status filter';
  END IF;

  IF p_outstanding NOT IN (
    'all',
    'positive',
    'zero',
    'under5000',
    '5000plus'
  ) THEN
    RAISE EXCEPTION
      'Invalid outstanding filter';
  END IF;

  IF
    p_due_date IS NOT NULL
    AND p_due_date <> '__none__'
    AND p_due_date !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  THEN
    RAISE EXCEPTION
      'Invalid due date filter';
  END IF;

  IF
    p_limit < 1
    OR p_limit > 100
  THEN
    RAISE EXCEPTION
      'Page size must be between 1 and 100';
  END IF;

  IF p_offset < 0 THEN
    RAISE EXCEPTION
      'Offset cannot be negative';
  END IF;

  WITH invoice_base AS (
    SELECT
      i.id,

      i.created_at,

      i.house_id,

      i.resident_id,

      i.period_label,

      i.amount::numeric AS amount,

      COALESCE(
        i.amount_paid,
        0
      )::numeric AS amount_paid,

      i.status,

      i.due_date,

      CASE
        WHEN i.resident_id IS NOT NULL
          THEN COALESCE(
            r.full_name,
            'Resident'
          )

        ELSE COALESCE(
          h.address,
          'Household'
        )
      END AS target,

      CASE
        WHEN i.resident_id IS NOT NULL
          THEN 'resident'

        ELSE 'house'
      END AS scope_key,

      CASE
        WHEN i.resident_id IS NOT NULL
          THEN 'Individual Resident'

        ELSE 'Household / Property'
      END AS scope_label,

      COALESCE(
        dt.name,
        'Estate charge'
      ) AS charge,

      COALESCE(
        i.period_label,
        '—'
      ) AS period,

      GREATEST(
        0::numeric,
        i.amount::numeric -
        COALESCE(
          i.amount_paid,
          0
        )::numeric
      ) AS outstanding

    FROM public.invoices i

    LEFT JOIN public.houses h
      ON h.id = i.house_id

    LEFT JOIN public.residents r
      ON r.id = i.resident_id

    LEFT JOIN public.due_types dt
      ON dt.id = i.due_type_id
  ),

  filtered AS (
    SELECT *

    FROM invoice_base

    WHERE
      (
        p_scope = 'all'
        OR scope_key = p_scope
      )

      AND (
        p_target IS NULL
        OR target = p_target
      )

      AND (
        p_charge IS NULL
        OR charge = p_charge
      )

      AND (
        p_period IS NULL
        OR period = p_period
      )

      AND (
        p_due_date IS NULL

        OR (
          p_due_date = '__none__'
          AND due_date IS NULL
        )

        OR (
          p_due_date <> '__none__'
          AND due_date =
            p_due_date::date
        )
      )

      AND (
        p_status = 'all'
        OR status = p_status
      )

      AND (
        p_outstanding = 'all'

        OR (
          p_outstanding = 'positive'
          AND outstanding > 0
        )

        OR (
          p_outstanding = 'zero'
          AND outstanding = 0
        )

        OR (
          p_outstanding = 'under5000'
          AND outstanding > 0
          AND outstanding < 5000
        )

        OR (
          p_outstanding = '5000plus'
          AND outstanding >= 5000
        )
      )

      AND (
        v_query = ''

        OR lower(
          target
        ) LIKE
          '%' || v_query || '%'

        OR lower(
          scope_label
        ) LIKE
          '%' || v_query || '%'

        OR lower(
          charge
        ) LIKE
          '%' || v_query || '%'

        OR lower(
          period
        ) LIKE
          '%' || v_query || '%'
      )
  ),

  page_rows AS (
    SELECT *

    FROM filtered

    ORDER BY
      created_at DESC,
      id

    LIMIT p_limit

    OFFSET p_offset
  ),

  totals AS (
    SELECT
      count(*)::integer AS total,

      COALESCE(
        SUM(
          amount
        ),
        0
      )::numeric AS total_billed,

      COALESCE(
        SUM(
          outstanding
        ),
        0
      )::numeric AS total_outstanding

    FROM filtered
  ),

  targets AS (
    SELECT DISTINCT
      target

    FROM invoice_base

    ORDER BY
      target
  ),

  charges AS (
    SELECT DISTINCT
      charge

    FROM invoice_base

    ORDER BY
      charge
  ),

  periods AS (
    SELECT DISTINCT
      period

    FROM invoice_base

    ORDER BY
      period
  ),

  due_dates AS (
    SELECT DISTINCT
      due_date

    FROM invoice_base

    ORDER BY
      due_date
  )

  SELECT
    jsonb_build_object(
      'total',
        totals.total,

      'total_billed',
        totals.total_billed,

      'total_outstanding',
        totals.total_outstanding,

      'rows',
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id',
                  page_rows.id,

                'target',
                  page_rows.target,

                'scope',
                  page_rows.scope_key,

                'scope_label',
                  page_rows.scope_label,

                'charge',
                  page_rows.charge,

                'period',
                  page_rows.period,

                'due_date',
                  page_rows.due_date,

                'status',
                  page_rows.status,

                'amount',
                  page_rows.amount,

                'amount_paid',
                  page_rows.amount_paid,

                'outstanding',
                  page_rows.outstanding
              )

              ORDER BY
                page_rows.created_at DESC,
                page_rows.id
            )

            FROM page_rows
          ),
          '[]'::jsonb
        ),

      'filters',
        jsonb_build_object(
          'targets',
            COALESCE(
              (
                SELECT jsonb_agg(
                  target
                  ORDER BY target
                )
                FROM targets
              ),
              '[]'::jsonb
            ),

          'charges',
            COALESCE(
              (
                SELECT jsonb_agg(
                  charge
                  ORDER BY charge
                )
                FROM charges
              ),
              '[]'::jsonb
            ),

          'periods',
            COALESCE(
              (
                SELECT jsonb_agg(
                  period
                  ORDER BY period
                )
                FROM periods
              ),
              '[]'::jsonb
            ),

          'due_dates',
            COALESCE(
              (
                SELECT jsonb_agg(
                  CASE
                    WHEN due_date IS NULL
                      THEN '__none__'

                    ELSE due_date::text
                  END

                  ORDER BY
                    due_date NULLS LAST
                )

                FROM due_dates
              ),
              '[]'::jsonb
            )
        )
    )

  INTO v_result

  FROM totals;

  RETURN v_result;
END;
$$;

REVOKE ALL
ON FUNCTION public.admin_invoices_page(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.admin_invoices_page(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer
)
TO authenticated, service_role;


CREATE INDEX IF NOT EXISTS
  idx_invoices_created_at_id
ON public.invoices (
  created_at DESC,
  id
);

CREATE INDEX IF NOT EXISTS
  idx_invoices_status
ON public.invoices (
  status
);

CREATE INDEX IF NOT EXISTS
  idx_invoices_period_label
ON public.invoices (
  period_label
);

COMMIT;