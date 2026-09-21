-- Apply after existing phase migrations. No existing records are deleted.
BEGIN;
ALTER TABLE public.registration_requests ADD COLUMN IF NOT EXISTS consent_version text;
ALTER TABLE public.registration_requests ADD COLUMN IF NOT EXISTS consent_at timestamptz;
ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;
-- Public submissions now pass through the validated server endpoint.
REVOKE INSERT, UPDATE, DELETE ON public.registration_requests FROM anon;
REVOKE INSERT ON public.registration_requests FROM authenticated;
CREATE TABLE IF NOT EXISTS public.registration_rate_limits (
 key text PRIMARY KEY,
 window_start timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 1
);
ALTER TABLE public.registration_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_rate_limits FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.consume_registration_limit(p_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE count_now integer;
BEGIN
 IF p_key !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
 INSERT INTO registration_rate_limits AS limits(key,window_start,attempts)
 VALUES(p_key,now(),1)
 ON CONFLICT(key) DO UPDATE SET
 attempts=CASE WHEN limits.window_start < now()-interval '1 hour' THEN 1 ELSE limits.attempts+1 END,
 window_start=CASE WHEN limits.window_start < now()-interval '1 hour' THEN now() ELSE limits.window_start END
 RETURNING attempts INTO count_now;
 DELETE FROM registration_rate_limits WHERE window_start < now()-interval '2 days';
 RETURN count_now<=5;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_registration_limit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_registration_limit(text) TO service_role;
COMMIT;
