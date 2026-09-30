BEGIN;

ALTER TABLE public.due_types
  VALIDATE CONSTRAINT due_types_frequency_check;

ALTER TABLE public.registration_requests
  VALIDATE CONSTRAINT registration_decline_reason_required;

ALTER FUNCTION public.normalize_address_key(text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.normalize_label(text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.canonical_house_number(text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.anchored_month_date(date, integer)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.resident_invoice_periods(text, date, date)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.canonical_billing_frequency(text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.house_billing_period_label(text, date, date)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.billing_periods_canonical(text, date, date)
  SET search_path = public, pg_temp;

REVOKE EXECUTE
ON FUNCTION public.clear_invalid_billing_assignment()
FROM PUBLIC, anon, authenticated;

DROP INDEX IF EXISTS public.residents_auth_user_id_unique;

CREATE INDEX IF NOT EXISTS idx_admins_auth_user_id
  ON public.admins(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_created_by
  ON public.expenses(created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gate_due_alerts_resident_id
  ON public.gate_due_alerts(resident_id)
  WHERE resident_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_houses_billing_responsible_resident_id
  ON public.houses(billing_responsible_resident_id)
  WHERE billing_responsible_resident_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_due_type_id
  ON public.invoices(due_type_id)
  WHERE due_type_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id
  ON public.payments(invoice_id)
  WHERE invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registration_requests_created_resident_id
  ON public.registration_requests(created_resident_id)
  WHERE created_resident_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registration_requests_reviewed_by
  ON public.registration_requests(reviewed_by)
  WHERE reviewed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registration_requests_street_id
  ON public.registration_requests(street_id)
  WHERE street_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visitor_passes_house_id
  ON public.visitor_passes(house_id);

CREATE INDEX IF NOT EXISTS idx_visitor_passes_redeemed_by
  ON public.visitor_passes(redeemed_by)
  WHERE redeemed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_due_date_status
  ON public.invoices(due_date, status);

CREATE INDEX IF NOT EXISTS idx_payments_status_paid_at
  ON public.payments(status, paid_at);

CREATE INDEX IF NOT EXISTS idx_expenses_expense_date
  ON public.expenses(expense_date);

CREATE INDEX IF NOT EXISTS idx_access_logs_scanned_at
  ON public.access_logs(scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_registration_requests_status_created_at
  ON public.registration_requests(status, created_at DESC);

COMMIT;