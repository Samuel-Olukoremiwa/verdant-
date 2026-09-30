BEGIN;

-- ============================================================
-- DUE TYPE CAPABILITIES
--
-- Phase 7A
--
-- Business behaviour must not depend on charge names.
--
-- Existing behaviour is preserved:
--
--   Service Charge
--   CDA Levy
--
-- remain the only charges that are initially:
--
--   • automatically generated each month
--   • available for advance payment
--
-- Other existing monthly charges do NOT automatically inherit
-- either behaviour.
-- ============================================================


ALTER TABLE public.due_types
ADD COLUMN IF NOT EXISTS active boolean
NOT NULL
DEFAULT true;


ALTER TABLE public.due_types
ADD COLUMN IF NOT EXISTS auto_generate boolean
NOT NULL
DEFAULT false;


ALTER TABLE public.due_types
ADD COLUMN IF NOT EXISTS allow_advance_payment boolean
NOT NULL
DEFAULT false;


-- ============================================================
-- BACKFILL EXISTING BEHAVIOUR
-- ============================================================

UPDATE public.due_types

SET
  auto_generate =
    true,

  allow_advance_payment =
    true

WHERE
  billing_scope =
    'house'

  AND name IN (
    'Service Charge',
    'CDA Levy'
  );


-- ============================================================
-- CAPABILITY INTEGRITY
--
-- The current automatic-generation and advance-payment engines
-- operate monthly and at household level.
--
-- Future support for quarterly/yearly/resident automation can
-- be added deliberately rather than silently misusing these
-- flags.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1

    FROM pg_constraint

    WHERE
      conrelid =
        'public.due_types'::regclass

      AND conname =
        'due_types_auto_generate_capability_check'
  ) THEN

    ALTER TABLE public.due_types

    ADD CONSTRAINT
      due_types_auto_generate_capability_check

    CHECK (
      NOT auto_generate

      OR (
        billing_scope =
          'house'

        AND frequency =
          'monthly'
      )
    );
  END IF;


  IF NOT EXISTS (
    SELECT 1

    FROM pg_constraint

    WHERE
      conrelid =
        'public.due_types'::regclass

      AND conname =
        'due_types_advance_payment_capability_check'
  ) THEN

    ALTER TABLE public.due_types

    ADD CONSTRAINT
      due_types_advance_payment_capability_check

    CHECK (
      NOT allow_advance_payment

      OR (
        billing_scope =
          'house'

        AND frequency =
          'monthly'
      )
    );
  END IF;
END
$$;


-- ============================================================
-- AUTOMATIC MONTHLY HOUSEHOLD BILLING
--
-- No charge names are used here anymore.
-- ============================================================

CREATE OR REPLACE FUNCTION
  public.generate_estate_fixed_charges()

RETURNS jsonb

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path =
  public,
  pg_temp

AS $$
DECLARE
  h public.houses%rowtype;

  d public.due_types%rowtype;

  period text;

  due date;

  n integer;

  created integer :=
    0;

  skipped integer :=
    0;

  m date :=
    date_trunc(
      'month',
      now()
        AT TIME ZONE
          'Africa/Lagos'
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


  FOR h IN
    SELECT *

    FROM public.houses

    ORDER BY id

    FOR UPDATE
  LOOP

    FOR d IN
      SELECT *

      FROM public.due_types

      WHERE
        active =
          true

        AND auto_generate =
          true

        AND billing_scope =
          'house'

        AND frequency =
          'monthly'

      ORDER BY id
    LOOP

      IF d.amount <= 0
      THEN
        RAISE EXCEPTION
          'Automatically generated charge amount must be positive';
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

      ON CONFLICT
      DO NOTHING;


      GET DIAGNOSTICS
        n =
          ROW_COUNT;


      created :=
        created
        +
        n;


      skipped :=
        skipped
        +
        (
          1 -
          n
        );

    END LOOP;

  END LOOP;


  RETURN
    jsonb_build_object(
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

ON FUNCTION
  public.generate_estate_fixed_charges()

FROM
  PUBLIC,
  anon,
  authenticated;


GRANT EXECUTE

ON FUNCTION
  public.generate_estate_fixed_charges()

TO service_role;


-- ============================================================
-- PAYMENT PREPARATION
--
-- Existing invoices remain payable regardless of whether their
-- due type is currently active.
--
-- Capability checks apply only when creating future/advance
-- household payment items.
-- ============================================================

CREATE OR REPLACE FUNCTION
  public.prepare_estate_payment(
    p_auth_user uuid,
    p_items jsonb,
    p_reference text,
    p_expected_kobo bigint,
    p_quote_only boolean DEFAULT false
  )

RETURNS jsonb

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path =
  public,
  pg_temp

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

  total_kobo bigint :=
    0;

  line_kobo bigint;

  lines jsonb :=
    '[]'::jsonb;

  seen text[] :=
    '{}';

  key text;

  house_payer boolean :=
    false;

  current_month date :=
    date_trunc(
      'month',
      now()
        AT TIME ZONE
          'Africa/Lagos'
    )::date;
BEGIN

  SELECT *

  INTO STRICT
    r

  FROM public.residents

  WHERE
    auth_user_id =
      p_auth_user

    AND is_active;


  IF r.house_id IS NOT NULL
  THEN

    SELECT *

    INTO STRICT
      h

    FROM public.houses

    WHERE
      id =
        r.house_id

    FOR UPDATE;


    house_payer :=
      CASE

        WHEN
          h.billing_responsible_resident_id
            IS NOT NULL

        THEN
          h.billing_responsible_resident_id =
            r.id

        ELSE
          r.relationship =
            'owner'

      END;

  END IF;


  IF
    jsonb_typeof(
      p_items
    )
      IS DISTINCT FROM
        'array'

    OR jsonb_array_length(
      p_items
    )
      NOT BETWEEN
        1
        AND 120
  THEN

    RAISE EXCEPTION
      'Choose between 1 and 120 payment items';

  END IF;


  IF
    NOT p_quote_only

    AND (
      p_reference IS NULL

      OR length(
        p_reference
      ) < 10
    )
  THEN

    RAISE EXCEPTION
      'Missing payment reference';

  END IF;


  FOR item IN

    SELECT
      value

    FROM jsonb_array_elements(
      p_items
    )

  LOOP

    inv :=
      NULL;


    -- --------------------------------------------------------
    -- EXISTING INVOICE
    -- --------------------------------------------------------

    IF item ? 'invoice_id'
    THEN

      SELECT *

      INTO STRICT
        inv

      FROM public.invoices

      WHERE
        id =
          (
            item
              ->>
              'invoice_id'
          )::uuid

      FOR UPDATE;


      IF
        inv.resident_id
          IS NOT NULL
      THEN

        IF
          inv.resident_id
            IS DISTINCT FROM
              r.id
        THEN

          RAISE EXCEPTION
            'This personal invoice belongs to another resident.';

        END IF;


      ELSIF
        inv.house_id
          IS NOT NULL
      THEN

        IF
          r.house_id
            IS DISTINCT FROM
              inv.house_id
        THEN

          RAISE EXCEPTION
            'This household invoice belongs to another house.';

        END IF;


        IF NOT house_payer
        THEN

          RAISE EXCEPTION
            'You are not the billing contact for this household.';

        END IF;


      ELSE

        RAISE EXCEPTION
          'Invoice has no valid billing target.';

      END IF;


      amount_due :=
        (
          item
            ->>
            'amount'
        )::numeric;


      IF
        amount_due IS NULL

        OR amount_due::text IN (
          'NaN',
          'Infinity',
          '-Infinity'
        )

        OR amount_due <=
          0

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

      INTO STRICT
        dt

      FROM public.due_types

      WHERE
        id =
          inv.due_type_id;


      period :=
        inv.period_label;


      due :=
        inv.due_date;


      key :=
        'invoice:'
        ||
        inv.id::text;


    -- --------------------------------------------------------
    -- ADVANCE HOUSEHOLD PAYMENT
    -- --------------------------------------------------------

    ELSE

      IF NOT house_payer
      THEN

        RAISE EXCEPTION
          'You are not responsible for this household''s bills';

      END IF;


      SELECT *

      INTO STRICT
        dt

      FROM public.due_types

      WHERE
        id =
          (
            item
              ->>
              'due_type_id'
          )::uuid

        AND active =
          true

        AND allow_advance_payment =
          true

        AND billing_scope =
          'house'

        AND frequency =
          'monthly';


      IF
        coalesce(
          item
            ->>
            'month',
          ''
        )
          !~
          '^\d{4}-(0[1-9]|1[0-2])$'
      THEN

        RAISE EXCEPTION
          'Invalid billing month';

      END IF;


      m :=
        (
          (
            item
              ->>
              'month'
          )
          ||
          '-01'
        )::date;


      IF
        m <
          current_month

        OR
        m >=
          current_month
          +
          interval '60 months'
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

      INTO
        inv

      FROM public.invoices

      WHERE
        house_id =
          h.id

        AND resident_id
          IS NULL

        AND due_type_id =
          dt.id

        AND public.normalize_label(
          period_label
        )
          =
          public.normalize_label(
            period
          )

      FOR UPDATE;


      amount_due :=
        CASE

          WHEN
            inv.id IS NULL

          THEN
            dt.amount

          ELSE
            greatest(
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
        ||
        dt.id::text
        ||
        ':'
        ||
        public.normalize_label(
          period
        );

    END IF;


    IF
      key =
        ANY(
          seen
        )
    THEN

      RAISE EXCEPTION
        'The same bill was selected more than once';

    END IF;


    seen :=
      array_append(
        seen,
        key
      );


    IF
      amount_due < 0

      OR dt.amount <= 0
    THEN

      RAISE EXCEPTION
        'Invalid charge amount';

    END IF;


    line_kobo :=
      round(
        amount_due
        *
        100
      )::bigint;


    total_kobo :=
      total_kobo
      +
      line_kobo;


    IF
      NOT p_quote_only

      AND line_kobo >
        0

      AND inv.id
        IS NULL
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

      INTO
        inv;

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


  IF NOT p_quote_only
  THEN

    IF
      total_kobo <=
        0
    THEN

      RAISE EXCEPTION
        'Nothing left to pay for';

    END IF;


    IF
      p_expected_kobo
        IS NULL

      OR total_kobo
        <>
        p_expected_kobo
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
      (
        x
          ->>
          'invoice_id'
      )::uuid,

      r.id,

      (
        x
          ->>
          'amount_kobo'
      )::numeric
        /
        100,

      p_reference,

      'pending'

    FROM jsonb_array_elements(
      lines
    ) x

    WHERE
      (
        x
          ->>
          'amount_kobo'
      )::bigint >
        0;

  END IF;


  RETURN
    jsonb_build_object(
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

ON FUNCTION
  public.prepare_estate_payment(
    uuid,
    jsonb,
    text,
    bigint,
    boolean
  )

FROM
  PUBLIC,
  anon,
  authenticated;


GRANT EXECUTE

ON FUNCTION
  public.prepare_estate_payment(
    uuid,
    jsonb,
    text,
    bigint,
    boolean
  )

TO service_role;


NOTIFY pgrst, 'reload schema';

COMMIT;