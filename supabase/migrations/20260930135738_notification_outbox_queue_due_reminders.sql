
CREATE OR REPLACE FUNCTION public.queue_due_reminders(
  p_days_ahead integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Africa/Lagos')::date;
  v_cutoff date;
  v_invoices_checked integer := 0;
  v_residents_eligible integer := 0;
  v_emails_queued integer := 0;
  v_sms_queued integer := 0;
  v_skipped_no_email integer := 0;
  v_skipped_no_phone integer := 0;
BEGIN
  IF p_days_ahead < 0 OR p_days_ahead > 365 THEN
    RAISE EXCEPTION 'Reminder window must be between 0 and 365 days';
  END IF;

  v_cutoff := v_today + p_days_ahead;

  SELECT count(*)::integer
  INTO v_invoices_checked
  FROM public.invoices i
  WHERE i.status IN ('unpaid','partial','overdue')
    AND i.due_date <= v_cutoff;

  CREATE TEMP TABLE reminder_targets
  ON COMMIT DROP
  AS
  WITH outstanding AS (
    SELECT
      i.id,
      i.house_id,
      i.resident_id,
      GREATEST(
        0::numeric,
        i.amount::numeric - COALESCE(i.amount_paid,0)::numeric
      ) AS balance
    FROM public.invoices i
    WHERE i.status IN ('unpaid','partial','overdue')
      AND i.due_date <= v_cutoff
  ),
  personal AS (
    SELECT
      resident_id,
      SUM(balance)::numeric AS amount,
      count(*)::integer AS bill_count
    FROM outstanding
    WHERE resident_id IS NOT NULL
      AND balance > 0
    GROUP BY resident_id
  ),
  household AS (
    SELECT
      o.house_id,
      h.address,
      COALESCE(
        h.billing_responsible_resident_id,
        (
          SELECT owner.id
          FROM public.residents owner
          WHERE owner.house_id = o.house_id
            AND owner.is_active
            AND owner.relationship = 'owner'
          ORDER BY owner.id
          LIMIT 1
        )
      ) AS payer_id,
      SUM(o.balance)::numeric AS amount,
      count(*)::integer AS bill_count
    FROM outstanding o
    JOIN public.houses h ON h.id = o.house_id
    WHERE o.house_id IS NOT NULL
      AND o.resident_id IS NULL
      AND o.balance > 0
    GROUP BY o.house_id,h.address,h.billing_responsible_resident_id
  ),
  combined AS (
    SELECT
      r.id AS resident_id,
      r.full_name,
      r.email,
      r.phone,
      r.house_id,
      COALESCE(p.amount,0)::numeric AS personal_amount,
      COALESCE(p.bill_count,0)::integer AS personal_count,
      COALESCE(h.amount,0)::numeric AS household_amount,
      COALESCE(h.bill_count,0)::integer AS household_count,
      h.address AS household_address
    FROM public.residents r
    LEFT JOIN personal p ON p.resident_id = r.id
    LEFT JOIN household h ON h.payer_id = r.id
    WHERE r.is_active
  )
  SELECT
    resident_id,
    full_name,
    NULLIF(lower(btrim(COALESCE(email,''))),'') AS email,
    NULLIF(btrim(COALESCE(phone,'')),'') AS phone,
    personal_amount,
    personal_count,
    household_amount,
    household_count,
    household_address,
    (personal_amount + household_amount)::numeric AS total_amount,
    (personal_count + household_count)::integer AS total_count,
    concat_ws(
      ' and ',
      CASE
        WHEN personal_amount > 0
        THEN
          'NGN ' ||
          to_char(personal_amount,'FM999G999G999G990D00') ||
          ' across ' ||
          personal_count ||
          ' personal bill' ||
          CASE WHEN personal_count = 1 THEN '' ELSE 's' END
      END,
      CASE
        WHEN household_amount > 0
        THEN
          'NGN ' ||
          to_char(household_amount,'FM999G999G999G990D00') ||
          ' across ' ||
          household_count ||
          ' household bill' ||
          CASE WHEN household_count = 1 THEN '' ELSE 's' END ||
          ' for ' ||
          COALESCE(household_address,'your home')
      END
    ) AS summary
  FROM combined
  WHERE (personal_amount + household_amount) > 0
    AND (personal_count + household_count) > 0;

  SELECT count(*)::integer INTO v_residents_eligible
  FROM reminder_targets;

  SELECT count(*)::integer INTO v_skipped_no_email
  FROM reminder_targets
  WHERE email IS NULL;

  SELECT count(*)::integer INTO v_skipped_no_phone
  FROM reminder_targets
  WHERE phone IS NULL;

  WITH inserted AS (
    INSERT INTO public.notification_outbox (
      event_key,kind,channel,recipient,subject,body
    )
    SELECT
      'billing:' || v_today::text || ':' || resident_id::text,
      'billing',
      'email',
      email,
      'Your estate dues reminder',
      'Zadant: ' ||
        summary ||
        ' outstanding. Please sign in to your resident portal to view and pay. If recently paid, check your updated balance.'
    FROM reminder_targets
    WHERE email IS NOT NULL
    ON CONFLICT (channel,event_key) DO NOTHING
    RETURNING id
  )
  SELECT count(*)::integer INTO v_emails_queued
  FROM inserted;

  WITH inserted AS (
    INSERT INTO public.notification_outbox (
      event_key,kind,channel,recipient,body
    )
    SELECT
      'billing:' || v_today::text || ':' || resident_id::text,
      'billing',
      'sms',
      phone,
      'Zadant: ' ||
        summary ||
        ' outstanding. Please sign in to your resident portal to view and pay. If recently paid, check your updated balance.'
    FROM reminder_targets
    WHERE phone IS NOT NULL
    ON CONFLICT (channel,event_key) DO NOTHING
    RETURNING id
  )
  SELECT count(*)::integer INTO v_sms_queued
  FROM inserted;

  RETURN jsonb_build_object(
    'date',v_today,
    'cutoff',v_cutoff,
    'invoices_checked',v_invoices_checked,
    'residents_eligible',v_residents_eligible,
    'emails_queued',v_emails_queued,
    'sms_queued',v_sms_queued,
    'skipped_no_email',v_skipped_no_email,
    'skipped_no_phone',v_skipped_no_phone
  );
END;
$$;

REVOKE ALL ON FUNCTION public.queue_due_reminders(integer)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.queue_due_reminders(integer)
TO service_role;
;
