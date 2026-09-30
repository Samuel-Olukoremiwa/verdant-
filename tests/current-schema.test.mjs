import fs from 'node:fs'
import path from 'node:path'

import {
  fileURLToPath,
} from 'node:url'

import {
  createRequire,
} from 'node:module'

import assert from 'node:assert/strict'

import {
  test,
} from 'node:test'

const require =
  createRequire(
    import.meta.url
  )

const {
  PGlite,
} =
  require(
    process.env.PGLITE_TEST_MODULE ||
      '@electric-sql/pglite'
  )

const root =
  path.resolve(
    path.dirname(
      fileURLToPath(
        import.meta.url
      )
    ),
    '..'
  )

const sqlFiles = [
  'schema.sql',

  'auth.sql',

  'migration_phase1_6_repairs.sql',

  'migration_registration_requests_base.sql',

  'migration_phase7_12.sql',

  'migration_design_security.sql',

  'migration_gate_dues_dates.sql',

  'migration_address_billing_integrity.sql',

  'migration_registration_visitor_upgrade.sql',

  'migration_hybrid_house_resident_billing.sql',

  'migration_single_house_billing.sql',

  'migration_billing_ranges_and_resident_due_dates.sql',

  'migration_registration_decline_reason_required.sql',

  'migration_phase13_sms.sql',

  'migration_production_alignment.sql',

  'migration_production_foundation_indexes_and_function_hardening.sql',

  'migration_consolidate_rls_policies.sql',

  'migration_dashboard_aggregation.sql',

  'migration_residents_directory_pagination.sql',

  'migration_human_readable_ids.sql',

  'migration_invoices_directory_pagination.sql',

  'migration_reports_pagination.sql',

  'migration_notification_outbox.sql',

  'migration_gate_email_outbox_bridge.sql',

  'migration_gate_email_outbox_cutover.sql',
]

function sql(
  name
) {
  return fs.readFileSync(
    path.join(
      root,
      'supabase',
      name
    ),
    'utf8'
  )
}

async function first(
  db,
  query,
  args = []
) {
  const result =
    await db.query(
      query,
      args
    )

  return result.rows[0]
}

async function createDatabase() {
  const db =
    new PGlite()

  await db.exec(`
    CREATE ROLE anon;

    CREATE ROLE authenticated;

    CREATE ROLE service_role
      BYPASSRLS;

    CREATE SCHEMA auth;

    CREATE TABLE auth.users (
      id uuid PRIMARY KEY,
      email text
    );

    CREATE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $$
      SELECT
        nullif(
          current_setting(
            'request.jwt.claim.sub',
            true
          ),
          ''
        )::uuid
    $$;

    GRANT USAGE
    ON SCHEMA auth, public
    TO
      anon,
      authenticated,
      service_role;
  `)

  for (
    const file
    of sqlFiles
  ) {
    await db.exec(
      sql(
        file
      )
    )
  }

  return db
}

test(
  'a clean database builds the complete current Zadant schema',
  async () => {
    const db =
      await createDatabase()

    try {
      const requiredTables = [
        'access_logs',
        'admins',
        'due_types',
        'expenses',
        'gate_due_alerts',
        'gate_due_emails',
        'houses',
        'invoices',
        'payments',
        'registration_rate_limits',
        'registration_requests',
        'residents',
        'sms_dispatches',
        'streets',
        'visitor_passes',
      ]

      const tableResult =
        await db.query(`
          SELECT table_name

          FROM information_schema.tables

          WHERE table_schema =
            'public'

          ORDER BY table_name
        `)

      const tables =
        new Set(
          tableResult.rows.map(
            (
              row
            ) =>
              row.table_name
          )
        )

      for (
        const table
        of requiredTables
      ) {
        assert.ok(
          tables.has(
            table
          ),
          `Missing table: ${table}`
        )
      }

      const requiredColumns = [
        [
          'residents',
          'resident_code',
        ],

        [
          'residents',
          'property_allocation_date',
        ],

        [
          'residents',
          'block_number',
        ],

        [
          'residents',
          'flat_number',
        ],

        [
          'payments',
          'payment_code',
        ],

        [
          'invoices',
          'resident_id',
        ],

        [
          'invoices',
          'period_start',
        ],

        [
          'invoices',
          'period_end',
        ],

        [
          'due_types',
          'billing_scope',
        ],

        [
          'registration_requests',
          'consent_version',
        ],

        [
          'registration_requests',
          'move_in_date',
        ],

        [
          'registration_requests',
          'property_allocation_date',
        ],

        [
          'registration_requests',
          'vehicle_plate_numbers',
        ],

        [
          'registration_requests',
          'emergency_contact_name',
        ],

        [
          'registration_requests',
          'emergency_contact_phone',
        ],
      ]

      for (
        const [
          table,
          column,
        ]
        of requiredColumns
      ) {
        const row =
          await first(
            db,
            `
              SELECT count(*)::int AS n

              FROM information_schema.columns

              WHERE table_schema =
                'public'

                AND table_name =
                  $1

                AND column_name =
                  $2
            `,
            [
              table,
              column,
            ]
          )

        assert.equal(
          row.n,
          1,
          `Missing ${table}.${column}`
        )
      }
    } finally {
      await db.close()
    }
  }
)

test(
  'current financial and billing constraints exist on a clean database',
  async () => {
    const db =
      await createDatabase()

    try {
      const required = [
        'hybrid_invoice_exactly_one_target',

        'hybrid_invoice_period_dates',

        'due_types_billing_scope_check',

        'payments_reference_invoice_unique',

        'registration_phone_format',

        'registration_email_format',

        'registration_block_number_check',

        'registration_flat_number_check',

        'registration_decline_reason_required',

        'residents_resident_code_format',

        'payments_payment_code_format',
      ]

      const result =
        await db.query(`
          SELECT conname

          FROM pg_constraint

          WHERE connamespace =
            'public'::regnamespace
        `)

      const constraints =
        new Set(
          result.rows.map(
            (
              row
            ) =>
              row.conname
          )
        )

      for (
        const name
        of required
      ) {
        assert.ok(
          constraints.has(
            name
          ),
          `Missing constraint: ${name}`
        )
      }
    } finally {
      await db.close()
    }
  }
)

test(
  'only the current structured billing RPC signatures remain',
  async () => {
    const db =
      await createDatabase()

    try {
      const result =
        await db.query(`
          SELECT
            p.proname,

            pg_get_function_identity_arguments(
              p.oid
            ) AS args

          FROM pg_proc p

          JOIN pg_namespace n
            ON n.oid =
              p.pronamespace

          WHERE n.nspname =
            'public'

            AND p.proname IN (
              'generate_house_invoices',
              'generate_single_house_invoice',
              'preview_resident_invoices',
              'generate_resident_invoices'
            )

          ORDER BY
            p.proname,
            args
        `)

      const functions =
        result.rows.map(
          (
            row
          ) => ({
            name:
              row.proname,

            args:
              row.args,
          })
        )

      assert.ok(
        functions.some(
          (
            fn
          ) =>
            fn.name ===
              'generate_house_invoices' &&
            fn.args.includes(
              'p_period_start date'
            ) &&
            fn.args.includes(
              'p_period_end date'
            )
        )
      )

      assert.ok(
        functions.some(
          (
            fn
          ) =>
            fn.name ===
              'generate_single_house_invoice' &&
            fn.args.includes(
              'p_period_start date'
            ) &&
            fn.args.includes(
              'p_period_end date'
            ) &&
            fn.args.includes(
              'p_due_date date'
            )
        )
      )

      assert.ok(
        functions.some(
          (
            fn
          ) =>
            fn.name ===
              'preview_resident_invoices' &&
            fn.args.includes(
              'p_start date'
            ) &&
            fn.args.includes(
              'p_end date'
            ) &&
            fn.args.includes(
              'p_due_date date'
            )
        )
      )

      assert.ok(
        functions.some(
          (
            fn
          ) =>
            fn.name ===
              'generate_resident_invoices' &&
            fn.args.includes(
              'p_start date'
            ) &&
            fn.args.includes(
              'p_end date'
            ) &&
            fn.args.includes(
              'p_due_date date'
            )
        )
      )

      assert.equal(
        functions.some(
          (
            fn
          ) =>
            fn.name ===
              'generate_single_house_invoice' &&
            fn.args.includes(
              'p_period_label text'
            )
        ),
        false,
        'Legacy text-period billing RPC still exists'
      )
    } finally {
      await db.close()
    }
  }
)

test(
  'human-readable resident and payment IDs work on a clean database',
  async () => {
    const db =
      await createDatabase()

    try {
      const street =
        await first(
          db,
          `
            INSERT INTO public.streets (
              name
            )

            VALUES (
              'Sample Street'
            )

            RETURNING id
          `
        )

      const house =
        await first(
          db,
          `
            INSERT INTO public.houses (
              address,
              street_id,
              house_number
            )

            VALUES (
              'House 1, Sample Street',
              $1,
              '1'
            )

            RETURNING id
          `,
          [
            street.id,
          ]
        )

      const resident =
        await first(
          db,
          `
            INSERT INTO public.residents (
              house_id,
              full_name,
              phone,
              email,
              relationship,
              move_in_date,
              property_allocation_date
            )

            VALUES (
              $1,
              'Sample Resident',
              '08012345678',
              'resident@example.test',
              'owner',
              '2026-09-01',
              '2026-08-01'
            )

            RETURNING
              id,
              resident_code
          `,
          [
            house.id,
          ]
        )

      assert.match(
        resident.resident_code,
        /^RES-[0-9]{6,}$/
      )

      const due =
        await first(
          db,
          `
            SELECT id

            FROM public.due_types

            WHERE name =
              'Service Charge'

            LIMIT 1
          `
        )

      const invoice =
        await first(
          db,
          `
            INSERT INTO public.invoices (
              house_id,
              due_type_id,
              period_label,
              period_start,
              period_end,
              amount,
              amount_paid,
              status,
              due_date
            )

            VALUES (
              $1,
              $2,
              'September 2026',
              '2026-09-01',
              '2026-09-30',
              5000,
              0,
              'unpaid',
              '2026-09-30'
            )

            RETURNING id
          `,
          [
            house.id,
            due.id,
          ]
        )

      const payment =
        await first(
          db,
          `
            INSERT INTO public.payments (
              invoice_id,
              resident_id,
              amount,
              paystack_reference,
              status
            )

            VALUES (
              $1,
              $2,
              1000,
              'TEST-CURRENT-SCHEMA-001',
              'pending'
            )

            RETURNING
              id,
              payment_code
          `,
          [
            invoice.id,
            resident.id,
          ]
        )

      assert.match(
        payment.payment_code,
        /^PAY-[0-9]{6}-[0-9]{6,}$/
      )
    } finally {
      await db.close()
    }
  }
)

test(
  'registration remains server-only while administrators retain management access',
  async () => {
    const db =
      await createDatabase()

    try {
      const policies =
        await db.query(`
          SELECT
            policyname,
            cmd

          FROM pg_policies

          WHERE schemaname =
            'public'

            AND tablename =
              'registration_requests'

          ORDER BY
            policyname
        `)

      const names =
        new Set(
          policies.rows.map(
            (
              row
            ) =>
              row.policyname
          )
        )

      assert.ok(
        names.has(
          'registration requests admin select'
        )
      )

      assert.ok(
        names.has(
          'registration requests admin update'
        )
      )

      assert.ok(
        names.has(
          'registration requests admin delete'
        )
      )

      assert.equal(
        names.has(
          'anyone can submit a registration request'
        ),
        false
      )

      await db.exec(
        'SET ROLE anon'
      )

      await assert.rejects(
        db.query(`
          INSERT INTO public.registration_requests (
            surname,
            first_name,
            phone,
            email,
            house_number,
            move_in_date,
            property_allocation_date
          )

          VALUES (
            'Example',
            'Resident',
            '08012345678',
            'public@example.test',
            '1',
            '2026-09-01',
            '2026-08-01'
          )
        `),
        /permission denied/
      )

      await db.exec(
        'RESET ROLE'
      )

      await db.exec(
        'SET ROLE authenticated'
      )

      await assert.rejects(
        db.query(`
          INSERT INTO public.registration_requests (
            surname,
            first_name,
            phone,
            email,
            house_number,
            move_in_date,
            property_allocation_date
          )

          VALUES (
            'Example',
            'Resident',
            '08012345678',
            'signedin@example.test',
            '1',
            '2026-09-01',
            '2026-08-01'
          )
        `),
        /permission denied/
      )

      await db.exec(
        'RESET ROLE'
      )
    } finally {
      await db.close()
    }
  }
)