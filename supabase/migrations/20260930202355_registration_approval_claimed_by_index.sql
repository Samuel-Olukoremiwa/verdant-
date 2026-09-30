BEGIN;

-- ============================================================
-- REGISTRATION APPROVAL CLAIMANT FOREIGN-KEY INDEX
--
-- registration_requests.approval_claimed_by references
-- admins.id with ON DELETE SET NULL.
--
-- PostgreSQL does not automatically create an index on the
-- referencing side of a foreign key. Without this index,
-- changes to an admin row may require scanning the entire
-- registration_requests table.
--
-- This migration is performance-only. It does not alter the
-- approval workflow or any registration data.
-- ============================================================

CREATE INDEX IF NOT EXISTS
  idx_registration_requests_approval_claimed_by
ON public.registration_requests (
  approval_claimed_by
);

COMMIT;;
