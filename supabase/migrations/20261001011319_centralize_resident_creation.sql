BEGIN;

-- ============================================================
-- CENTRALIZE RESIDENT CREATION
--
-- Resident creation previously existed in two places:
--
--   1. add_estate_resident(...)
--   2. registration approval application code
--
-- Both paths now delegate the actual resident validation and
-- insert to create_estate_resident_record(...).
--
-- The house workflows remain intentionally different:
--
--   * Manual admin creation refuses to silently reuse a house.
--   * Registration approval resolves/reuses the canonical house.
--
-- provision_registration_resident(...) keeps registration
-- house resolution + resident creation in one DB transaction.
-- ============================================================


-- ============================================================
-- INTERNAL RESIDENT CREATION
--
-- This function is intentionally NOT available to normal
-- authenticated users. It is called:
--
--   * internally by add_estate_resident(), whose own admin
--     authorization remains intact, and
--   * directly by service-role registration provisioning.
-- ============================================================

CREATE OR REPLACE FUNCTION
  public.create_estate_resident_record(
    p_house_id uuid,
    p_resident jsonb
  )
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  resident_uuid uuid;

  resident_name text;
  resident_phone text;
  resident_email text;
  resident_relationship text;

  resident_block text;
  resident_flat text;

  emergency_name text;
  emergency_phone text;

  move_date date;
  allocation_date date;

  existing_owner_id uuid;
  existing_owner_name text;

  violation_name text;
BEGIN
  IF
    p_resident IS NULL
    OR jsonb_typeof(
      p_resident
    ) <> 'object'
  THEN
    RAISE EXCEPTION
      'Enter valid resident details';
  END IF;

  IF
    p_house_id IS NULL
    OR NOT EXISTS (
      SELECT
        1

      FROM public.houses h

      WHERE h.id =
        p_house_id
    )
  THEN
    RAISE EXCEPTION
      'Household not found';
  END IF;

  resident_name :=
    btrim(
      coalesce(
        p_resident->>'full_name',
        ''
      )
    );

  resident_phone :=
    btrim(
      coalesce(
        p_resident->>'phone',
        ''
      )
    );

  resident_email :=
    lower(
      btrim(
        coalesce(
          p_resident->>'email',
          ''
        )
      )
    );

  resident_relationship :=
    nullif(
      btrim(
        coalesce(
          p_resident->>'relationship',
          ''
        )
      ),
      ''
    );

  resident_block :=
    nullif(
      btrim(
        coalesce(
          p_resident->>'block_number',
          ''
        )
      ),
      ''
    );

  resident_flat :=
    nullif(
      btrim(
        coalesce(
          p_resident->>'flat_number',
          ''
        )
      ),
      ''
    );

  emergency_name :=
    nullif(
      btrim(
        coalesce(
          p_resident->>'emergency_contact_name',
          ''
        )
      ),
      ''
    );

  emergency_phone :=
    nullif(
      btrim(
        coalesce(
          p_resident->>'emergency_contact_phone',
          ''
        )
      ),
      ''
    );

  move_date :=
    nullif(
      btrim(
        coalesce(
          p_resident->>'move_in_date',
          ''
        )
      ),
      ''
    )::date;

  allocation_date :=
    nullif(
      btrim(
        coalesce(
          p_resident->>'property_allocation_date',
          ''
        )
      ),
      ''
    )::date;

  IF
    resident_name =
    ''
  THEN
    RAISE EXCEPTION
      'Enter the resident name';
  END IF;

  IF
    length(
      resident_phone
    ) < 11
    OR resident_phone !~
      '^\+?[0-9]{10,15}$'
  THEN
    RAISE EXCEPTION
      'Phone number must contain only numbers and an optional leading +, with at least 11 characters';
  END IF;

  IF
    resident_email !~
      '^[^ @]+@[^ @]+\.[^ @]+$'
  THEN
    RAISE EXCEPTION
      'Enter a valid email address';
  END IF;

  IF
    resident_relationship IS NULL
    OR resident_relationship NOT IN (
      'owner',
      'tenant',
      'family_member'
    )
  THEN
    RAISE EXCEPTION
      'Select a resident status';
  END IF;

  IF
    resident_block IS NOT NULL
    AND resident_block !~
      '^(10|[1-9])$'
  THEN
    RAISE EXCEPTION
      'Block number must be between 1 and 10';
  END IF;

  IF
    resident_flat IS NOT NULL
    AND resident_flat !~
      '^(10|[1-9])$'
  THEN
    RAISE EXCEPTION
      'Flat number must be between 1 and 10';
  END IF;

  IF
    emergency_phone IS NOT NULL
    AND (
      length(
        emergency_phone
      ) < 11
      OR emergency_phone !~
        '^\+?[0-9]{10,15}$'
    )
  THEN
    RAISE EXCEPTION
      'Enter a valid emergency contact phone number';
  END IF;

  IF
    move_date IS NULL
    OR allocation_date IS NULL
  THEN
    RAISE EXCEPTION
      'Move-in date and property allocation date are required';
  END IF;

  IF
    p_resident ?
      'vehicle_plate_numbers'
    AND
      p_resident
        ->'vehicle_plate_numbers'
        IS DISTINCT FROM
        'null'::jsonb
    AND jsonb_typeof(
      p_resident
        ->'vehicle_plate_numbers'
    ) <> 'array'
  THEN
    RAISE EXCEPTION
      'Vehicle plate numbers must be an array';
  END IF;

  /*
   * These checks provide friendly messages.
   *
   * The existing unique indexes remain the authoritative
   * concurrency protection if two requests race.
   */
  IF EXISTS (
    SELECT
      1

    FROM public.residents r

    WHERE
      r.is_active

      AND lower(
        btrim(
          r.email
        )
      ) =
        resident_email
  )
  THEN
    RAISE EXCEPTION
      'An active resident already uses this email address';
  END IF;

  IF
    resident_relationship =
      'owner'
  THEN
    SELECT
      r.id,
      r.full_name

    INTO
      existing_owner_id,
      existing_owner_name

    FROM public.residents r

    WHERE
      r.house_id =
        p_house_id

      AND r.is_active

      AND r.relationship =
        'owner'

    LIMIT 1;

    IF
      existing_owner_id
      IS NOT NULL
    THEN
      RAISE EXCEPTION
        'This household already has an active Home Owner: %',
        existing_owner_name;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.residents (
      house_id,
      full_name,
      phone,
      email,
      relationship,
      block_number,
      flat_number,
      vehicle_plate_numbers,
      emergency_contact_name,
      emergency_contact_phone,
      move_in_date,
      property_allocation_date,
      qr_code_value
    )

    VALUES (
      p_house_id,
      resident_name,
      resident_phone,
      resident_email,
      resident_relationship,
      resident_block,
      resident_flat,

      ARRAY(
        SELECT
          btrim(
            plate.value
          )

        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(
              p_resident
                ->'vehicle_plate_numbers'
            ) =
              'array'
            THEN
              p_resident
                ->'vehicle_plate_numbers'

            ELSE
              '[]'::jsonb
          END
        ) AS plate(
          value
        )

        WHERE
          btrim(
            plate.value
          ) <>
            ''
      ),

      emergency_name,
      emergency_phone,
      move_date,
      allocation_date,

      'RES-' ||
      gen_random_uuid()::text
    )

    RETURNING id
    INTO resident_uuid;

  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS
        violation_name =
          CONSTRAINT_NAME;

      IF
        violation_name =
        'address_integrity_active_resident_email'
      THEN
        RAISE EXCEPTION
          'An active resident already uses this email address';
      END IF;

      IF
        violation_name =
        'address_integrity_one_active_owner'
      THEN
        RAISE EXCEPTION
          'This household already has an active Home Owner';
      END IF;

      RAISE;
  END;

  RETURN
    resident_uuid;
END;
$function$;


REVOKE ALL
ON FUNCTION
  public.create_estate_resident_record(
    uuid,
    jsonb
  )
FROM
  PUBLIC,
  anon,
  authenticated;

GRANT EXECUTE
ON FUNCTION
  public.create_estate_resident_record(
    uuid,
    jsonb
  )
TO
  service_role;


-- ============================================================
-- MANUAL ADMIN RESIDENT CREATION
--
-- Keep the existing public RPC signature.
--
-- Only the house-specific workflow stays here. Resident
-- validation and insertion now come from the shared helper.
-- ============================================================

CREATE OR REPLACE FUNCTION
  public.add_estate_resident(
    p_house_id uuid,
    p_house jsonb,
    p_resident jsonb
  )
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  house_uuid uuid :=
    p_house_id;

  street_uuid uuid;

  number_integer integer;

  number_text text;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION
      'Not authorized';
  END IF;

  IF
    house_uuid IS NULL
  THEN
    street_uuid :=
      nullif(
        btrim(
          coalesce(
            p_house->>'street_id',
            ''
          )
        ),
        ''
      )::uuid;

    IF
      street_uuid IS NULL
    THEN
      RAISE EXCEPTION
        'Select a street';
    END IF;

    IF
      coalesce(
        btrim(
          p_house->>'house_number'
        ),
        ''
      ) !~
        '^[0-9]+$'
    THEN
      RAISE EXCEPTION
        'Select a valid house number';
    END IF;

    number_integer :=
      btrim(
        p_house->>'house_number'
      )::integer;

    IF
      number_integer < 1
      OR number_integer > 50
    THEN
      RAISE EXCEPTION
        'House number must be between 1 and 50';
    END IF;

    number_text :=
      number_integer::text;

    IF NOT EXISTS (
      SELECT
        1

      FROM public.streets s

      WHERE s.id =
        street_uuid
    )
    THEN
      RAISE EXCEPTION
        'Street not found';
    END IF;

    PERFORM
      pg_advisory_xact_lock(
        hashtextextended(
          street_uuid::text ||
          ':' ||
          number_text,
          0
        )
      );

    IF EXISTS (
      SELECT
        1

      FROM public.houses h

      WHERE
        h.street_id =
          street_uuid

        AND public.canonical_house_number(
          h.house_number
        ) =
          number_text
    )
    THEN
      RAISE EXCEPTION
        'This house already exists. Select it from the Household dropdown.';
    END IF;

    INSERT INTO public.houses (
      address,
      house_type,
      street_id,
      house_number
    )

    VALUES (
      number_text,

      nullif(
        btrim(
          coalesce(
            p_house->>'house_type',
            ''
          )
        ),
        ''
      ),

      street_uuid,
      number_text
    )

    RETURNING id
    INTO house_uuid;
  END IF;

  RETURN
    public.create_estate_resident_record(
      house_uuid,
      p_resident
    );
END;
$function$;


-- Existing permissions for the public admin RPC are preserved
-- by CREATE OR REPLACE, but make the intended access explicit.

REVOKE EXECUTE
ON FUNCTION
  public.add_estate_resident(
    uuid,
    jsonb,
    jsonb
  )
FROM
  PUBLIC,
  anon;

GRANT EXECUTE
ON FUNCTION
  public.add_estate_resident(
    uuid,
    jsonb,
    jsonb
  )
TO
  authenticated,
  service_role;


-- ============================================================
-- REGISTRATION PROVISIONING
--
-- Resolve/reuse the physical property and create the resident
-- in ONE database transaction.
--
-- If resident validation fails after a brand-new house was
-- resolved, the new house is rolled back automatically.
-- ============================================================

CREATE OR REPLACE FUNCTION
  public.provision_registration_resident(
    p_street_id uuid,
    p_house_number text,
    p_house_type text,
    p_resident jsonb
  )
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  house_uuid uuid;

  resident_uuid uuid;
BEGIN
  house_uuid :=
    public.resolve_registration_house(
      p_street_id,
      p_house_number,
      p_house_type
    );

  resident_uuid :=
    public.create_estate_resident_record(
      house_uuid,
      p_resident
    );

  RETURN
    jsonb_build_object(
      'house_id',
      house_uuid,

      'resident_id',
      resident_uuid
    );
END;
$function$;


REVOKE ALL
ON FUNCTION
  public.provision_registration_resident(
    uuid,
    text,
    text,
    jsonb
  )
FROM
  PUBLIC,
  anon,
  authenticated;

GRANT EXECUTE
ON FUNCTION
  public.provision_registration_resident(
    uuid,
    text,
    text,
    jsonb
  )
TO
  service_role;


COMMIT;