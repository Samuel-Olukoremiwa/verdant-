BEGIN;

-- ============================================================
-- DURABLE NOTIFICATION OUTBOX
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id uuid
    PRIMARY KEY
    DEFAULT gen_random_uuid(),

  event_key text
    NOT NULL,

  kind text
    NOT NULL
    CHECK (
      kind IN (
        'billing',
        'registration',
        'visitor',
        'gate'
      )
    ),

  channel text
    NOT NULL
    CHECK (
      channel IN (
        'email',
        'sms'
      )
    ),

  recipient text
    NOT NULL,

  subject text,

  body text
    NOT NULL,

  status text
    NOT NULL
    DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'sending',
        'sent',
        'failed',
        'unknown'
      )
    ),

  attempts integer
    NOT NULL
    DEFAULT 0
    CHECK (
      attempts >= 0
    ),

  provider_id text,

  provider_code text,

  last_error text,

  available_at timestamptz
    NOT NULL
    DEFAULT now(),

  first_attempt_at timestamptz,

  sent_at timestamptz,

  created_at timestamptz
    NOT NULL
    DEFAULT now(),

  updated_at timestamptz
    NOT NULL
    DEFAULT now(),

  UNIQUE (
    channel,
    event_key
  )
);

ALTER TABLE
  public.notification_outbox
ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON public.notification_outbox
FROM
  PUBLIC,
  anon,
  authenticated;

GRANT
  SELECT,
  INSERT,
  UPDATE
ON public.notification_outbox
TO service_role;

CREATE INDEX IF NOT EXISTS
  idx_notification_outbox_pending
ON public.notification_outbox (
  status,
  available_at,
  created_at
);

CREATE INDEX IF NOT EXISTS
  idx_notification_outbox_kind_status
ON public.notification_outbox (
  kind,
  status,
  available_at
);


-- ============================================================
-- QUEUE BILLING REMINDERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.queue_due_reminders(
  p_days_ahead integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date :=
    (
      now()
      AT TIME ZONE
        'Africa/Lagos'
    )::date;

  v_cutoff date;

  v_invoices_checked integer :=
    0;

  v_residents_eligible integer :=
    0;

  v_emails_queued integer :=
    0;

  v_sms_queued integer :=
    0;

  v_skipped_no_email integer :=
    0;

  v_skipped_no_phone integer :=
    0;
BEGIN
  IF
    p_days_ahead < 0
    OR p_days_ahead > 365
  THEN
    RAISE EXCEPTION
      'Reminder window must be between 0 and 365 days';
  END IF;

  v_cutoff :=
    v_today +
    p_days_ahead;

  SELECT
    count(*)::integer

  INTO
    v_invoices_checked

  FROM public.invoices i

  WHERE
    i.status IN (
      'unpaid',
      'partial',
      'overdue'
    )

    AND i.due_date <=
      v_cutoff;


  CREATE TEMP TABLE
    reminder_targets
  ON COMMIT DROP
  AS

  WITH outstanding AS (
    SELECT
      i.id,

      i.house_id,

      i.resident_id,

      GREATEST(
        0::numeric,

        i.amount::numeric -
        COALESCE(
          i.amount_paid,
          0
        )::numeric
      ) AS balance

    FROM public.invoices i

    WHERE
      i.status IN (
        'unpaid',
        'partial',
        'overdue'
      )

      AND i.due_date <=
        v_cutoff
  ),

  personal AS (
    SELECT
      resident_id,

      SUM(
        balance
      )::numeric
        AS amount,

      count(*)::integer
        AS bill_count

    FROM outstanding

    WHERE
      resident_id IS NOT NULL

      AND balance > 0

    GROUP BY
      resident_id
  ),

  household AS (
    SELECT
      o.house_id,

      h.address,

      COALESCE(
        h.billing_responsible_resident_id,

        (
          SELECT
            owner.id

          FROM public.residents owner

          WHERE
            owner.house_id =
              o.house_id

            AND owner.is_active

            AND owner.relationship =
              'owner'

          ORDER BY
            owner.id

          LIMIT 1
        )
      ) AS payer_id,

      SUM(
        o.balance
      )::numeric
        AS amount,

      count(*)::integer
        AS bill_count

    FROM outstanding o

    JOIN public.houses h
      ON h.id =
        o.house_id

    WHERE
      o.house_id IS NOT NULL

      AND o.resident_id IS NULL

      AND o.balance > 0

    GROUP BY
      o.house_id,
      h.address,
      h.billing_responsible_resident_id
  ),

  combined AS (
    SELECT
      r.id
        AS resident_id,

      r.full_name,

      r.email,

      r.phone,

      r.house_id,

      COALESCE(
        p.amount,
        0
      )::numeric
        AS personal_amount,

      COALESCE(
        p.bill_count,
        0
      )::integer
        AS personal_count,

      COALESCE(
        h.amount,
        0
      )::numeric
        AS household_amount,

      COALESCE(
        h.bill_count,
        0
      )::integer
        AS household_count,

      h.address
        AS household_address

    FROM public.residents r

    LEFT JOIN personal p
      ON p.resident_id =
        r.id

    LEFT JOIN household h
      ON h.payer_id =
        r.id

    WHERE
      r.is_active
  )

  SELECT
    resident_id,

    full_name,

    NULLIF(
      lower(
        btrim(
          COALESCE(
            email,
            ''
          )
        )
      ),
      ''
    ) AS email,

    NULLIF(
      btrim(
        COALESCE(
          phone,
          ''
        )
      ),
      ''
    ) AS phone,

    personal_amount,

    personal_count,

    household_amount,

    household_count,

    household_address,

    (
      personal_amount +
      household_amount
    )::numeric
      AS total_amount,

    (
      personal_count +
      household_count
    )::integer
      AS total_count,

    concat_ws(
      ' and ',

      CASE
        WHEN personal_amount > 0
        THEN
          'NGN ' ||
          to_char(
            personal_amount,
            'FM999G999G999G990D00'
          ) ||
          ' across ' ||
          personal_count ||
          ' personal bill' ||
          CASE
            WHEN personal_count = 1
              THEN ''
            ELSE 's'
          END
      END,

      CASE
        WHEN household_amount > 0
        THEN
          'NGN ' ||
          to_char(
            household_amount,
            'FM999G999G999G990D00'
          ) ||
          ' across ' ||
          household_count ||
          ' household bill' ||
          CASE
            WHEN household_count = 1
              THEN ''
            ELSE 's'
          END ||
          ' for ' ||
          COALESCE(
            household_address,
            'your home'
          )
      END
    ) AS summary

  FROM combined

  WHERE
    (
      personal_amount +
      household_amount
    ) > 0

    AND (
      personal_count +
      household_count
    ) > 0;


  SELECT
    count(*)::integer

  INTO
    v_residents_eligible

  FROM reminder_targets;


  SELECT
    count(*)::integer

  INTO
    v_skipped_no_email

  FROM reminder_targets

  WHERE
    email IS NULL;


  SELECT
    count(*)::integer

  INTO
    v_skipped_no_phone

  FROM reminder_targets

  WHERE
    phone IS NULL;


  WITH inserted AS (
    INSERT INTO
      public.notification_outbox (
        event_key,
        kind,
        channel,
        recipient,
        subject,
        body
      )

    SELECT
      'billing:' ||
        v_today::text ||
        ':' ||
        resident_id::text,

      'billing',

      'email',

      email,

      'Your estate dues reminder',

      'Zadant: ' ||
        summary ||
        ' outstanding. Please sign in to your resident portal to view and pay. If recently paid, check your updated balance.'

    FROM reminder_targets

    WHERE
      email IS NOT NULL

    ON CONFLICT (
      channel,
      event_key
    )
    DO NOTHING

    RETURNING id
  )

  SELECT
    count(*)::integer

  INTO
    v_emails_queued

  FROM inserted;


  WITH inserted AS (
    INSERT INTO
      public.notification_outbox (
        event_key,
        kind,
        channel,
        recipient,
        body
      )

    SELECT
      'billing:' ||
        v_today::text ||
        ':' ||
        resident_id::text,

      'billing',

      'sms',

      phone,

      'Zadant: ' ||
        summary ||
        ' outstanding. Please sign in to your resident portal to view and pay. If recently paid, check your updated balance.'

    FROM reminder_targets

    WHERE
      phone IS NOT NULL

    ON CONFLICT (
      channel,
      event_key
    )
    DO NOTHING

    RETURNING id
  )

  SELECT
    count(*)::integer

  INTO
    v_sms_queued

  FROM inserted;


  RETURN jsonb_build_object(
    'date',
      v_today,

    'cutoff',
      v_cutoff,

    'invoices_checked',
      v_invoices_checked,

    'residents_eligible',
      v_residents_eligible,

    'emails_queued',
      v_emails_queued,

    'sms_queued',
      v_sms_queued,

    'skipped_no_email',
      v_skipped_no_email,

    'skipped_no_phone',
      v_skipped_no_phone
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.queue_due_reminders(
  integer
)
FROM
  PUBLIC,
  anon,
  authenticated;

GRANT EXECUTE
ON FUNCTION public.queue_due_reminders(
  integer
)
TO service_role;


-- ============================================================
-- CLAIM NOTIFICATION JOBS
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_notification_outbox(
  p_kind text DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS SETOF
  public.notification_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF
    p_limit < 1
    OR p_limit > 50
  THEN
    RAISE EXCEPTION
      'Claim size must be between 1 and 50';
  END IF;

  -- SMS has no provider-side idempotency key.
  -- A worker crash after transmission creates uncertainty;
  -- never automatically resend such a job.
  UPDATE public.notification_outbox

  SET
    status =
      'unknown',

    last_error =
      COALESCE(
        last_error,
        'SMS worker stopped after the job was claimed; provider outcome is unknown.'
      ),

    updated_at =
      now()

  WHERE
    channel =
      'sms'

    AND status =
      'sending'

    AND available_at <=
      now();


  -- Email can safely be retried within our Resend
  -- idempotency window because every job uses a stable key.
  UPDATE public.notification_outbox

  SET
    status =
      'failed',

    last_error =
      COALESCE(
        last_error,
        'Maximum delivery attempts exceeded.'
      ),

    updated_at =
      now()

  WHERE
    channel =
      'email'

    AND status IN (
      'pending',
      'sending'
    )

    AND (
      attempts >= 5

      OR (
        first_attempt_at IS NOT NULL

        AND first_attempt_at <
          now() -
          interval '23 hours'
      )
    );


  RETURN QUERY

  WITH candidates AS (
    SELECT
      n.id

    FROM public.notification_outbox n

    WHERE
      n.available_at <=
        now()

      AND (
        n.status =
          'pending'

        OR (
          n.channel =
            'email'

          AND n.status =
            'sending'
        )
      )

      AND (
        p_kind IS NULL
        OR n.kind =
          p_kind
      )

    ORDER BY
      n.available_at,
      n.created_at,
      n.id

    LIMIT
      p_limit

    FOR UPDATE
      SKIP LOCKED
  )

  UPDATE public.notification_outbox n

  SET
    status =
      'sending',

    attempts =
      n.attempts + 1,

    first_attempt_at =
      COALESCE(
        n.first_attempt_at,
        now()
      ),

    available_at =
      now() +
      interval '2 minutes',

    updated_at =
      now()

  FROM candidates c

  WHERE
    n.id =
      c.id

  RETURNING
    n.*;
END;
$$;

REVOKE ALL
ON FUNCTION public.claim_notification_outbox(
  text,
  integer
)
FROM
  PUBLIC,
  anon,
  authenticated;

GRANT EXECUTE
ON FUNCTION public.claim_notification_outbox(
  text,
  integer
)
TO service_role;

COMMIT;