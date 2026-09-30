
BEGIN;

CREATE OR REPLACE FUNCTION public.gate_due_email_to_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recipient text;
BEGIN
  v_recipient := lower(btrim(NEW.recipient));

  IF v_recipient = '' THEN
    NEW.status := 'failed';
    RETURN NEW;
  END IF;

  INSERT INTO public.notification_outbox (
    event_key,
    kind,
    channel,
    recipient,
    subject,
    body
  )
  VALUES (
    'gate:' ||
      NEW.alert_id::text ||
      ':' ||
      NEW.audience ||
      ':' ||
      md5(v_recipient),
    'gate',
    'email',
    v_recipient,
    NULL,
    jsonb_build_object(
      'alert_id', NEW.alert_id,
      'audience', NEW.audience
    )::text
  )
  ON CONFLICT (channel,event_key)
  DO NOTHING;

  NEW.status := 'migrated';
  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.gate_due_email_to_outbox()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS gate_due_email_to_outbox
ON public.gate_due_emails;

CREATE TRIGGER gate_due_email_to_outbox
BEFORE INSERT
ON public.gate_due_emails
FOR EACH ROW
EXECUTE FUNCTION public.gate_due_email_to_outbox();

INSERT INTO public.notification_outbox (
  event_key,
  kind,
  channel,
  recipient,
  subject,
  body
)
SELECT
  'gate:' ||
    g.alert_id::text ||
    ':' ||
    g.audience ||
    ':' ||
    md5(lower(btrim(g.recipient))),
  'gate',
  'email',
  lower(btrim(g.recipient)),
  NULL,
  jsonb_build_object(
    'alert_id', g.alert_id,
    'audience', g.audience
  )::text
FROM public.gate_due_emails g
WHERE g.status IN ('pending','sending')
ON CONFLICT (channel,event_key)
DO NOTHING;

UPDATE public.gate_due_emails
SET status='migrated'
WHERE status IN ('pending','sending');

NOTIFY pgrst, 'reload schema';

COMMIT;
;
