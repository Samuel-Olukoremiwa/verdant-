
CREATE OR REPLACE FUNCTION public.claim_notification_outbox(
  p_kind text DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS SETOF public.notification_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'Claim size must be between 1 and 50';
  END IF;

  UPDATE public.notification_outbox
  SET
    status = 'unknown',
    last_error = COALESCE(
      last_error,
      'SMS worker stopped after the job was claimed; provider outcome is unknown.'
    ),
    updated_at = now()
  WHERE channel = 'sms'
    AND status = 'sending'
    AND available_at <= now();

  UPDATE public.notification_outbox
  SET
    status = 'failed',
    last_error = COALESCE(
      last_error,
      'Maximum delivery attempts exceeded.'
    ),
    updated_at = now()
  WHERE channel = 'email'
    AND status IN ('pending','sending')
    AND (
      attempts >= 5
      OR (
        first_attempt_at IS NOT NULL
        AND first_attempt_at < now() - interval '23 hours'
      )
    );

  RETURN QUERY
  WITH candidates AS (
    SELECT n.id
    FROM public.notification_outbox n
    WHERE n.available_at <= now()
      AND (
        n.status = 'pending'
        OR (
          n.channel = 'email'
          AND n.status = 'sending'
        )
      )
      AND (
        p_kind IS NULL
        OR n.kind = p_kind
      )
    ORDER BY n.available_at,n.created_at,n.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notification_outbox n
  SET
    status = 'sending',
    attempts = n.attempts + 1,
    first_attempt_at = COALESCE(n.first_attempt_at,now()),
    available_at = now() + interval '2 minutes',
    updated_at = now()
  FROM candidates c
  WHERE n.id = c.id
  RETURNING n.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_outbox(text,integer)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_notification_outbox(text,integer)
TO service_role;
;
