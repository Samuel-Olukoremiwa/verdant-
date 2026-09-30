BEGIN;

-- ============================================================
-- RESTRICT LEGACY SINGLE-HOUSE INVOICE HELPER
--
-- generate_single_house_invoice(...) is a SECURITY DEFINER
-- compatibility/helper function.
--
-- The current admin application does not call this RPC
-- directly. Household billing uses:
--
--   preview_single_house_invoices_range(...)
--   generate_single_house_invoices_range(...)
--
-- Those exposed RPCs contain their own administrator
-- authorization checks.
--
-- The legacy helper itself does not perform an authorization
-- check, so it must not be directly executable by anon or
-- authenticated users.
-- ============================================================

REVOKE ALL
ON FUNCTION
  public.generate_single_house_invoice(
    uuid,
    uuid,
    date,
    date,
    date
  )
FROM
  PUBLIC,
  anon,
  authenticated;


-- Keep server-side/internal compatibility.
GRANT EXECUTE
ON FUNCTION
  public.generate_single_house_invoice(
    uuid,
    uuid,
    date,
    date,
    date
  )
TO
  service_role;

COMMIT;;
