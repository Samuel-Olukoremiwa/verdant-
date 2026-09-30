-- ZADANT
-- Production schema alignment.
--
-- Captures database guarantees that currently exist in production
-- but were not previously represented by a repository migration.
--
-- This migration is intentionally idempotent.
--
-- DO NOT apply manually to production yet.
-- It is first used by the clean-database reconstruction tests.

BEGIN;

-- ============================================================
-- RESIDENT AUTH IDENTITY
-- ============================================================
--
-- One Supabase Auth user must correspond to at most one
-- resident record.
--
-- Production already has this unique index.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.residents
    WHERE auth_user_id IS NOT NULL
    GROUP BY auth_user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate resident auth_user_id values exist. Reconcile them before applying this migration.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS
  residents_auth_user_id_unique
ON public.residents (
  auth_user_id
)
WHERE auth_user_id IS NOT NULL;

-- ============================================================
-- PAYMENT REFERENCE + INVOICE UNIQUENESS
-- ============================================================
--
-- A single Paystack reference may legitimately cover multiple
-- invoices, so paystack_reference itself is NOT unique.
--
-- However, the same Paystack transaction must never create
-- two allocations against the same invoice.
--
-- Production currently enforces:
--
--   UNIQUE (paystack_reference, invoice_id)
--
-- This preserves multi-invoice payments while preventing
-- duplicate application to one invoice.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1

    FROM public.payments

    WHERE paystack_reference IS NOT NULL
      AND invoice_id IS NOT NULL

    GROUP BY
      paystack_reference,
      invoice_id

    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate payment reference/invoice allocations exist. Reconcile them before applying this migration.';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1

    FROM pg_constraint

    WHERE conrelid =
      'public.payments'::regclass

      AND conname =
        'payments_reference_invoice_unique'
  ) THEN
    ALTER TABLE public.payments

    ADD CONSTRAINT
      payments_reference_invoice_unique

    UNIQUE (
      paystack_reference,
      invoice_id
    );
  END IF;
END
$$;

COMMIT;