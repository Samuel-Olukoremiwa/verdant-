
BEGIN;

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('billing','registration','visitor','gate')),
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  recipient text NOT NULL,
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','sent','failed','unknown')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  provider_id text,
  provider_code text,
  last_error text,
  available_at timestamptz NOT NULL DEFAULT now(),
  first_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel,event_key)
);

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.notification_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_outbox TO service_role;

CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending
ON public.notification_outbox(status,available_at,created_at);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_kind_status
ON public.notification_outbox(kind,status,available_at);

COMMIT;
;
