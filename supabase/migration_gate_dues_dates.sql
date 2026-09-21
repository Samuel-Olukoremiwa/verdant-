-- Apply after existing phase and design-security migrations.
BEGIN;
ALTER TABLE public.registration_requests ADD COLUMN IF NOT EXISTS move_in_date date;
ALTER TABLE public.registration_requests ADD COLUMN IF NOT EXISTS property_allocation_date date;
-- Preserve unknown historic dates. Require actual dates on new records and date edits.
CREATE OR REPLACE FUNCTION public.require_resident_dates() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.move_in_date IS NULL OR NEW.property_allocation_date IS NULL THEN
  RAISE EXCEPTION 'Move-in date and property allocation date are required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS require_resident_dates ON public.residents;
CREATE TRIGGER require_resident_dates BEFORE INSERT OR UPDATE OF move_in_date,property_allocation_date ON public.residents FOR EACH ROW EXECUTE FUNCTION public.require_resident_dates();
DROP TRIGGER IF EXISTS require_registration_dates ON public.registration_requests;
CREATE TRIGGER require_registration_dates BEFORE INSERT OR UPDATE OF move_in_date,property_allocation_date ON public.registration_requests FOR EACH ROW EXECUTE FUNCTION public.require_resident_dates();

CREATE TABLE IF NOT EXISTS public.gate_due_alerts (
 id uuid PRIMARY KEY REFERENCES public.access_logs(id) ON DELETE CASCADE,
 resident_id uuid REFERENCES public.residents(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 details jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.gate_due_emails (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 alert_id uuid NOT NULL REFERENCES public.gate_due_alerts(id) ON DELETE CASCADE,
 recipient text NOT NULL,
 audience text NOT NULL CHECK(audience IN ('resident','admin')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 first_attempt_at timestamptz,
 sent_at timestamptz,
 UNIQUE(alert_id,recipient,audience)
);
ALTER TABLE public.gate_due_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_due_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gate_due_alerts,public.gate_due_emails FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.gate_due_alerts,public.gate_due_emails TO authenticated;
GRANT ALL ON public.gate_due_alerts,public.gate_due_emails TO service_role;
DROP POLICY IF EXISTS "admins read gate debt alerts" ON public.gate_due_alerts;
CREATE POLICY "admins read gate debt alerts" ON public.gate_due_alerts FOR SELECT TO authenticated USING(public.is_estate_admin());
DROP POLICY IF EXISTS "admins read gate debt email status" ON public.gate_due_emails;
CREATE POLICY "admins read gate debt email status" ON public.gate_due_emails FOR SELECT TO authenticated USING(public.is_estate_admin());
CREATE INDEX IF NOT EXISTS gate_due_emails_pending ON public.gate_due_emails(status,available_at);

CREATE OR REPLACE FUNCTION public.queue_gate_due_alert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r residents%rowtype; address_text text; bills jsonb; balance numeric; recipient_email text;
BEGIN
 IF NEW.direction<>'entry' THEN RETURN NEW; END IF;
 SELECT * INTO r FROM residents WHERE id=NEW.resident_id;
 IF r.id IS NULL OR NOT r.is_active THEN RETURN NEW; END IF;
 SELECT address INTO address_text FROM houses WHERE id=r.house_id;
 SELECT sum(greatest(i.amount-coalesce(i.amount_paid,0),0)),
 jsonb_agg(jsonb_build_object('label',coalesce(d.name,'Estate charge'),'amount',greatest(i.amount-coalesce(i.amount_paid,0),0),'due_date',i.due_date) ORDER BY i.due_date,i.id)
 INTO balance,bills FROM invoices i LEFT JOIN due_types d ON d.id=i.due_type_id
 WHERE i.house_id=r.house_id AND i.status IN ('unpaid','partial','overdue') AND i.amount>coalesce(i.amount_paid,0);
 IF coalesce(balance,0)<=0 THEN RETURN NEW; END IF;
 INSERT INTO gate_due_alerts(id,resident_id,details) VALUES(NEW.id,r.id,jsonb_build_object(
 'name',r.full_name,'email',r.email,'phone',r.phone,'address',coalesce(address_text,'Unassigned home'),
 'entered_at',NEW.scanned_at,'balance',balance,'bills',bills));
 recipient_email:=nullif(btrim(r.email),'');
 IF recipient_email IS NULL THEN SELECT email INTO recipient_email FROM auth.users WHERE id=r.auth_user_id; END IF;
 IF recipient_email IS NOT NULL THEN INSERT INTO gate_due_emails(alert_id,recipient,audience) VALUES(NEW.id,lower(recipient_email),'resident') ON CONFLICT DO NOTHING; END IF;
 INSERT INTO gate_due_emails(alert_id,recipient,audience)
 SELECT DISTINCT NEW.id,lower(u.email),'admin' FROM admins a JOIN auth.users u ON u.id=a.auth_user_id
 WHERE a.role IN ('admin','super_admin') AND nullif(btrim(u.email),'') IS NOT NULL ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS queue_gate_due_alert ON public.access_logs;
CREATE TRIGGER queue_gate_due_alert AFTER INSERT ON public.access_logs FOR EACH ROW EXECUTE FUNCTION public.queue_gate_due_alert();

CREATE OR REPLACE FUNCTION public.record_resident_scan(p_code text,p_direction text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r residents%rowtype; log_id uuid; scanner text;
BEGIN
 IF NOT public.is_estate_staff() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF p_direction NOT IN ('entry','exit') OR p_direction IS NULL OR length(p_code)>200 THEN RAISE EXCEPTION 'Invalid scan'; END IF;
 SELECT * INTO r FROM residents WHERE qr_code_value=p_code FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'QR code not recognized'; END IF;
 IF NOT coalesce(r.is_active,false) THEN RAISE EXCEPTION 'Resident access is inactive'; END IF;
 -- Locking the resident serialises simultaneous scanners and suppresses duplicate reads.
 SELECT id INTO log_id FROM access_logs WHERE resident_id=r.id AND direction=p_direction AND scanned_at>now()-interval '8 seconds' ORDER BY scanned_at DESC LIMIT 1;
 IF log_id IS NULL THEN
 SELECT coalesce(full_name,'Gate staff') INTO scanner FROM admins WHERE auth_user_id=auth.uid() LIMIT 1;
 INSERT INTO access_logs(resident_id,direction,scanned_by) VALUES(r.id,p_direction,scanner) RETURNING id INTO log_id;
 END IF;
 RETURN jsonb_build_object('id',log_id,'name',r.full_name,'direction',p_direction);
END $$;
REVOKE ALL ON FUNCTION public.record_resident_scan(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_resident_scan(text,text) TO authenticated;
-- Every browser scan must go through the checked, deduplicated function.
REVOKE INSERT ON public.access_logs FROM authenticated,anon;

CREATE OR REPLACE FUNCTION public.claim_gate_due_emails(p_alert uuid DEFAULT NULL) RETURNS SETOF public.gate_due_emails
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- Never retry an uncertain send after the provider's 24-hour idempotency window.
 UPDATE gate_due_emails SET status='failed' WHERE status IN ('pending','sending') AND (attempts>=5 OR first_attempt_at<now()-interval '23 hours');
 RETURN QUERY WITH candidates AS (
 SELECT id FROM gate_due_emails WHERE status IN ('pending','sending') AND available_at<=now()
 AND (p_alert IS NULL OR alert_id=p_alert) ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED
 ) UPDATE gate_due_emails e SET status='sending',attempts=e.attempts+1,
 first_attempt_at=coalesce(e.first_attempt_at,now()),available_at=now()+interval '2 minutes'
 FROM candidates c WHERE e.id=c.id RETURNING e.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_gate_due_emails(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_gate_due_emails(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.queue_gate_due_alert() FROM PUBLIC,anon,authenticated;
COMMIT;
