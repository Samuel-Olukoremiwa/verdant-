
BEGIN;

ALTER TABLE public.gate_due_emails
  DROP CONSTRAINT IF EXISTS gate_due_emails_status_check;

ALTER TABLE public.gate_due_emails
  ADD CONSTRAINT gate_due_emails_status_check
  CHECK (
    status IN (
      'pending',
      'sending',
      'migrated',
      'sent',
      'failed'
    )
  );

COMMIT;
;
