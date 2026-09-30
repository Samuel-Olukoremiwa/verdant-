BEGIN;

-- ============================================================
-- PAYMENT TRANSACTION RESIDENT ACCESS
--
-- Phase 6B
--
-- payment_transactions now becomes the canonical identity for
-- one real-world payment.
--
-- Existing payments.payment_code values remain unchanged for
-- backward compatibility. One existing allocation code is
-- promoted to become the canonical transaction payment code.
-- ============================================================


-- ============================================================
-- PAYMENT CODE
-- ============================================================

ALTER TABLE
  public.payment_transactions

ADD COLUMN IF NOT EXISTS
  payment_code text;


-- If this migration is being rerun after a partially completed
-- attempt, temporarily remove the immutability trigger while
-- backfilling.
DROP TRIGGER IF EXISTS
  payment_transactions_human_id_guard

ON public.payment_transactions;


-- ============================================================
-- BACKFILL CANONICAL PAYMENT CODE
--
-- Existing payment allocations already have PAY-YYYYMM-NNNNNN
-- codes.
--
-- One allocation code is selected per transaction and promoted
-- to become the real payment's canonical support/reference ID.
-- ============================================================

WITH canonical_codes AS (
  SELECT DISTINCT ON (
    p.transaction_id
  )
    p.transaction_id,
    p.payment_code

  FROM public.payments p

  WHERE
    p.transaction_id IS NOT NULL

    AND p.payment_code IS NOT NULL

  ORDER BY
    p.transaction_id,

    substring(
      p.payment_code
      FROM
        '^PAY-[0-9]{6}-([0-9]+)$'
    )::bigint,

    p.id
)

UPDATE public.payment_transactions t

SET payment_code =
  c.payment_code

FROM canonical_codes c

WHERE
  c.transaction_id =
    t.id

  AND t.payment_code
    IS NULL;


-- Every historical transaction must have come from at least
-- one allocation. Do not silently invent IDs for inconsistent
-- historical data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1

    FROM public.payment_transactions

    WHERE payment_code IS NULL
  ) THEN
    RAISE EXCEPTION
      'A payment transaction could not be assigned its canonical payment code.';
  END IF;
END
$$;


ALTER TABLE
  public.payment_transactions

ALTER COLUMN payment_code
SET NOT NULL;


-- ============================================================
-- PAYMENT CODE CONSTRAINTS
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1

    FROM pg_constraint

    WHERE
      conrelid =
        'public.payment_transactions'::regclass

      AND conname =
        'payment_transactions_payment_code_unique'
  ) THEN
    ALTER TABLE
      public.payment_transactions

    ADD CONSTRAINT
      payment_transactions_payment_code_unique

    UNIQUE (
      payment_code
    );
  END IF;


  IF NOT EXISTS (
    SELECT 1

    FROM pg_constraint

    WHERE
      conrelid =
        'public.payment_transactions'::regclass

      AND conname =
        'payment_transactions_payment_code_format'
  ) THEN
    ALTER TABLE
      public.payment_transactions

    ADD CONSTRAINT
      payment_transactions_payment_code_format

    CHECK (
      payment_code ~
        '^PAY-[0-9]{6}-[0-9]{6,}$'
    );
  END IF;
END
$$;


-- ============================================================
-- FUTURE TRANSACTION PAYMENT IDS
--
-- Continue using the existing payment_public_id_seq.
--
-- The transaction receives its PAY-... ID before its allocation
-- rows receive their legacy allocation IDs.
-- ============================================================

CREATE OR REPLACE FUNCTION
  public.manage_payment_transaction_code()

RETURNS trigger

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path =
  public,
  pg_temp

AS $$
DECLARE
  v_stamp text;
BEGIN
  IF TG_OP =
    'INSERT'
  THEN
    v_stamp :=
      to_char(
        coalesce(
          NEW.created_at,
          now()
        )
        AT TIME ZONE
          'Africa/Lagos',
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


  IF TG_OP =
    'UPDATE'

    AND NEW.payment_code
      IS DISTINCT FROM
      OLD.payment_code
  THEN
    RAISE EXCEPTION
      'Payment transaction ID cannot be changed';
  END IF;


  RETURN NEW;
END;
$$;


REVOKE ALL

ON FUNCTION
  public.manage_payment_transaction_code()

FROM
  PUBLIC,
  anon,
  authenticated;


CREATE TRIGGER
  payment_transactions_human_id_guard

BEFORE
  INSERT
  OR UPDATE OF payment_code

ON public.payment_transactions

FOR EACH ROW

EXECUTE FUNCTION
  public.manage_payment_transaction_code();


-- ============================================================
-- RESIDENT READ ACCESS
--
-- payment_transactions remains read-only from the application.
--
-- Residents:
--   can see only transactions belonging to their resident row.
--
-- Administrators:
--   can see all transactions.
--
-- Writes:
--   remain server/database controlled.
-- ============================================================

ALTER TABLE
  public.payment_transactions

ENABLE ROW LEVEL SECURITY;


REVOKE ALL

ON TABLE
  public.payment_transactions

FROM
  PUBLIC,
  anon,
  authenticated;


GRANT SELECT

ON TABLE
  public.payment_transactions

TO authenticated;


GRANT ALL

ON TABLE
  public.payment_transactions

TO service_role;


DROP POLICY IF EXISTS
  "payment transactions select"

ON public.payment_transactions;


CREATE POLICY
  "payment transactions select"

ON public.payment_transactions

FOR SELECT

TO authenticated

USING (
  (
    SELECT
      public.is_estate_admin()
  )

  OR

  resident_id IN (
    SELECT
      r.id

    FROM public.residents r

    WHERE
      r.auth_user_id =
        (
          SELECT
            auth.uid()
        )
  )
);


NOTIFY pgrst, 'reload schema';

COMMIT;