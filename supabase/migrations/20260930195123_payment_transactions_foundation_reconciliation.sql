BEGIN;

-- ============================================================
-- PAYMENT TRANSACTION FOUNDATION RECONCILIATION
--
-- Phase 6A was deployed before it was recorded in the tracked
-- Supabase migration history.
--
-- IMPORTANT:
--
-- This migration does NOT recreate the payment transaction
-- architecture and does NOT rewrite historical payment data.
--
-- It verifies that the already-deployed foundation is present
-- and internally consistent.
--
-- If any required foundation object or relationship is missing,
-- this migration deliberately fails rather than attempting a
-- potentially destructive repair.
-- ============================================================


DO $$
DECLARE
  v_attnotnull boolean;
BEGIN

  -- ==========================================================
  -- CANONICAL TRANSACTION TABLE
  -- ==========================================================

  IF to_regclass(
    'public.payment_transactions'
  ) IS NULL
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: public.payment_transactions does not exist.';
  END IF;


  -- ==========================================================
  -- PAYMENTS.TRANSACTION_ID
  -- ==========================================================

  SELECT
    a.attnotnull

  INTO
    v_attnotnull

  FROM pg_attribute a

  JOIN pg_class c
    ON c.oid =
      a.attrelid

  JOIN pg_namespace n
    ON n.oid =
      c.relnamespace

  WHERE
    n.nspname =
      'public'

    AND c.relname =
      'payments'

    AND a.attname =
      'transaction_id'

    AND a.attnum >
      0

    AND NOT a.attisdropped;


  IF NOT FOUND
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: public.payments.transaction_id does not exist.';
  END IF;


  IF NOT v_attnotnull
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: public.payments.transaction_id is nullable.';
  END IF;


  -- ==========================================================
  -- REQUIRED CONSTRAINTS
  -- ==========================================================

  IF NOT EXISTS (
    SELECT 1

    FROM pg_constraint

    WHERE
      conrelid =
        'public.payments'::regclass

      AND conname =
        'payments_transaction_id_fkey'
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: payments_transaction_id_fkey is missing.';
  END IF;


  IF NOT EXISTS (
    SELECT 1

    FROM pg_constraint

    WHERE
      conrelid =
        'public.payments'::regclass

      AND conname =
        'payments_transaction_invoice_unique'
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: payments_transaction_invoice_unique is missing.';
  END IF;


  IF NOT EXISTS (
    SELECT 1

    FROM pg_constraint

    WHERE
      conrelid =
        'public.payment_transactions'::regclass

      AND conname =
        'payment_transactions_reference_not_blank'
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: payment_transactions_reference_not_blank is missing.';
  END IF;


  IF NOT EXISTS (
    SELECT 1

    FROM pg_constraint

    WHERE
      conrelid =
        'public.payment_transactions'::regclass

      AND conname =
        'payment_transactions_provider_check'
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: payment_transactions_provider_check is missing.';
  END IF;


  IF NOT EXISTS (
    SELECT 1

    FROM pg_constraint

    WHERE
      conrelid =
        'public.payment_transactions'::regclass

      AND conname =
        'payment_transactions_amount_positive'
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: payment_transactions_amount_positive is missing.';
  END IF;


  IF NOT EXISTS (
    SELECT 1

    FROM pg_constraint

    WHERE
      conrelid =
        'public.payment_transactions'::regclass

      AND conname =
        'payment_transactions_currency_check'
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: payment_transactions_currency_check is missing.';
  END IF;


  IF NOT EXISTS (
    SELECT 1

    FROM pg_constraint

    WHERE
      conrelid =
        'public.payment_transactions'::regclass

      AND conname =
        'payment_transactions_status_check'
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: payment_transactions_status_check is missing.';
  END IF;


  -- ==========================================================
  -- REQUIRED INDEXES
  -- ==========================================================

  IF to_regclass(
    'public.payment_transactions_resident_created'
  ) IS NULL
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: payment_transactions_resident_created index is missing.';
  END IF;


  IF to_regclass(
    'public.payment_transactions_status_created'
  ) IS NULL
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: payment_transactions_status_created index is missing.';
  END IF;


  IF to_regclass(
    'public.payments_transaction_id_idx'
  ) IS NULL
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: payments_transaction_id_idx is missing.';
  END IF;


  -- ==========================================================
  -- REQUIRED FUNCTIONS
  -- ==========================================================

  IF NOT EXISTS (
    SELECT 1

    FROM pg_proc p

    JOIN pg_namespace n
      ON n.oid =
        p.pronamespace

    WHERE
      n.nspname =
        'public'

      AND p.proname =
        'attach_payment_transaction'

      AND p.pronargs =
        0
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: attach_payment_transaction() is missing.';
  END IF;


  IF NOT EXISTS (
    SELECT 1

    FROM pg_proc p

    JOIN pg_namespace n
      ON n.oid =
        p.pronamespace

    WHERE
      n.nspname =
        'public'

      AND p.proname =
        'protect_payment_allocation_identity'

      AND p.pronargs =
        0
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: protect_payment_allocation_identity() is missing.';
  END IF;


  IF NOT EXISTS (
    SELECT 1

    FROM pg_proc p

    JOIN pg_namespace n
      ON n.oid =
        p.pronamespace

    WHERE
      n.nspname =
        'public'

      AND p.proname =
        'refresh_payment_transaction'

      AND p.pronargs =
        1
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: refresh_payment_transaction(text) is missing.';
  END IF;


  IF NOT EXISTS (
    SELECT 1

    FROM pg_proc p

    JOIN pg_namespace n
      ON n.oid =
        p.pronamespace

    WHERE
      n.nspname =
        'public'

      AND p.proname =
        'sync_payment_transaction'

      AND p.pronargs =
        0
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: sync_payment_transaction() is missing.';
  END IF;


  -- ==========================================================
  -- REQUIRED TRIGGERS
  -- ==========================================================

  IF NOT EXISTS (
    SELECT 1

    FROM pg_trigger

    WHERE
      tgrelid =
        'public.payments'::regclass

      AND tgname =
        'attach_payment_transaction'

      AND NOT tgisinternal
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: attach_payment_transaction trigger is missing.';
  END IF;


  IF NOT EXISTS (
    SELECT 1

    FROM pg_trigger

    WHERE
      tgrelid =
        'public.payments'::regclass

      AND tgname =
        'protect_payment_allocation_identity'

      AND NOT tgisinternal
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: protect_payment_allocation_identity trigger is missing.';
  END IF;


  IF NOT EXISTS (
    SELECT 1

    FROM pg_trigger

    WHERE
      tgrelid =
        'public.payments'::regclass

      AND tgname =
        'sync_payment_transaction'

      AND NOT tgisinternal
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: sync_payment_transaction trigger is missing.';
  END IF;


  -- ==========================================================
  -- ROW LEVEL SECURITY
  -- ==========================================================

  IF NOT EXISTS (
    SELECT 1

    FROM pg_class c

    JOIN pg_namespace n
      ON n.oid =
        c.relnamespace

    WHERE
      n.nspname =
        'public'

      AND c.relname =
        'payment_transactions'

      AND c.relrowsecurity =
        true
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: RLS is not enabled on payment_transactions.';
  END IF;


  -- ==========================================================
  -- DATA INTEGRITY:
  -- EVERY ALLOCATION HAS A TRANSACTION
  -- ==========================================================

  IF EXISTS (
    SELECT 1

    FROM public.payments

    WHERE transaction_id
      IS NULL
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: one or more payment allocations have no transaction.';
  END IF;


  -- ==========================================================
  -- DATA INTEGRITY:
  -- NO BROKEN FOREIGN RELATIONSHIPS
  -- ==========================================================

  IF EXISTS (
    SELECT 1

    FROM public.payments p

    LEFT JOIN public.payment_transactions t
      ON t.id =
        p.transaction_id

    WHERE t.id
      IS NULL
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: orphan payment transaction links exist.';
  END IF;


  -- ==========================================================
  -- DATA INTEGRITY:
  -- ALLOCATION REFERENCE = TRANSACTION REFERENCE
  -- ==========================================================

  IF EXISTS (
    SELECT 1

    FROM public.payments p

    JOIN public.payment_transactions t
      ON t.id =
        p.transaction_id

    WHERE
      t.reference
        IS DISTINCT FROM
        p.paystack_reference
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: allocation and transaction references disagree.';
  END IF;


  -- ==========================================================
  -- DATA INTEGRITY:
  -- ONE TRANSACTION = ONE RESIDENT
  -- ==========================================================

  IF EXISTS (
    SELECT 1

    FROM public.payment_transactions t

    JOIN public.payments p
      ON p.transaction_id =
        t.id

    GROUP BY
      t.id,
      t.resident_id

    HAVING
      COUNT(
        DISTINCT p.resident_id
      ) <>
        1

      OR MIN(
        p.resident_id::text
      )::uuid
        IS DISTINCT FROM
        t.resident_id
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: resident identity mismatch exists.';
  END IF;


  -- ==========================================================
  -- DATA INTEGRITY:
  -- TRANSACTION TOTAL = SUM OF ALLOCATIONS
  -- ==========================================================

  IF EXISTS (
    SELECT 1

    FROM public.payment_transactions t

    JOIN public.payments p
      ON p.transaction_id =
        t.id

    GROUP BY
      t.id,
      t.amount

    HAVING
      t.amount
        IS DISTINCT FROM
        SUM(
          p.amount
        )::numeric(12,2)
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: transaction totals do not match allocation totals.';
  END IF;


  -- ==========================================================
  -- DATA INTEGRITY:
  -- TRANSACTION STATUS = DERIVED ALLOCATION STATUS
  -- ==========================================================

  IF EXISTS (
    SELECT 1

    FROM (
      SELECT
        t.id,

        t.status,

        CASE
          WHEN bool_and(
            p.status =
              'success'
          )
          THEN
            'success'

          WHEN bool_or(
            p.status =
              'pending'
          )
          THEN
            'pending'

          WHEN bool_or(
            p.status =
              'failed'
          )
          THEN
            'failed'

          ELSE
            'pending'
        END AS expected_status

      FROM public.payment_transactions t

      JOIN public.payments p
        ON p.transaction_id =
          t.id

      GROUP BY
        t.id,
        t.status
    ) state_check

    WHERE
      state_check.status
        IS DISTINCT FROM
        state_check.expected_status
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: transaction status does not match allocation state.';
  END IF;


  -- ==========================================================
  -- DATA INTEGRITY:
  -- NO ORPHAN CANONICAL TRANSACTIONS
  -- ==========================================================

  IF EXISTS (
    SELECT 1

    FROM public.payment_transactions t

    WHERE NOT EXISTS (
      SELECT 1

      FROM public.payments p

      WHERE
        p.transaction_id =
          t.id
    )
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: canonical transactions without allocations exist.';
  END IF;


  -- ==========================================================
  -- CORE FUNCTION ACCESS
  --
  -- These trigger/internal functions must not be callable
  -- directly by anon or authenticated users.
  -- ==========================================================

  IF EXISTS (
    SELECT 1

    FROM pg_proc p

    JOIN pg_namespace n
      ON n.oid =
        p.pronamespace

    WHERE
      n.nspname =
        'public'

      AND p.proname IN (
        'attach_payment_transaction',
        'protect_payment_allocation_identity',
        'refresh_payment_transaction',
        'sync_payment_transaction'
      )

      AND (
        has_function_privilege(
          'anon',
          p.oid,
          'EXECUTE'
        )

        OR

        has_function_privilege(
          'authenticated',
          p.oid,
          'EXECUTE'
        )
      )
  )
  THEN
    RAISE EXCEPTION
      'Payment transaction reconciliation failed: an internal transaction function is executable by anon or authenticated.';
  END IF;

END
$$;


-- ============================================================
-- No schema/data mutation is intentionally performed above.
--
-- Successful application of this migration records that the
-- pre-existing Phase 6A payment transaction foundation was
-- verified and reconciled with tracked migration history.
-- ============================================================

COMMIT;;
