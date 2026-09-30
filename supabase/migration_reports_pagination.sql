BEGIN;

CREATE OR REPLACE FUNCTION public.admin_report_page(
  p_type text,
  p_from date,
  p_to date,
  p_today date,
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
    RAISE EXCEPTION
      'Only estate administrators can view reports'
      USING ERRCODE = '42501';
  END IF;

  IF p_type NOT IN (
    'due',
    'collected',
    'overdue',
    'future',
    'expenses',
    'income-statement'
  ) THEN
    RAISE EXCEPTION
      'Invalid report type';
  END IF;

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

  IF p_offset < 0 THEN
    RAISE EXCEPTION
      'Report offset cannot be negative';
  END IF;

  -- ==========================================================
  -- INCOME STATEMENT
  -- ==========================================================

  IF p_type = 'income-statement' THEN
    WITH payment_base AS (
      SELECT
        COALESCE(
          i.due_type_id::text,
          COALESCE(
            dt.name,
            'Unallocated income'
          )
        ) AS group_key,

        COALESCE(
          dt.name,
          'Unallocated income'
        ) AS charge_name,

        COALESCE(
          h.street_id::text,
          rh.street_id::text,
          hs.name,
          rhs.name,
          'Unassigned street'
        ) AS street_key,

        COALESCE(
          hs.name,
          rhs.name,
          'Unassigned street'
        ) AS street_name,

        ROUND(
          p.amount::numeric *
          100
        )::bigint AS kobo

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

      WHERE
        p.status = 'success'

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

    income_groups AS (
      SELECT
        group_key,
        charge_name,
        SUM(kobo)::bigint
          AS total_kobo

      FROM payment_base

      GROUP BY
        group_key,
        charge_name
    ),

    street_groups AS (
      SELECT
        group_key,
        charge_name,
        street_key,
        street_name,
        SUM(kobo)::bigint
          AS total_kobo

      FROM payment_base

      GROUP BY
        group_key,
        charge_name,
        street_key,
        street_name
    ),

    expense_base AS (
      SELECT
        e.id,

        e.description,

        e.category,

        e.expense_date,

        ROUND(
          e.amount::numeric *
          100
        )::bigint AS kobo

      FROM public.expenses e

      WHERE
        e.expense_date >=
          p_from

        AND e.expense_date <=
          p_to
    ),

    statement_totals AS (
      SELECT
        COALESCE(
          (
            SELECT SUM(
              kobo
            )
            FROM payment_base
          ),
          0
        )::bigint
          AS income_kobo,

        COALESCE(
          (
            SELECT SUM(
              kobo
            )
            FROM expense_base
          ),
          0
        )::bigint
          AS expense_kobo
    ),

    ordered_rows AS (
      SELECT
        0 AS sort_major,
        ''::text AS sort_a,
        ''::text AS sort_b,
        ''::text AS sort_c,

        jsonb_build_object(
          'kind',
            'section',

          'label',
            'INCOME',

          'detail',
            NULL,

          'total',
            NULL
        ) AS row_data

      UNION ALL

      SELECT
        1,
        lower(
          income_groups.charge_name
        ),
        income_groups.group_key,
        '0',

        jsonb_build_object(
          'kind',
            'income',

          'label',
            income_groups.charge_name,

          'detail',
            NULL,

          'total',
            income_groups.total_kobo /
            100.0
        )

      FROM income_groups

      UNION ALL

      SELECT
        1,
        lower(
          street_groups.charge_name
        ),
        street_groups.group_key,
        '1:' ||
          lower(
            street_groups.street_name
          ) ||
          ':' ||
          street_groups.street_key,

        jsonb_build_object(
          'kind',
            'street',

          'label',
            street_groups.street_name,

          'detail',
            street_groups.total_kobo /
            100.0,

          'total',
            NULL
        )

      FROM street_groups

      UNION ALL

      SELECT
        2,
        '',
        '',
        '',

        jsonb_build_object(
          'kind',
            'subtotal',

          'label',
            'TOTAL INCOME',

          'detail',
            NULL,

          'total',
            statement_totals.income_kobo /
            100.0
        )

      FROM statement_totals

      UNION ALL

      SELECT
        3,
        '',
        '',
        '',

        jsonb_build_object(
          'kind',
            'section',

          'label',
            'EXPENSES',

          'detail',
            NULL,

          'total',
            NULL
        )

      UNION ALL

      SELECT
        4,
        expense_base.expense_date::text,
        expense_base.id::text,
        '',

        jsonb_build_object(
          'kind',
            'expense',

          'label',
            COALESCE(
              NULLIF(
                expense_base.description,
                ''
              ),
              expense_base.category
            ),

          'category',
            expense_base.category,

          'date',
            expense_base.expense_date,

          'detail',
            expense_base.kobo /
            100.0,

          'total',
            NULL
        )

      FROM expense_base

      UNION ALL

      SELECT
        5,
        '',
        '',
        '',

        jsonb_build_object(
          'kind',
            'subtotal',

          'label',
            'TOTAL EXPENSES',

          'detail',
            NULL,

          'total',
            statement_totals.expense_kobo /
            100.0
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
              WHEN
                statement_totals.income_kobo <
                statement_totals.expense_kobo
              THEN 'deficit'
              ELSE 'surplus'
            END,

          'label',
            CASE
              WHEN
                statement_totals.income_kobo <
                statement_totals.expense_kobo
              THEN 'DEFICIT'
              ELSE 'SURPLUS'
            END,

          'detail',
            NULL,

          'total',
            ABS(
              statement_totals.income_kobo -
              statement_totals.expense_kobo
            ) /
            100.0
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

    SELECT
      jsonb_build_object(
        'total',
          (
            SELECT count(*)
            FROM ordered_rows
          ),

        'total_amount',
          (
            SELECT
              ABS(
                income_kobo -
                expense_kobo
              ) /
              100.0

            FROM statement_totals
          ),

        'rows',
          COALESCE(
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
  END IF;


  -- ==========================================================
  -- EXPENSE REPORT
  -- ==========================================================

  IF p_type = 'expenses' THEN
    WITH base AS (
      SELECT
        e.id,

        e.expense_date,

        e.amount::numeric
          AS amount,

        jsonb_build_object(
          'house',
            e.category,

          'charge',
            e.description,

          'period',
            '—',

          'amount',
            e.amount,

          'date',
            e.expense_date,

          'reference',
            '—'
        ) AS row_data

      FROM public.expenses e

      WHERE
        e.expense_date >=
          p_from

        AND e.expense_date <=
          p_to
    ),

    page_rows AS (
      SELECT *

      FROM base

      ORDER BY
        expense_date DESC,
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
                  expense_date DESC,
                  id
              )

              FROM page_rows
            ),
            '[]'::jsonb
          )
      )

    INTO v_result;

    RETURN v_result;
  END IF;


  -- ==========================================================
  -- COLLECTION REPORT
  -- ==========================================================

  IF p_type = 'collected' THEN
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
              p.payment_code,
              p.paystack_reference,
              '—'
            )
        ) AS row_data

      FROM public.payments p

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

    INTO v_result;

    RETURN v_result;
  END IF;


  -- ==========================================================
  -- FUTURE BILLS
  -- ==========================================================

  IF p_type = 'future' THEN
    WITH real_rows AS (
      SELECT
        '0:' ||
          i.id::text
          AS row_key,

        i.due_date,

        COALESCE(
          h.address,
          r.full_name,
          '—'
        ) AS target,

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
        ) AS outstanding,

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
            i.amount,

          'outstanding',
            GREATEST(
              0::numeric,
              i.amount::numeric -
              COALESCE(
                i.amount_paid,
                0
              )::numeric
            ),

          'status',
            i.status,

          'dueDate',
            i.due_date
        ) AS row_data

      FROM public.invoices i

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
        i.due_date >=
          p_from

        AND i.due_date <=
          p_to

        AND i.due_date >
          p_today
    ),

    months AS (
      SELECT
        value::date
          AS month_start

      FROM generate_series(
        date_trunc(
          'month',
          p_from::timestamp
        ),

        date_trunc(
          'month',
          p_to::timestamp
        ),

        interval '1 month'
      ) value
    ),

    fixed_due_types AS (
      SELECT
        dt.id,

        dt.name,

        dt.amount::numeric
          AS amount

      FROM public.due_types dt

      WHERE
        dt.billing_scope =
          'house'

        AND dt.name IN (
          'Service Charge',
          'CDA Levy'
        )
    ),

    projected_rows AS (
      SELECT
        '1:' ||
          h.id::text ||
          ':' ||
          dt.id::text ||
          ':' ||
          months.month_start::text
          AS row_key,

        (
          months.month_start +
          interval '1 month - 1 day'
        )::date
          AS due_date,

        h.address
          AS target,

        dt.name
          AS charge,

        to_char(
          months.month_start,
          'FMMonth YYYY'
        ) AS period,

        dt.amount
          AS outstanding,

        jsonb_build_object(
          'house',
            h.address,

          'charge',
            dt.name,

          'period',
            to_char(
              months.month_start,
              'FMMonth YYYY'
            ),

          'amount',
            dt.amount,

          'outstanding',
            dt.amount,

          'status',
            'projected',

          'dueDate',
            (
              months.month_start +
              interval '1 month - 1 day'
            )::date
        ) AS row_data

      FROM public.houses h

      CROSS JOIN
        fixed_due_types dt

      CROSS JOIN
        months

      WHERE
        (
          months.month_start +
          interval '1 month - 1 day'
        )::date >
          p_today

        AND (
          months.month_start +
          interval '1 month - 1 day'
        )::date >=
          p_from

        AND (
          months.month_start +
          interval '1 month - 1 day'
        )::date <=
          p_to

        AND NOT EXISTS (
          SELECT 1

          FROM public.invoices existing

          WHERE
            existing.house_id =
              h.id

            AND existing.due_type_id =
              dt.id

            AND existing.period_label =
              to_char(
                months.month_start,
                'FMMonth YYYY'
              )
        )
    ),

    combined AS (
      SELECT *
      FROM real_rows

      UNION ALL

      SELECT *
      FROM projected_rows
    ),

    page_rows AS (
      SELECT *

      FROM combined

      ORDER BY
        due_date,
        target,
        charge,
        period,
        row_key

      LIMIT p_limit

      OFFSET p_offset
    )

    SELECT
      jsonb_build_object(
        'total',
          (
            SELECT count(*)
            FROM combined
          ),

        'total_amount',
          COALESCE(
            (
              SELECT SUM(
                outstanding
              )
              FROM combined
            ),
            0
          ),

        'rows',
          COALESCE(
            (
              SELECT jsonb_agg(
                row_data

                ORDER BY
                  due_date,
                  target,
                  charge,
                  period,
                  row_key
              )

              FROM page_rows
            ),
            '[]'::jsonb
          )
      )

    INTO v_result;

    RETURN v_result;
  END IF;


  -- ==========================================================
  -- DUE / OVERDUE
  -- ==========================================================

  WITH base AS (
    SELECT
      i.id,

      i.due_date,

      GREATEST(
        0::numeric,
        i.amount::numeric -
        COALESCE(
          i.amount_paid,
          0
        )::numeric
      ) AS outstanding,

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
          i.amount,

        'outstanding',
          GREATEST(
            0::numeric,
            i.amount::numeric -
            COALESCE(
              i.amount_paid,
              0
            )::numeric
          ),

        'status',
          i.status,

        'dueDate',
          i.due_date
      ) AS row_data

    FROM public.invoices i

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
      i.due_date >=
        p_from

      AND i.due_date <=
        p_to

      AND (
        p_type =
          'due'

        OR (
          p_type =
            'overdue'

          AND i.due_date <
            p_today

          AND i.status IN (
            'unpaid',
            'partial',
            'overdue'
          )
        )
      )
  ),

  page_rows AS (
    SELECT *

    FROM base

    ORDER BY
      due_date DESC,
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
              outstanding
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
                due_date DESC,
                id
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
ON FUNCTION public.admin_report_page(
  text,
  date,
  date,
  date,
  integer,
  integer
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.admin_report_page(
  text,
  date,
  date,
  date,
  integer,
  integer
)
TO authenticated, service_role;

COMMIT;