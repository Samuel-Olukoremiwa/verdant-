BEGIN;

CREATE OR REPLACE FUNCTION public.admin_residents_page(
  p_query text DEFAULT NULL,
  p_street uuid DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_dues text DEFAULT 'all',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_query text :=
    lower(
      btrim(
        coalesce(
          p_query,
          ''
        )
      )
    );

  v_result jsonb;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION
      'Only estate administrators can view the resident directory'
      USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN (
    'all',
    'active',
    'inactive'
  ) THEN
    RAISE EXCEPTION
      'Invalid resident status filter';
  END IF;

  IF p_dues NOT IN (
    'all',
    'yes',
    'no'
  ) THEN
    RAISE EXCEPTION
      'Invalid dues filter';
  END IF;

  IF
    p_limit < 1
    OR p_limit > 100
  THEN
    RAISE EXCEPTION
      'Page size must be between 1 and 100';
  END IF;

  IF p_offset < 0 THEN
    RAISE EXCEPTION
      'Offset cannot be negative';
  END IF;

  WITH personal_balances AS (
    SELECT
      i.resident_id,

      SUM(
        GREATEST(
          0::numeric,
          i.amount::numeric -
          COALESCE(
            i.amount_paid,
            0
          )::numeric
        )
      ) AS outstanding

    FROM public.invoices i

    WHERE
      i.resident_id IS NOT NULL

    GROUP BY
      i.resident_id
  ),

  household_balances AS (
    SELECT
      i.house_id,

      SUM(
        GREATEST(
          0::numeric,
          i.amount::numeric -
          COALESCE(
            i.amount_paid,
            0
          )::numeric
        )
      ) AS outstanding

    FROM public.invoices i

    WHERE
      i.house_id IS NOT NULL

    GROUP BY
      i.house_id
  ),

  resident_base AS (
    SELECT
      r.id,

      r.resident_code,

      r.house_id,

      r.full_name,

      r.phone,

      r.relationship,

      r.is_active,

      h.address,

      h.house_type,

      h.street_id,

      s.name AS street_name,

      COALESCE(
        pb.outstanding,
        0
      )::numeric AS personal_outstanding,

      billing.contact_id AS billing_contact_id,

      billing_contact.full_name
        AS billing_contact_name,

      (
        billing.contact_id IS NOT NULL
        AND
        billing.contact_id = r.id
      ) AS manages_household_billing,

      CASE
        WHEN
          billing.contact_id IS NOT NULL
          AND
          billing.contact_id = r.id
        THEN
          COALESCE(
            hb.outstanding,
            0
          )::numeric

        ELSE
          0::numeric
      END AS household_outstanding

    FROM public.residents r

    LEFT JOIN public.houses h
      ON h.id = r.house_id

    LEFT JOIN public.streets s
      ON s.id = h.street_id

    LEFT JOIN personal_balances pb
      ON pb.resident_id = r.id

    LEFT JOIN household_balances hb
      ON hb.house_id = r.house_id

    LEFT JOIN LATERAL (
      SELECT
        COALESCE(
          h.billing_responsible_resident_id,

          (
            SELECT owner.id

            FROM public.residents owner

            WHERE
              owner.house_id = r.house_id

              AND owner.is_active

              AND owner.relationship =
                'owner'

            ORDER BY
              owner.id

            LIMIT 1
          )
        ) AS contact_id
    ) billing
      ON true

    LEFT JOIN public.residents billing_contact
      ON billing_contact.id =
        billing.contact_id
  ),

  filtered AS (
    SELECT
      resident_base.*,

      (
        personal_outstanding
        +
        household_outstanding
      ) AS managed_outstanding

    FROM resident_base

    WHERE
      (
        p_status = 'all'

        OR (
          p_status = 'active'
          AND is_active
        )

        OR (
          p_status = 'inactive'
          AND NOT is_active
        )
      )

      AND (
        p_street IS NULL
        OR street_id = p_street
      )

      AND (
        v_query = ''

        OR lower(
          coalesce(
            resident_code,
            ''
          )
        ) LIKE
          '%' || v_query || '%'

        OR lower(
          coalesce(
            full_name,
            ''
          )
        ) LIKE
          '%' || v_query || '%'

        OR lower(
          coalesce(
            phone,
            ''
          )
        ) LIKE
          '%' || v_query || '%'

        OR lower(
          coalesce(
            address,
            ''
          )
        ) LIKE
          '%' || v_query || '%'
      )
  ),

  dues_filtered AS (
    SELECT *
    FROM filtered

    WHERE
      p_dues = 'all'

      OR (
        p_dues = 'yes'
        AND managed_outstanding > 0
      )

      OR (
        p_dues = 'no'
        AND managed_outstanding <= 0
      )
  ),

  page_rows AS (
    SELECT *
    FROM dues_filtered

    ORDER BY
      lower(full_name),
      id

    LIMIT p_limit

    OFFSET p_offset
  )

  SELECT
    jsonb_build_object(
      'total',
      (
        SELECT count(*)
        FROM dues_filtered
      ),

      'rows',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id',
                page_rows.id,

              'resident_code',
                page_rows.resident_code,

              'full_name',
                page_rows.full_name,

              'phone',
                page_rows.phone,

              'relationship',
                page_rows.relationship,

              'is_active',
                page_rows.is_active,

              'address',
                page_rows.address,

              'house_type',
                page_rows.house_type,

              'street_id',
                page_rows.street_id,

              'street_name',
                page_rows.street_name,

              'personal_outstanding',
                page_rows.personal_outstanding,

              'household_outstanding',
                page_rows.household_outstanding,

              'manages_household_billing',
                page_rows.manages_household_billing,

              'billing_contact_name',
                page_rows.billing_contact_name
            )

            ORDER BY
              lower(
                page_rows.full_name
              ),
              page_rows.id
          )

          FROM page_rows
        ),

        '[]'::jsonb
      )
    )

  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL
ON FUNCTION public.admin_residents_page(
  text,
  uuid,
  text,
  text,
  integer,
  integer
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.admin_residents_page(
  text,
  uuid,
  text,
  text,
  integer,
  integer
)
TO authenticated, service_role;

COMMIT;