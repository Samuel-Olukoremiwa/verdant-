BEGIN;

ALTER TABLE public.registration_requests
  DROP CONSTRAINT IF EXISTS registration_decline_reason_required;

ALTER TABLE public.registration_requests
  ADD CONSTRAINT registration_decline_reason_required
  CHECK (
    status IS DISTINCT FROM 'declined'
    OR (
      decline_reason IS NOT NULL
      AND length(btrim(decline_reason)) >= 3
    )
  )
  NOT VALID;

-- NOT VALID allows any old declined records without reasons
-- to remain, while enforcing the rule on new/updated records.

NOTIFY pgrst, 'reload schema';

COMMIT;