-- VERDANT
-- Human-readable support IDs for residents and payments.
--
-- Internal UUID primary keys remain unchanged and continue to be used for
-- relationships, authorization and security.
--
-- Examples:
--   Resident: RES-000001
--   Payment:  PAY-202609-000001
--
-- Safe to rerun.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.resident_public_id_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.payment_public_id_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS resident_code text;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_code text;

-- Drop the guards before a possible backfill so this migration remains
-- rerunnable even if a previous attempt stopped part-way through.
DROP TRIGGER IF EXISTS residents_human_id_guard
ON public.residents;

DROP TRIGGER IF EXISTS payments_human_id_guard
ON public.payments;

-- Align the resident sequence with any IDs that may already exist.
DO $$
DECLARE
  v_max bigint;
  r record;
BEGIN
  SELECT coalesce(
    max(
      substring(
        resident_code
        FROM '^RES-([0-9]+)$'
      )::bigint
    ),
    0
  )
  INTO v_max
  FROM public.residents
  WHERE resident_code ~ '^RES-[0-9]+$';

  PERFORM setval(
    'public.resident_public_id_seq'::regclass,
    greatest(v_max + 1, 1),
    false
  );

  FOR r IN
    SELECT id
    FROM public.residents
    WHERE resident_code IS NULL
    ORDER BY created_at NULLS LAST, id
  LOOP
    UPDATE public.residents
    SET resident_code =
      'RES-' ||
      lpad(
        nextval(
          'public.resident_public_id_seq'::regclass
        )::text,
        6,
        '0'
      )
    WHERE id = r.id;
  END LOOP;
END
$$;

-- Align the payment sequence with any IDs that may already exist, then
-- backfill existing payment rows using the month in which the payment record
-- was created.
DO $$
DECLARE
  v_max bigint;
  r record;
  v_stamp text;
BEGIN
  SELECT coalesce(
    max(
      substring(
        payment_code
        FROM '^PAY-[0-9]{6}-([0-9]+)$'
      )::bigint
    ),
    0
  )
  INTO v_max
  FROM public.payments
  WHERE payment_code ~ '^PAY-[0-9]{6}-[0-9]+$';

  PERFORM setval(
    'public.payment_public_id_seq'::regclass,
    greatest(v_max + 1, 1),
    false
  );

  FOR r IN
    SELECT
      id,
      created_at,
      paid_at
    FROM public.payments
    WHERE payment_code IS NULL
    ORDER BY created_at NULLS LAST, id
  LOOP
    v_stamp :=
      to_char(
        coalesce(
          r.created_at,
          r.paid_at,
          now()
        )
        AT TIME ZONE 'Africa/Lagos',
        'YYYYMM'
      );

    UPDATE public.payments
    SET payment_code =
      'PAY-' ||
      v_stamp ||
      '-' ||
      lpad(
        nextval(
          'public.payment_public_id_seq'::regclass
        )::text,
        6,
        '0'
      )
    WHERE id = r.id;
  END LOOP;
END
$$;

ALTER TABLE public.residents
  ALTER COLUMN resident_code SET NOT NULL;

ALTER TABLE public.payments
  ALTER COLUMN payment_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS residents_resident_code_unique
ON public.residents (resident_code);

CREATE UNIQUE INDEX IF NOT EXISTS payments_payment_code_unique
ON public.payments (payment_code);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'residents_resident_code_format'
      AND conrelid = 'public.residents'::regclass
  ) THEN
    ALTER TABLE public.residents
      ADD CONSTRAINT residents_resident_code_format
      CHECK (
        resident_code ~ '^RES-[0-9]{6,}$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_payment_code_format'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_payment_code_format
      CHECK (
        payment_code ~ '^PAY-[0-9]{6}-[0-9]{6,}$'
      );
  END IF;
END
$$;

-- Generate IDs inside PostgreSQL so concurrent inserts cannot produce the same
-- number. The human-readable IDs are references only; UUIDs remain the
-- security and relational identifiers.
CREATE OR REPLACE FUNCTION public.manage_human_readable_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stamp text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'residents' THEN
      NEW.resident_code :=
        'RES-' ||
        lpad(
          nextval(
            'public.resident_public_id_seq'::regclass
          )::text,
          6,
          '0'
        );

      RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'payments' THEN
      v_stamp :=
        to_char(
          coalesce(
            NEW.created_at,
            now()
          )
          AT TIME ZONE 'Africa/Lagos',
          'YYYYMM'
        );

      NEW.payment_code :=
        'PAY-' ||
        v_stamp ||
        '-' ||
        lpad(
          nextval(
            'public.payment_public_id_seq'::regclass
          )::text,
          6,
          '0'
        );

      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'residents'
       AND NEW.resident_code
           IS DISTINCT FROM
           OLD.resident_code
    THEN
      RAISE EXCEPTION
        'Resident ID cannot be changed';
    END IF;

    IF TG_TABLE_NAME = 'payments'
       AND NEW.payment_code
           IS DISTINCT FROM
           OLD.payment_code
    THEN
      RAISE EXCEPTION
        'Payment ID cannot be changed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.manage_human_readable_id()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER residents_human_id_guard
BEFORE INSERT OR UPDATE OF resident_code
ON public.residents
FOR EACH ROW
EXECUTE FUNCTION public.manage_human_readable_id();

CREATE TRIGGER payments_human_id_guard
BEFORE INSERT OR UPDATE OF payment_code
ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.manage_human_readable_id();

NOTIFY pgrst, 'reload schema';

COMMIT;
