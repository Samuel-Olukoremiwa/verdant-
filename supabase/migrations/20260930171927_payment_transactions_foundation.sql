-- ============================================================
-- HISTORICAL MIGRATION BRIDGE
--
-- The canonical payment transaction foundation was deployed
-- before it was represented by a normal timestamped migration.
--
-- Production already contains this architecture.
-- ============================================================

BEGIN;

-- ============================================================
-- PAYMENT TRANSACTION FOUNDATION
--
-- Current architecture:
--
--   payments = one row per invoice allocation
--
-- A single Paystack reference may therefore appear on many
-- payment rows when one checkout pays several invoices.
--
-- This migration introduces:
--
--   payment_transactions = one row per real payment transaction
--   payments.transaction_id = allocation -> transaction link
--
-- Existing application behaviour remains compatible.
-- ============================================================


-- ============================================================
-- PRE-FLIGHT
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE paystack_reference IS NULL
       OR btrim(paystack_reference) = ''
  ) THEN
    RAISE EXCEPTION
      'Payments without a payment reference exist. Reconcile them before applying the transaction migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE resident_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Payments without a resident exist. Reconcile them before applying the transaction migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE invoice_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Payments without an invoice exist. Reconcile them before applying the transaction migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE amount <= 0
  ) THEN
    RAISE EXCEPTION
      'Payments with non-positive amounts exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE status NOT IN (
      'pending',
      'success',
      'failed'
    )
  ) THEN
    RAISE EXCEPTION
      'Unexpected payment status exists.';
  END IF;

  /*
   * One gateway reference must belong to exactly
   * one resident.
   */
  IF EXISTS (
    SELECT 1
    FROM public.payments
    GROUP BY paystack_reference
    HAVING count(
      DISTINCT resident_id
    ) > 1
  ) THEN
    RAISE EXCEPTION
      'A payment reference is linked to more than one resident.';
  END IF;

  /*
   * Historical allocations belonging to the same
   * transaction must agree on transaction state.
   */
  IF EXISTS (
    SELECT 1
    FROM public.payments
    GROUP BY paystack_reference
    HAVING count(
      DISTINCT status
    ) > 1
  ) THEN
    RAISE EXCEPTION
      'A payment reference currently contains mixed allocation statuses.';
  END IF;
END
$$;


-- ============================================================
-- CANONICAL TRANSACTION TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS
  public.payment_transactions (
    id uuid
      PRIMARY KEY
      DEFAULT gen_random_uuid(),

    reference text
      NOT NULL
      UNIQUE,

    resident_id uuid
      NOT NULL
      REFERENCES public.residents(id)
      ON DELETE RESTRICT,

    provider text
      NOT NULL,

    amount numeric(12,2)
      NOT NULL,

    currency text
      NOT NULL
      DEFAULT 'NGN',

    status text
      NOT NULL
      DEFAULT 'pending',

    paid_at timestamptz,

    created_at timestamptz
      NOT NULL
      DEFAULT now(),

    updated_at timestamptz
      NOT NULL
      DEFAULT now(),

    CONSTRAINT
      payment_transactions_reference_not_blank
    CHECK (
      btrim(reference) <> ''
    ),

    CONSTRAINT
      payment_transactions_provider_check
    CHECK (
      provider IN (
        'paystack',
        'manual'
      )
    ),

    CONSTRAINT
      payment_transactions_amount_positive
    CHECK (
      amount > 0
    ),

    CONSTRAINT
      payment_transactions_currency_check
    CHECK (
      currency = 'NGN'
    ),

    CONSTRAINT
      payment_transactions_status_check
    CHECK (
      status IN (
        'pending',
        'success',
        'failed'
      )
    )
  );


CREATE INDEX IF NOT EXISTS
  payment_transactions_resident_created
ON public.payment_transactions (
  resident_id,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  payment_transactions_status_created
ON public.payment_transactions (
  status,
  created_at DESC
);


-- ============================================================
-- ALLOCATION -> TRANSACTION LINK
-- ============================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS
    transaction_id uuid;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid =
      'public.payments'::regclass
      AND conname =
        'payments_transaction_id_fkey'
  ) THEN
    ALTER TABLE public.payments

    ADD CONSTRAINT
      payments_transaction_id_fkey

    FOREIGN KEY (
      transaction_id
    )

    REFERENCES
      public.payment_transactions(id)

    ON DELETE RESTRICT;
  END IF;
END
$$;


-- ============================================================
-- BACKFILL HISTORICAL TRANSACTIONS
--
-- Older multi-invoice payments occasionally have slightly
-- different paid_at timestamps on each allocation because the
-- rows were confirmed sequentially.
--
-- The earliest paid_at becomes the transaction timestamp.
--
-- PostgreSQL does not provide min(uuid), so resident_id is
-- converted to text for the aggregate and converted back to
-- uuid afterwards. The pre-flight check guarantees that each
-- reference belongs to exactly one resident.
-- ============================================================

INSERT INTO public.payment_transactions (
  reference,
  resident_id,
  provider,
  amount,
  currency,
  status,
  paid_at,
  created_at,
  updated_at
)

SELECT
  p.paystack_reference,

  min(
    p.resident_id::text
  )::uuid,

  CASE
    WHEN p.paystack_reference
      LIKE 'MANUAL-%'
    THEN 'manual'
    ELSE 'paystack'
  END,

  sum(
    p.amount
  ),

  'NGN',

  min(
    p.status
  ),

  CASE
    WHEN min(
      p.status
    ) = 'success'
    THEN min(
      p.paid_at
    )
    ELSE NULL
  END,

  min(
    coalesce(
      p.created_at,
      now()
    )
  ),

  now()

FROM public.payments p

GROUP BY
  p.paystack_reference

ON CONFLICT (
  reference
)

DO UPDATE

SET
  resident_id =
    EXCLUDED.resident_id,

  provider =
    EXCLUDED.provider,

  amount =
    EXCLUDED.amount,

  currency =
    EXCLUDED.currency,

  status =
    EXCLUDED.status,

  paid_at =
    EXCLUDED.paid_at,

  created_at =
    LEAST(
      public.payment_transactions.created_at,
      EXCLUDED.created_at
    ),

  updated_at =
    now();


UPDATE public.payments p

SET transaction_id =
  t.id

FROM public.payment_transactions t

WHERE t.reference =
  p.paystack_reference

  AND p.transaction_id
    IS DISTINCT FROM
    t.id;


DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE transaction_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'A payment allocation could not be linked to its transaction.';
  END IF;
END
$$;


ALTER TABLE public.payments
  ALTER COLUMN transaction_id
  SET NOT NULL;


-- ============================================================
-- TRANSACTION / INVOICE ALLOCATION UNIQUENESS
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint

    WHERE conrelid =
      'public.payments'::regclass

      AND conname =
        'payments_transaction_invoice_unique'
  ) THEN
    ALTER TABLE public.payments

    ADD CONSTRAINT
      payments_transaction_invoice_unique

    UNIQUE (
      transaction_id,
      invoice_id
    );
  END IF;
END
$$;


CREATE INDEX IF NOT EXISTS
  payments_transaction_id_idx
ON public.payments (
  transaction_id
);


-- ============================================================
-- BEFORE INSERT:
-- ATTACH A PAYMENT ALLOCATION TO ITS TRANSACTION
--
-- Existing application code can continue inserting into
-- payments exactly as before.
--
-- The trigger creates/reuses the canonical transaction and
-- sets payments.transaction_id automatically.
-- ============================================================

CREATE OR REPLACE FUNCTION
  public.attach_payment_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path =
  public,
  pg_temp
AS $$
DECLARE
  v_transaction
    public.payment_transactions%rowtype;

  v_provider text;
BEGIN
  IF NEW.paystack_reference IS NULL
     OR btrim(
       NEW.paystack_reference
     ) = ''
  THEN
    RAISE EXCEPTION
      'Payment reference is required';
  END IF;


  IF NEW.resident_id IS NULL THEN
    RAISE EXCEPTION
      'Payment resident is required';
  END IF;


  IF NEW.invoice_id IS NULL THEN
    RAISE EXCEPTION
      'Payment invoice is required';
  END IF;


  IF NEW.amount IS NULL
     OR NEW.amount <= 0
  THEN
    RAISE EXCEPTION
      'Payment amount must be positive';
  END IF;


  v_provider :=
    CASE
      WHEN NEW.paystack_reference
        LIKE 'MANUAL-%'
      THEN 'manual'
      ELSE 'paystack'
    END;


  INSERT INTO public.payment_transactions (
    reference,
    resident_id,
    provider,
    amount,
    currency,
    status,
    paid_at,
    created_at,
    updated_at
  )

  VALUES (
    NEW.paystack_reference,
    NEW.resident_id,
    v_provider,
    NEW.amount,
    'NGN',
    coalesce(
      NEW.status,
      'pending'
    ),
    CASE
      WHEN NEW.status =
        'success'
      THEN NEW.paid_at
      ELSE NULL
    END,
    coalesce(
      NEW.created_at,
      now()
    ),
    now()
  )

  ON CONFLICT (
    reference
  )

  DO NOTHING;


  SELECT *
  INTO v_transaction

  FROM public.payment_transactions

  WHERE reference =
    NEW.paystack_reference

  FOR UPDATE;


  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Could not create or locate payment transaction';
  END IF;


  IF v_transaction.resident_id
      IS DISTINCT FROM
      NEW.resident_id
  THEN
    RAISE EXCEPTION
      'Payment reference belongs to another resident';
  END IF;


  NEW.transaction_id :=
    v_transaction.id;


  RETURN NEW;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.attach_payment_transaction()
FROM
  PUBLIC,
  anon,
  authenticated;


-- ============================================================
-- PAYMENT IDENTITY PROTECTION
--
-- An allocation may change status / paid_at, but it must never
-- silently move to another transaction, invoice, resident or
-- payment reference.
-- ============================================================

CREATE OR REPLACE FUNCTION
  public.protect_payment_allocation_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path =
  public,
  pg_temp
AS $$
BEGIN
  IF NEW.paystack_reference
      IS DISTINCT FROM
      OLD.paystack_reference
  THEN
    RAISE EXCEPTION
      'Payment reference cannot be changed';
  END IF;


  IF NEW.transaction_id
      IS DISTINCT FROM
      OLD.transaction_id
  THEN
    RAISE EXCEPTION
      'Payment transaction cannot be changed';
  END IF;


  IF NEW.invoice_id
      IS DISTINCT FROM
      OLD.invoice_id
  THEN
    RAISE EXCEPTION
      'Payment invoice cannot be changed';
  END IF;


  IF NEW.resident_id
      IS DISTINCT FROM
      OLD.resident_id
  THEN
    RAISE EXCEPTION
      'Payment resident cannot be changed';
  END IF;


  RETURN NEW;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.protect_payment_allocation_identity()
FROM
  PUBLIC,
  anon,
  authenticated;


-- ============================================================
-- REFRESH TRANSACTION TOTAL / STATUS FROM ALLOCATIONS
-- ============================================================

CREATE OR REPLACE FUNCTION
  public.refresh_payment_transaction(
    p_reference text
  )
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path =
  public,
  pg_temp
AS $$
DECLARE
  v_transaction_id uuid;

  v_resident_id uuid;

  v_resident_count integer;

  v_amount numeric(12,2);

  v_all_success boolean;

  v_any_pending boolean;

  v_any_failed boolean;

  v_paid_at timestamptz;

  v_created_at timestamptz;
BEGIN
  IF p_reference IS NULL THEN
    RETURN;
  END IF;


  SELECT id
  INTO v_transaction_id

  FROM public.payment_transactions

  WHERE reference =
    p_reference

  FOR UPDATE;


  IF NOT FOUND THEN
    RETURN;
  END IF;


  SELECT
    min(
      resident_id::text
    )::uuid,

    count(
      DISTINCT resident_id
    ),

    sum(
      amount
    ),

    bool_and(
      status =
      'success'
    ),

    bool_or(
      status =
      'pending'
    ),

    bool_or(
      status =
      'failed'
    ),

    min(
      paid_at
    )
      FILTER (
        WHERE paid_at
          IS NOT NULL
      ),

    min(
      coalesce(
        created_at,
        now()
      )
    )

  INTO
    v_resident_id,
    v_resident_count,
    v_amount,
    v_all_success,
    v_any_pending,
    v_any_failed,
    v_paid_at,
    v_created_at

  FROM public.payments

  WHERE paystack_reference =
    p_reference;


  /*
   * Until the application is fully cut over,
   * transaction state is derived from allocations.
   *
   * If every allocation is deleted, remove the
   * corresponding derived transaction.
   */
  IF v_amount IS NULL THEN
    DELETE FROM public.payment_transactions

    WHERE id =
      v_transaction_id;

    RETURN;
  END IF;


  IF v_resident_count <> 1 THEN
    RAISE EXCEPTION
      'A payment transaction cannot belong to multiple residents';
  END IF;


  UPDATE public.payment_transactions

  SET
    resident_id =
      v_resident_id,

    amount =
      v_amount,

    status =
      CASE
        WHEN v_all_success
        THEN 'success'

        WHEN v_any_pending
        THEN 'pending'

        WHEN v_any_failed
        THEN 'failed'

        ELSE 'pending'
      END,

    paid_at =
      CASE
        WHEN v_all_success
        THEN v_paid_at
        ELSE NULL
      END,

    created_at =
      LEAST(
        created_at,
        v_created_at
      ),

    updated_at =
      now()

  WHERE id =
    v_transaction_id;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.refresh_payment_transaction(text)
FROM
  PUBLIC,
  anon,
  authenticated;


-- ============================================================
-- AFTER WRITE SYNCHRONISATION
-- ============================================================

CREATE OR REPLACE FUNCTION
  public.sync_payment_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path =
  public,
  pg_temp
AS $$
BEGIN
  IF TG_OP =
    'DELETE'
  THEN
    PERFORM
      public.refresh_payment_transaction(
        OLD.paystack_reference
      );

    RETURN OLD;
  END IF;


  PERFORM
    public.refresh_payment_transaction(
      NEW.paystack_reference
    );


  RETURN NEW;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.sync_payment_transaction()
FROM
  PUBLIC,
  anon,
  authenticated;


-- ============================================================
-- TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS
  attach_payment_transaction
ON public.payments;


CREATE TRIGGER
  attach_payment_transaction

BEFORE INSERT
ON public.payments

FOR EACH ROW

EXECUTE FUNCTION
  public.attach_payment_transaction();


DROP TRIGGER IF EXISTS
  protect_payment_allocation_identity
ON public.payments;


CREATE TRIGGER
  protect_payment_allocation_identity

BEFORE UPDATE OF
  paystack_reference,
  transaction_id,
  invoice_id,
  resident_id

ON public.payments

FOR EACH ROW

EXECUTE FUNCTION
  public.protect_payment_allocation_identity();


DROP TRIGGER IF EXISTS
  sync_payment_transaction
ON public.payments;


CREATE TRIGGER
  sync_payment_transaction

AFTER
  INSERT
  OR UPDATE
  OR DELETE

ON public.payments

FOR EACH ROW

EXECUTE FUNCTION
  public.sync_payment_transaction();


-- ============================================================
-- SECURITY
--
-- The application does not read payment_transactions directly
-- yet. Keep it service-role only until the later cutover phase.
-- ============================================================

ALTER TABLE
  public.payment_transactions
ENABLE ROW LEVEL SECURITY;


REVOKE ALL
ON public.payment_transactions
FROM
  PUBLIC,
  anon,
  authenticated;


GRANT ALL
ON public.payment_transactions
TO service_role;


NOTIFY pgrst, 'reload schema';

COMMIT;