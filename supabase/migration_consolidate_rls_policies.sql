BEGIN;

-- HOUSES

DROP POLICY IF EXISTS
  "admins manage houses"
ON public.houses;

DROP POLICY IF EXISTS
  "residents view own house"
ON public.houses;

CREATE POLICY
  "houses select"
ON public.houses
FOR SELECT
TO authenticated
USING (
  (SELECT public.is_estate_admin())
  OR EXISTS (
    SELECT 1
    FROM public.residents r
    WHERE r.house_id = houses.id
      AND r.auth_user_id =
        (SELECT auth.uid())
  )
);

CREATE POLICY
  "houses insert"
ON public.houses
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.is_estate_admin())
);

CREATE POLICY
  "houses update"
ON public.houses
FOR UPDATE
TO authenticated
USING (
  (SELECT public.is_estate_admin())
)
WITH CHECK (
  (SELECT public.is_estate_admin())
);

CREATE POLICY
  "houses delete"
ON public.houses
FOR DELETE
TO authenticated
USING (
  (SELECT public.is_estate_admin())
);

-- RESIDENTS

DROP POLICY IF EXISTS
  "admins manage residents"
ON public.residents;

DROP POLICY IF EXISTS
  "residents view own profile"
ON public.residents;

DROP POLICY IF EXISTS
  "staff view residents"
ON public.residents;

DROP POLICY IF EXISTS
  "repair resident write boundary"
ON public.residents;

CREATE POLICY
  "residents select"
ON public.residents
FOR SELECT
TO authenticated
USING (
  (SELECT public.is_estate_staff())
  OR auth_user_id =
    (SELECT auth.uid())
);

CREATE POLICY
  "residents insert"
ON public.residents
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.is_estate_admin())
);

CREATE POLICY
  "residents update"
ON public.residents
FOR UPDATE
TO authenticated
USING (
  (SELECT public.is_estate_admin())
)
WITH CHECK (
  (SELECT public.is_estate_admin())
);

CREATE POLICY
  "residents delete"
ON public.residents
FOR DELETE
TO authenticated
USING (
  (SELECT public.is_estate_admin())
);

-- DUE TYPES

DROP POLICY IF EXISTS
  "admins manage due types"
ON public.due_types;

DROP POLICY IF EXISTS
  "authenticated users view due types"
ON public.due_types;

DROP POLICY IF EXISTS
  "repair residents view due types"
ON public.due_types;

CREATE POLICY
  "due types select"
ON public.due_types
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY
  "due types insert"
ON public.due_types
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.is_estate_admin())
);

CREATE POLICY
  "due types update"
ON public.due_types
FOR UPDATE
TO authenticated
USING (
  (SELECT public.is_estate_admin())
)
WITH CHECK (
  (SELECT public.is_estate_admin())
);

CREATE POLICY
  "due types delete"
ON public.due_types
FOR DELETE
TO authenticated
USING (
  (SELECT public.is_estate_admin())
);

-- INVOICES

DROP POLICY IF EXISTS
  "admins manage invoices"
ON public.invoices;

DROP POLICY IF EXISTS
  "billing-responsible resident views home invoices"
ON public.invoices;

DROP POLICY IF EXISTS
  "owners always view home invoices"
ON public.invoices;

DROP POLICY IF EXISTS
  "hybrid residents view invoices"
ON public.invoices;

DROP POLICY IF EXISTS
  "hybrid invoice visibility boundary"
ON public.invoices;

DROP POLICY IF EXISTS
  "repair responsible residents view invoices"
ON public.invoices;

DROP POLICY IF EXISTS
  "repair invoice visibility boundary"
ON public.invoices;

CREATE POLICY
  "invoices select"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  (SELECT public.is_estate_admin())
  OR public.can_access_invoice_target(
    house_id,
    resident_id
  )
);

CREATE POLICY
  "invoices insert"
ON public.invoices
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.is_estate_admin())
);

CREATE POLICY
  "invoices update"
ON public.invoices
FOR UPDATE
TO authenticated
USING (
  (SELECT public.is_estate_admin())
)
WITH CHECK (
  (SELECT public.is_estate_admin())
);

CREATE POLICY
  "invoices delete"
ON public.invoices
FOR DELETE
TO authenticated
USING (
  (SELECT public.is_estate_admin())
);

-- PAYMENTS

DROP POLICY IF EXISTS
  "admins manage payments"
ON public.payments;

DROP POLICY IF EXISTS
  "residents view own payments"
ON public.payments;

CREATE POLICY
  "payments select"
ON public.payments
FOR SELECT
TO authenticated
USING (
  (SELECT public.is_estate_admin())
  OR resident_id IN (
    SELECT r.id
    FROM public.residents r
    WHERE r.auth_user_id =
      (SELECT auth.uid())
  )
);

CREATE POLICY
  "payments insert"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.is_estate_admin())
);

CREATE POLICY
  "payments update"
ON public.payments
FOR UPDATE
TO authenticated
USING (
  (SELECT public.is_estate_admin())
)
WITH CHECK (
  (SELECT public.is_estate_admin())
);

CREATE POLICY
  "payments delete"
ON public.payments
FOR DELETE
TO authenticated
USING (
  (SELECT public.is_estate_admin())
);

-- ACCESS LOGS

DROP POLICY IF EXISTS
  "admins manage access logs"
ON public.access_logs;

DROP POLICY IF EXISTS
  "gate staff view access logs"
ON public.access_logs;

DROP POLICY IF EXISTS
  "gate staff add access logs"
ON public.access_logs;

CREATE POLICY
  "access logs select"
ON public.access_logs
FOR SELECT
TO authenticated
USING (
  (SELECT public.is_estate_staff())
);

CREATE POLICY
  "access logs insert"
ON public.access_logs
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.is_estate_staff())
);

CREATE POLICY
  "access logs update"
ON public.access_logs
FOR UPDATE
TO authenticated
USING (
  (SELECT public.is_estate_admin())
)
WITH CHECK (
  (SELECT public.is_estate_admin())
);

CREATE POLICY
  "access logs delete"
ON public.access_logs
FOR DELETE
TO authenticated
USING (
  (SELECT public.is_estate_admin())
);

-- ADMINS

DROP POLICY IF EXISTS
  "staff view own account"
ON public.admins;

CREATE POLICY
  "staff view own account"
ON public.admins
FOR SELECT
TO authenticated
USING (
  auth_user_id =
    (SELECT auth.uid())
);

-- EXPENSES

DROP POLICY IF EXISTS
  "admins manage expenses"
ON public.expenses;

DROP POLICY IF EXISTS
  "repair admins manage expenses"
ON public.expenses;

DROP POLICY IF EXISTS
  "repair expenses admin boundary"
ON public.expenses;

CREATE POLICY
  "expenses select"
ON public.expenses
FOR SELECT
TO authenticated
USING (
  (SELECT public.is_estate_admin())
);

CREATE POLICY
  "expenses insert"
ON public.expenses
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.is_estate_admin())
  AND amount > 0
);

CREATE POLICY
  "expenses update"
ON public.expenses
FOR UPDATE
TO authenticated
USING (
  (SELECT public.is_estate_admin())
)
WITH CHECK (
  (SELECT public.is_estate_admin())
  AND amount > 0
);

CREATE POLICY
  "expenses delete"
ON public.expenses
FOR DELETE
TO authenticated
USING (
  (SELECT public.is_estate_admin())
);

-- REGISTRATION REQUESTS

DROP POLICY IF EXISTS
  "admins manage registration requests"
ON public.registration_requests;

DROP POLICY IF EXISTS
  "anyone can submit a registration request"
ON public.registration_requests;

CREATE POLICY
  "registration requests admin select"
ON public.registration_requests
FOR SELECT
TO authenticated
USING (
  (SELECT public.is_estate_admin())
);

CREATE POLICY
  "registration requests admin update"
ON public.registration_requests
FOR UPDATE
TO authenticated
USING (
  (SELECT public.is_estate_admin())
)
WITH CHECK (
  (SELECT public.is_estate_admin())
);

CREATE POLICY
  "registration requests admin delete"
ON public.registration_requests
FOR DELETE
TO authenticated
USING (
  (SELECT public.is_estate_admin())
);

REVOKE INSERT
ON public.registration_requests
FROM anon, authenticated;

-- STREETS

DROP POLICY IF EXISTS
  "admins manage streets"
ON public.streets;

DROP POLICY IF EXISTS
  "anyone can view streets"
ON public.streets;

DROP POLICY IF EXISTS
  "authenticated users view streets"
ON public.streets;

DROP POLICY IF EXISTS
  "repair admin streets"
ON public.streets;

DROP POLICY IF EXISTS
  "repair read streets"
ON public.streets;

CREATE POLICY
  "streets public select"
ON public.streets
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY
  "streets insert"
ON public.streets
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.is_estate_admin())
);

CREATE POLICY
  "streets update"
ON public.streets
FOR UPDATE
TO authenticated
USING (
  (SELECT public.is_estate_admin())
)
WITH CHECK (
  (SELECT public.is_estate_admin())
);

CREATE POLICY
  "streets delete"
ON public.streets
FOR DELETE
TO authenticated
USING (
  (SELECT public.is_estate_admin())
);

-- VISITOR PASSES

DROP POLICY IF EXISTS
  "view visitor passes"
ON public.visitor_passes;

CREATE POLICY
  "view visitor passes"
ON public.visitor_passes
FOR SELECT
TO authenticated
USING (
  (SELECT public.is_estate_staff())
  OR EXISTS (
    SELECT 1
    FROM public.residents r
    WHERE r.id =
      visitor_passes.resident_id
      AND r.auth_user_id =
        (SELECT auth.uid())
      AND r.is_active
  )
);

-- GATE ALERTS

DROP POLICY IF EXISTS
  "admins read gate debt alerts"
ON public.gate_due_alerts;

CREATE POLICY
  "admins read gate debt alerts"
ON public.gate_due_alerts
FOR SELECT
TO authenticated
USING (
  (SELECT public.is_estate_admin())
);

DROP POLICY IF EXISTS
  "admins read gate debt email status"
ON public.gate_due_emails;

CREATE POLICY
  "admins read gate debt email status"
ON public.gate_due_emails
FOR SELECT
TO authenticated
USING (
  (SELECT public.is_estate_admin())
);

-- INTERNAL AUTH HELPERS

REVOKE EXECUTE
ON FUNCTION public.is_estate_admin()
FROM PUBLIC, anon;

REVOKE EXECUTE
ON FUNCTION public.is_estate_staff()
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.is_estate_admin()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.is_estate_staff()
TO authenticated, service_role;

COMMIT;