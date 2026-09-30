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

  'migration_registration_approval_claim.sql',

  'migration_registration_atomic_decline.sql',

  'migration_payment_transactions_foundation.sql',

  'migration_payment_transactions_resident_access.sql',

  'migration_collected_report_transaction_ids.sql',

  'migrations/20260930190015_due_type_capabilities.sql',

  'migrations/20260930192416_due_type_reporting_capabilities.sql',

  'migrations/20260930194502_payment_transactions_foundation_reconciliation.sql',

  'migrations/20260930200132_registration_approval_claimed_by_index.sql',

  'migrations/20260930203855_restrict_single_house_invoice_helper.sql',

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

  await db.exec(`
    GRANT SELECT
    ON public.residents
    TO authenticated;
  `)

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
        'payment_transactions',
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
          'payments',
          'transaction_id',
        ],

        [
          'payment_transactions',
          'reference',
        ],

        [
          'payment_transactions',
          'payment_code',
        ],

        [
          'payment_transactions',
          'resident_id',
        ],

        [
          'payment_transactions',
          'provider',
        ],

        [
          'payment_transactions',
          'amount',
        ],

        [
          'payment_transactions',
          'currency',
        ],

        [
          'payment_transactions',
          'status',
        ],

        [
          'payment_transactions',
          'paid_at',
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
          'due_types',
          'active',
        ],

        [
          'due_types',
          'auto_generate',
        ],

        [
          'due_types',
          'allow_advance_payment',
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

        [
          'registration_requests',
          'approval_claimed_by',
        ],

        [
          'registration_requests',
          'approval_claim_token',
        ],

        [
          'registration_requests',
          'approval_claimed_at',
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

      const declineFunction =
        await first(
          db,
          `
            SELECT count(*)::int AS n

            FROM pg_proc p

            JOIN pg_namespace n
              ON n.oid =
                p.pronamespace

            WHERE n.nspname =
              'public'

              AND p.proname =
                'decline_registration_request'
          `
        )

      assert.equal(
        declineFunction.n,
        1
      )
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

        'due_types_auto_generate_capability_check',

        'due_types_advance_payment_capability_check',

        'payments_reference_invoice_unique',

        'payments_transaction_id_fkey',

        'payments_transaction_invoice_unique',

        'payment_transactions_reference_not_blank',

        'payment_transactions_provider_check',

        'payment_transactions_amount_positive',

        'payment_transactions_currency_check',

        'payment_transactions_status_check',

        'payment_transactions_payment_code_unique',

        'payment_transactions_payment_code_format',

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
              payment_code,
              transaction_id
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

      assert.ok(
        payment.transaction_id
      )

      const transaction =
        await first(
          db,
          `
            SELECT
              payment_code

            FROM public.payment_transactions

            WHERE id =
              $1
          `,
          [
            payment.transaction_id,
          ]
        )

      assert.match(
        transaction.payment_code,
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

test(
  'registration decline respects active approval claims and clears stale claims',
  async () => {
    const db =
      await createDatabase()

    try {
      const admin =
        await first(
          db,
          `
            INSERT INTO public.admins (
              full_name,
              role
            )

            VALUES (
              'Registration Test Admin',
              'super_admin'
            )

            RETURNING id
          `
        )

      const registration =
        await first(
          db,
          `
            INSERT INTO public.registration_requests (
              surname,
              first_name,
              phone,
              email,
              house_number,
              relationship,
              move_in_date,
              property_allocation_date
            )

            VALUES (
              'Resident',
              'Concurrency',
              '08012345678',
              'concurrency@example.test',
              '500',
              'tenant',
              '2026-09-01',
              '2026-08-01'
            )

            RETURNING id
          `
        )

      const token =
        await first(
          db,
          `
            SELECT
              gen_random_uuid()
                AS id
          `
        )

      const claim =
        await first(
          db,
          `
            SELECT
              public.claim_registration_approval(
                $1,
                $2,
                $3
              ) AS result
          `,
          [
            registration.id,
            admin.id,
            token.id,
          ]
        )

      assert.equal(
        claim.result.claimed,
        true
      )

      const blockedDecline =
        await first(
          db,
          `
            SELECT
              public.decline_registration_request(
                $1,
                $2,
                $3
              ) AS result
          `,
          [
            registration.id,
            admin.id,
            'Testing active approval protection',
          ]
        )

      assert.equal(
        blockedDecline
          .result
          .declined,
        false
      )

      assert.equal(
        blockedDecline
          .result
          .reason,
        'approval_in_progress'
      )

      const stillPending =
        await first(
          db,
          `
            SELECT
              status,
              approval_claim_token

            FROM public.registration_requests

            WHERE id =
              $1
          `,
          [
            registration.id,
          ]
        )

      assert.equal(
        stillPending.status,
        'pending'
      )

      assert.equal(
        stillPending
          .approval_claim_token,
        token.id
      )

      await db.query(
        `
          UPDATE public.registration_requests

          SET approval_claimed_at =
            now() - interval '16 minutes'

          WHERE id =
            $1
        `,
        [
          registration.id,
        ]
      )

      const declined =
        await first(
          db,
          `
            SELECT
              public.decline_registration_request(
                $1,
                $2,
                $3
              ) AS result
          `,
          [
            registration.id,
            admin.id,
            'Applicant details could not be verified.',
          ]
        )

      assert.equal(
        declined
          .result
          .declined,
        true
      )

      const final =
        await first(
          db,
          `
            SELECT
              status,
              decline_reason,
              reviewed_by,
              reviewed_at,
              approval_claimed_by,
              approval_claim_token,
              approval_claimed_at

            FROM public.registration_requests

            WHERE id =
              $1
          `,
          [
            registration.id,
          ]
        )

      assert.equal(
        final.status,
        'declined'
      )

      assert.equal(
        final.decline_reason,
        'Applicant details could not be verified.'
      )

      assert.equal(
        final.reviewed_by,
        admin.id
      )

      assert.ok(
        final.reviewed_at
      )

      assert.equal(
        final.approval_claimed_by,
        null
      )

      assert.equal(
        final.approval_claim_token,
        null
      )

      assert.equal(
        final.approval_claimed_at,
        null
      )
    } finally {
      await db.close()
    }
  }
)

test(
  'payment transactions group multiple invoice allocations under one reference',
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
              'Transaction Test Street'
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
              'House 500',
              $1,
              '500'
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
              'Transaction Test Resident',
              '08012345678',
              'transaction-test@example.test',
              'owner',
              '2026-09-01',
              '2026-08-01'
            )

            RETURNING id
          `,
          [
            house.id,
          ]
        )

      const dueTypes =
        await db.query(`
          SELECT id

          FROM public.due_types

          ORDER BY id

          LIMIT 2
        `)

      assert.ok(
        dueTypes.rows.length >=
          2
      )

      const invoiceOne =
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
              'Transaction Test A',
              '2026-09-01',
              '2026-09-30',
              2000,
              0,
              'unpaid',
              '2026-09-30'
            )

            RETURNING id
          `,
          [
            house.id,
            dueTypes.rows[0].id,
          ]
        )

      const invoiceTwo =
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
              'Transaction Test B',
              '2026-09-01',
              '2026-09-30',
              3000,
              0,
              'unpaid',
              '2026-09-30'
            )

            RETURNING id
          `,
          [
            house.id,
            dueTypes.rows[1].id,
          ]
        )

      const reference =
        'INV-TRANSACTION-FOUNDATION-001'

      await db.query(
        `
          INSERT INTO public.payments (
            invoice_id,
            resident_id,
            amount,
            paystack_reference,
            status
          )

          VALUES
            (
              $1,
              $3,
              2000,
              $4,
              'pending'
            ),
            (
              $2,
              $3,
              3000,
              $4,
              'pending'
            )
        `,
        [
          invoiceOne.id,
          invoiceTwo.id,
          resident.id,
          reference,
        ]
      )

      const transaction =
        await first(
          db,
          `
            SELECT
              id,
              payment_code,
              reference,
              resident_id,
              provider,
              amount,
              currency,
              status,
              paid_at

            FROM public.payment_transactions

            WHERE reference =
              $1
          `,
          [
            reference,
          ]
        )

      assert.match(
        transaction.payment_code,
        /^PAY-[0-9]{6}-[0-9]{6,}$/
      )

      assert.equal(
        transaction.reference,
        reference
      )

      assert.equal(
        transaction.resident_id,
        resident.id
      )

      assert.equal(
        transaction.provider,
        'paystack'
      )

      assert.equal(
        Number(
          transaction.amount
        ),
        5000
      )

      assert.equal(
        transaction.currency,
        'NGN'
      )

      assert.equal(
        transaction.status,
        'pending'
      )

      assert.equal(
        transaction.paid_at,
        null
      )

      const allocations =
        await db.query(
          `
            SELECT
              transaction_id

            FROM public.payments

            WHERE paystack_reference =
              $1
          `,
          [
            reference,
          ]
        )

      assert.equal(
        allocations.rows.length,
        2
      )

      assert.ok(
        allocations.rows.every(
          (
            row
          ) =>
            row.transaction_id ===
            transaction.id
        )
      )

      await db.query(
        `
          UPDATE public.payments

          SET
            status =
              'success',

            paid_at =
              '2026-09-30T12:00:00Z'

          WHERE paystack_reference =
            $1
        `,
        [
          reference,
        ]
      )

      const confirmed =
        await first(
          db,
          `
            SELECT
              amount,
              status,
              paid_at

            FROM public.payment_transactions

            WHERE id =
              $1
          `,
          [
            transaction.id,
          ]
        )

      assert.equal(
        Number(
          confirmed.amount
        ),
        5000
      )

      assert.equal(
        confirmed.status,
        'success'
      )

      assert.ok(
        confirmed.paid_at
      )
    } finally {
      await db.close()
    }
  }
)

test(
  'manual payment allocations create manual payment transactions',
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
              'Manual Transaction Street'
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
              'House 700',
              $1,
              '700'
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
              'Manual Payment Resident',
              '08012345678',
              'manual-payment@example.test',
              'owner',
              '2026-09-01',
              '2026-08-01'
            )

            RETURNING id
          `,
          [
            house.id,
          ]
        )

      const due =
        await first(
          db,
          `
            SELECT id

            FROM public.due_types

            ORDER BY id

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
              'Manual Transaction Test',
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

      const reference =
        'MANUAL-TRANSACTION-FOUNDATION-001'

      const payment =
        await first(
          db,
          `
            INSERT INTO public.payments (
              invoice_id,
              resident_id,
              amount,
              paystack_reference,
              status,
              paid_at
            )

            VALUES (
              $1,
              $2,
              500,
              $3,
              'success',
              '2026-09-30T13:00:00Z'
            )

            RETURNING
              id,
              transaction_id
          `,
          [
            invoice.id,
            resident.id,
            reference,
          ]
        )

      assert.ok(
        payment.transaction_id
      )

      const transaction =
        await first(
          db,
          `
            SELECT
              id,
              payment_code,
              provider,
              amount,
              status,
              paid_at

            FROM public.payment_transactions

            WHERE reference =
              $1
          `,
          [
            reference,
          ]
        )

      assert.equal(
        transaction.id,
        payment.transaction_id
      )

      assert.match(
        transaction.payment_code,
        /^PAY-[0-9]{6}-[0-9]{6,}$/
      )

      assert.equal(
        transaction.provider,
        'manual'
      )

      assert.equal(
        Number(
          transaction.amount
        ),
        500
      )

      assert.equal(
        transaction.status,
        'success'
      )

      assert.ok(
        transaction.paid_at
      )
    } finally {
      await db.close()
    }
  }
)

test(
  'residents can read only their own payment transactions',
  async () => {
    const db =
      await createDatabase()

    try {
      const userOne =
        '11111111-1111-4111-8111-111111111111'

      const userTwo =
        '22222222-2222-4222-8222-222222222222'

      await db.query(
        `
          INSERT INTO auth.users (
            id,
            email
          )

          VALUES
            (
              $1,
              'resident-one@example.test'
            ),
            (
              $2,
              'resident-two@example.test'
            )
        `,
        [
          userOne,
          userTwo,
        ]
      )

      const street =
        await first(
          db,
          `
            INSERT INTO public.streets (
              name
            )

            VALUES (
              'Transaction Access Street'
            )

            RETURNING id
          `
        )

      const houseOne =
        await first(
          db,
          `
            INSERT INTO public.houses (
              address,
              street_id,
              house_number
            )

            VALUES (
              'House 801',
              $1,
              '801'
            )

            RETURNING id
          `,
          [
            street.id,
          ]
        )

      const houseTwo =
        await first(
          db,
          `
            INSERT INTO public.houses (
              address,
              street_id,
              house_number
            )

            VALUES (
              'House 802',
              $1,
              '802'
            )

            RETURNING id
          `,
          [
            street.id,
          ]
        )

      const residentOne =
        await first(
          db,
          `
            INSERT INTO public.residents (
              auth_user_id,
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
              $2,
              'Transaction Resident One',
              '08011111111',
              'resident-one@example.test',
              'owner',
              '2026-09-01',
              '2026-08-01'
            )

            RETURNING id
          `,
          [
            userOne,
            houseOne.id,
          ]
        )

      const residentTwo =
        await first(
          db,
          `
            INSERT INTO public.residents (
              auth_user_id,
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
              $2,
              'Transaction Resident Two',
              '08022222222',
              'resident-two@example.test',
              'owner',
              '2026-09-01',
              '2026-08-01'
            )

            RETURNING id
          `,
          [
            userTwo,
            houseTwo.id,
          ]
        )

      const transactionOne =
        await first(
          db,
          `
            INSERT INTO public.payment_transactions (
              reference,
              resident_id,
              provider,
              amount,
              currency,
              status,
              paid_at
            )

            VALUES (
              'ACCESS-TRANSACTION-ONE',
              $1,
              'manual',
              1000,
              'NGN',
              'success',
              now()
            )

            RETURNING
              id,
              payment_code
          `,
          [
            residentOne.id,
          ]
        )

      await db.query(
        `
          INSERT INTO public.payment_transactions (
            reference,
            resident_id,
            provider,
            amount,
            currency,
            status,
            paid_at
          )

          VALUES (
            'ACCESS-TRANSACTION-TWO',
            $1,
            'manual',
            2000,
            'NGN',
            'success',
            now()
          )
        `,
        [
          residentTwo.id,
        ]
      )

      assert.match(
        transactionOne.payment_code,
        /^PAY-[0-9]{6}-[0-9]{6,}$/
      )

      await db.exec(
        'SET ROLE authenticated'
      )

      await db.query(
        `
          SELECT set_config(
            'request.jwt.claim.sub',
            $1,
            false
          )
        `,
        [
          userOne,
        ]
      )

      const visible =
        await db.query(`
          SELECT
            reference,
            payment_code

          FROM public.payment_transactions

          ORDER BY reference
        `)

      assert.equal(
        visible.rows.length,
        1
      )

      assert.equal(
        visible.rows[0].reference,
        'ACCESS-TRANSACTION-ONE'
      )

      const hidden =
        await db.query(`
          SELECT id

          FROM public.payment_transactions

          WHERE reference =
            'ACCESS-TRANSACTION-TWO'
        `)

      assert.equal(
        hidden.rows.length,
        0
      )

      await assert.rejects(
        db.query(
          `
            UPDATE public.payment_transactions

            SET amount =
              9999

            WHERE id =
              $1
          `,
          [
            transactionOne.id,
          ]
        ),
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

test(
  'collected report uses one canonical Payment ID across transaction allocations',
  async () => {
    const db =
      await createDatabase()

    try {
      const adminAuthId =
        '33333333-3333-4333-8333-333333333333'

      await db.query(
        `
          INSERT INTO auth.users (
            id,
            email
          )

          VALUES (
            $1,
            'report-admin@example.test'
          )
        `,
        [
          adminAuthId,
        ]
      )

      await db.query(
        `
          INSERT INTO public.admins (
            auth_user_id,
            full_name,
            role
          )

          VALUES (
            $1,
            'Report Test Admin',
            'admin'
          )
        `,
        [
          adminAuthId,
        ]
      )

      const street =
        await first(
          db,
          `
            INSERT INTO public.streets (
              name
            )

            VALUES (
              'Collected Report Street'
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
              'House 900',
              $1,
              '900'
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
              'Collected Report Resident',
              '08033333333',
              'collected-report@example.test',
              'owner',
              '2026-09-01',
              '2026-08-01'
            )

            RETURNING id
          `,
          [
            house.id,
          ]
        )

      const dueTypes =
        await db.query(`
          SELECT id

          FROM public.due_types

          ORDER BY id

          LIMIT 2
        `)

      assert.ok(
        dueTypes.rows.length >=
          2
      )

      const invoiceOne =
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
              'Collected Report A',
              '2026-09-01',
              '2026-09-30',
              2000,
              2000,
              'paid',
              '2026-09-30'
            )

            RETURNING id
          `,
          [
            house.id,
            dueTypes.rows[0].id,
          ]
        )

      const invoiceTwo =
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
              'Collected Report B',
              '2026-09-01',
              '2026-09-30',
              3000,
              3000,
              'paid',
              '2026-09-30'
            )

            RETURNING id
          `,
          [
            house.id,
            dueTypes.rows[1].id,
          ]
        )

      const reference =
        'COLLECTED-REPORT-TRANSACTION-001'

      const inserted =
        await db.query(
          `
            INSERT INTO public.payments (
              invoice_id,
              resident_id,
              amount,
              paystack_reference,
              status,
              paid_at
            )

            VALUES
              (
                $1,
                $3,
                2000,
                $4,
                'success',
                '2026-09-30T12:00:00Z'
              ),
              (
                $2,
                $3,
                3000,
                $4,
                'success',
                '2026-09-30T12:00:00Z'
              )

            RETURNING
              payment_code,
              transaction_id
          `,
          [
            invoiceOne.id,
            invoiceTwo.id,
            resident.id,
            reference,
          ]
        )

      assert.equal(
        inserted.rows.length,
        2
      )

      assert.notEqual(
        inserted.rows[0]
          .payment_code,
        inserted.rows[1]
          .payment_code
      )

      assert.equal(
        inserted.rows[0]
          .transaction_id,
        inserted.rows[1]
          .transaction_id
      )

      const transaction =
        await first(
          db,
          `
            SELECT
              id,
              payment_code,
              amount

            FROM public.payment_transactions

            WHERE reference =
              $1
          `,
          [
            reference,
          ]
        )

      assert.equal(
        transaction.id,
        inserted.rows[0]
          .transaction_id
      )

      assert.match(
        transaction.payment_code,
        /^PAY-[0-9]{6}-[0-9]{6,}$/
      )

      assert.equal(
        Number(
          transaction.amount
        ),
        5000
      )

      await db.exec(
        'SET ROLE authenticated'
      )

      await db.query(
        `
          SELECT set_config(
            'request.jwt.claim.sub',
            $1,
            false
          )
        `,
        [
          adminAuthId,
        ]
      )

      const report =
        await first(
          db,
          `
            SELECT
              public.admin_collected_payments_page(
                '2026-09-01',
                '2026-09-30',
                50,
                0
              ) AS result
          `
        )

      assert.equal(
        Number(
          report.result.total
        ),
        2
      )

      assert.equal(
        Number(
          report
            .result
            .total_amount
        ),
        5000
      )

      assert.equal(
        report
          .result
          .rows
          .length,
        2
      )

      const paymentIds =
        new Set(
          report
            .result
            .rows
            .map(
              (
                row
              ) =>
                row.reference
            )
        )

      assert.equal(
        paymentIds.size,
        1
      )

      assert.equal(
        [
          ...paymentIds,
        ][0],
        transaction.payment_code
      )

      const reportedTotal =
        report
          .result
          .rows
          .reduce(
            (
              total,
              row
            ) =>
              total +
              Number(
                row.amount
              ),
            0
          )

      assert.equal(
        reportedTotal,
        5000
      )

      await db.exec(
        'RESET ROLE'
      )
    } finally {
      await db.close()
    }
  }
)

test(
  'due type capabilities replace hard-coded recurring charge names',
  async () => {
    const db =
      await createDatabase()

    try {
      const fixedCharges =
        await db.query(`
          SELECT
            name,
            active,
            auto_generate,
            allow_advance_payment

          FROM public.due_types

          WHERE name IN (
            'Service Charge',
            'CDA Levy'
          )

          ORDER BY name
        `)

      const byName =
        new Map(
          fixedCharges.rows.map(
            (
              row
            ) => [
              row.name,
              row,
            ]
          )
        )

      for (
        const name
        of [
          'Service Charge',
          'CDA Levy',
        ]
      ) {
        const row =
          byName.get(
            name
          )

        assert.ok(
          row,
          `Missing ${name}`
        )

        assert.equal(
          row.active,
          true
        )

        assert.equal(
          row.auto_generate,
          true
        )

        assert.equal(
          row.allow_advance_payment,
          true
        )
      }

      /*
       * A normal monthly household charge must not
       * automatically become an auto-generated or
       * advance-payable charge.
       */
      const ordinaryCharge =
        await first(
          db,
          `
            INSERT INTO public.due_types (
              name,
              amount,
              frequency,
              billing_scope
            )

            VALUES (
              'Capability Disabled Monthly Charge',
              7500,
              'monthly',
              'house'
            )

            RETURNING
              id,
              active,
              auto_generate,
              allow_advance_payment
          `
        )

      assert.equal(
        ordinaryCharge.active,
        true
      )

      assert.equal(
        ordinaryCharge.auto_generate,
        false
      )

      assert.equal(
        ordinaryCharge.allow_advance_payment,
        false
      )

      /*
       * Automatic generation is currently supported
       * only for monthly household charges.
       */
      await assert.rejects(
        db.query(`
          INSERT INTO public.due_types (
            name,
            amount,
            frequency,
            billing_scope,
            auto_generate
          )

          VALUES (
            'Invalid Resident Auto Charge',
            5000,
            'monthly',
            'resident',
            true
          )
        `),
        /due_types_auto_generate_capability_check/
      )

      /*
       * Advance payment is currently supported
       * only for monthly household charges.
       */
      await assert.rejects(
        db.query(`
          INSERT INTO public.due_types (
            name,
            amount,
            frequency,
            billing_scope,
            allow_advance_payment
          )

          VALUES (
            'Invalid Annual Advance Charge',
            5000,
            'yearly',
            'house',
            true
          )
        `),
        /due_types_advance_payment_capability_check/
      )

      const userId =
        '44444444-4444-4444-8444-444444444444'

      await db.query(
        `
          INSERT INTO auth.users (
            id,
            email
          )

          VALUES (
            $1::uuid,
            'capability-resident@example.test'
          )
        `,
        [
          userId,
        ]
      )

      const street =
        await first(
          db,
          `
            INSERT INTO public.streets (
              name
            )

            VALUES (
              'Capability Test Street'
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
              'House 950',
              $1::uuid,
              '950'
            )

            RETURNING id
          `,
          [
            street.id,
          ]
        )

      await first(
        db,
        `
          INSERT INTO public.residents (
            auth_user_id,
            house_id,
            full_name,
            phone,
            email,
            relationship,
            move_in_date,
            property_allocation_date
          )

          VALUES (
            $1::uuid,
            $2::uuid,
            'Capability Test Resident',
            '08044444444',
            'capability-resident@example.test',
            'owner',
            '2026-09-01',
            '2026-08-01'
          )

          RETURNING id
        `,
        [
          userId,
          house.id,
        ]
      )

      const dueType =
        await first(
          db,
          `
            SELECT
              id,
              amount,
              active,
              auto_generate,
              allow_advance_payment

            FROM public.due_types

            WHERE name =
              'Service Charge'
          `
        )

      assert.ok(
        dueType
      )

      assert.equal(
        dueType.active,
        true
      )

      assert.equal(
        dueType.auto_generate,
        true
      )

      assert.equal(
        dueType.allow_advance_payment,
        true
      )

      /*
       * Rename Service Charge.
       *
       * The billing behaviour must continue to work because
       * it now depends on capabilities, not the literal name.
       */
      await db.query(
        `
          UPDATE public.due_types

          SET name =
            'Estate Operations Charge'

          WHERE id =
            $1::uuid
        `,
        [
          dueType.id,
        ]
      )

      const renamed =
        await first(
          db,
          `
            SELECT
              name,
              active,
              auto_generate,
              allow_advance_payment

            FROM public.due_types

            WHERE id =
              $1::uuid
          `,
          [
            dueType.id,
          ]
        )

      assert.equal(
        renamed.name,
        'Estate Operations Charge'
      )

      assert.equal(
        renamed.active,
        true
      )

      assert.equal(
        renamed.auto_generate,
        true
      )

      assert.equal(
        renamed.allow_advance_payment,
        true
      )

      const month =
        await first(
          db,
          `
            SELECT
              to_char(
                date_trunc(
                  'month',
                  now()
                    AT TIME ZONE
                      'Africa/Lagos'
                ),
                'YYYY-MM'
              )::text AS value
          `
        )

      /*
       * PGlite needs the parameters inside
       * jsonb_build_object() explicitly typed.
       *
       * This also makes the test closer to the real
       * prepare_estate_payment() function signature.
       */
      const quote =
        await first(
          db,
          `
            SELECT
              public.prepare_estate_payment(
                $1::uuid,

                jsonb_build_array(
                  jsonb_build_object(
                    'due_type_id',
                      $2::uuid::text,

                    'month',
                      $3::text
                  )
                ),

                'CAPABILITY-QUOTE-REFERENCE-001'::text,

                NULL::bigint,

                true
              ) AS result
          `,
          [
            userId,
            dueType.id,
            month.value,
          ]
        )

      assert.ok(
        quote?.result
      )

      assert.equal(
        quote
          .result
          .lines
          .length,
        1
      )

      assert.equal(
        quote
          .result
          .lines[0]
          .charge,
        'Estate Operations Charge'
      )

      assert.equal(
        Number(
          quote
            .result
            .total_kobo
        ),
        Math.round(
          Number(
            dueType.amount
          ) *
          100
        )
      )

      /*
       * Automatic invoice generation must still work
       * after the charge has been renamed.
       */
      const generation =
        await first(
          db,
          `
            SELECT
              public.generate_estate_fixed_charges()
                AS result
          `
        )

      assert.ok(
        generation?.result
      )

      assert.ok(
        Number(
          generation
            .result
            .created
        ) >=
          1
      )

      const generated =
        await first(
          db,
          `
            SELECT
              count(*)::int AS n

            FROM public.invoices

            WHERE
              house_id =
                $1::uuid

              AND due_type_id =
                $2::uuid
          `,
          [
            house.id,
            dueType.id,
          ]
        )

      assert.equal(
        generated.n,
        1
      )

      /*
       * The ordinary monthly charge must not have an
       * automatically generated invoice because
       * auto_generate remains false.
       */
      const ordinaryGenerated =
        await first(
          db,
          `
            SELECT
              count(*)::int AS n

            FROM public.invoices

            WHERE
              house_id =
                $1::uuid

              AND due_type_id =
                $2::uuid
          `,
          [
            house.id,
            ordinaryCharge.id,
          ]
        )

      assert.equal(
        ordinaryGenerated.n,
        0
      )
    } finally {
      await db.close()
    }
  }
)

test(
  'future reporting and dashboard use due type capabilities instead of charge names',
  async () => {
    const db =
      await createDatabase()

    try {
      const adminAuthId =
        '55555555-5555-4555-8555-555555555555'

      await db.query(
        `
          INSERT INTO auth.users (
            id,
            email
          )

          VALUES (
            $1::uuid,
            'reporting-capability-admin@example.test'
          )
        `,
        [
          adminAuthId,
        ]
      )

      await db.query(
        `
          INSERT INTO public.admins (
            auth_user_id,
            full_name,
            role
          )

          VALUES (
            $1::uuid,
            'Reporting Capability Admin',
            'admin'
          )
        `,
        [
          adminAuthId,
        ]
      )

      const street =
        await first(
          db,
          `
            INSERT INTO public.streets (
              name
            )

            VALUES (
              'Reporting Capability Street'
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
              'House 975',
              $1::uuid,
              '975'
            )

            RETURNING id
          `,
          [
            street.id,
          ]
        )

      const serviceCharge =
        await first(
          db,
          `
            SELECT
              id,
              amount

            FROM public.due_types

            WHERE name =
              'Service Charge'
          `
        )

      const cdaLevy =
        await first(
          db,
          `
            SELECT
              id

            FROM public.due_types

            WHERE name =
              'CDA Levy'
          `
        )

      assert.ok(
        serviceCharge
      )

      assert.ok(
        cdaLevy
      )

      /*
       * Rename a configured recurring charge.
       *
       * Reports must continue working because the capability
       * is attached to the due type, not its name.
       */
      await db.query(
        `
          UPDATE public.due_types

          SET name =
            'Estate Operations Charge'

          WHERE id =
            $1::uuid
        `,
        [
          serviceCharge.id,
        ]
      )

      const ordinary =
        await first(
          db,
          `
            INSERT INTO public.due_types (
              name,
              amount,
              frequency,
              billing_scope
            )

            VALUES (
              'Ordinary Monthly Reporting Charge',
              7500,
              'monthly',
              'house'
            )

            RETURNING
              id,
              active,
              auto_generate
          `
        )

      assert.equal(
        ordinary.active,
        true
      )

      assert.equal(
        ordinary.auto_generate,
        false
      )

      /*
       * Calculate the expected projection while running as
       * the database owner.
       *
       * Once we switch to authenticated below, the test must
       * exercise reporting only through the protected RPCs.
       */
      const expectedFutureTotal =
        await first(
          db,
          `
            SELECT
              SUM(
                amount
              )::numeric
                AS amount

            FROM public.due_types

            WHERE
              active =
                true

              AND auto_generate =
                true

              AND billing_scope =
                'house'

              AND frequency =
                'monthly'
          `
        )

      assert.ok(
        expectedFutureTotal
      )

      await db.exec(
        'SET ROLE authenticated'
      )

      await db.query(
        `
          SELECT set_config(
            'request.jwt.claim.sub',
            $1::text,
            false
          )
        `,
        [
          adminAuthId,
        ]
      )

      /*
       * Future projections must follow capability flags,
       * including after a configured charge is renamed.
       */
      const future =
        await first(
          db,
          `
            SELECT
              public.admin_report_page(
                'future',
                '2026-10-01',
                '2026-10-31',
                '2026-09-30',
                50,
                0
              ) AS result
          `
        )

      assert.equal(
        Number(
          future
            .result
            .total
        ),
        2
      )

      assert.equal(
        future
          .result
          .rows
          .length,
        2
      )

      const futureCharges =
        new Set(
          future
            .result
            .rows
            .map(
              (
                row
              ) =>
                row.charge
            )
        )

      assert.equal(
        futureCharges.has(
          'Estate Operations Charge'
        ),
        true
      )

      assert.equal(
        futureCharges.has(
          'CDA Levy'
        ),
        true
      )

      assert.equal(
        futureCharges.has(
          'Service Charge'
        ),
        false
      )

      assert.equal(
        futureCharges.has(
          'Ordinary Monthly Reporting Charge'
        ),
        false
      )

      assert.equal(
        Number(
          future
            .result
            .total_amount
        ),
        Number(
          expectedFutureTotal.amount
        )
      )

      /*
       * Dashboard zero-value seed rows must also come from
       * capability-enabled due types rather than names.
       */
      const dashboard =
        await first(
          db,
          `
            SELECT
              public.admin_dashboard_summary(
                NULL::date,
                NULL::date
              ) AS result
          `
        )

      const dashboardNames =
        dashboard
          .result
          .charges
          .map(
            (
              row
            ) =>
              row.name
          )

      assert.deepEqual(
        dashboardNames,
        [
          'CDA Levy',
          'Estate Operations Charge',
        ]
      )

      assert.equal(
        dashboardNames.includes(
          'Service Charge'
        ),
        false
      )

      assert.equal(
        dashboardNames.includes(
          'Ordinary Monthly Reporting Charge'
        ),
        false
      )

      assert.ok(
        dashboard
          .result
          .charges
          .every(
            (
              row
            ) =>
              Number(
                row.billed
              ) ===
                0 &&
              Number(
                row.collected
              ) ===
                0 &&
              Number(
                row.outstanding
              ) ===
                0
          )
      )

      await db.exec(
        'RESET ROLE'
      )

      /*
       * Existing real future invoices must still be shown even
       * when their due type is not configured for automatic
       * projection.
       */
      await db.query(
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
            $1::uuid,
            $2::uuid,
            'October 2026',
            '2026-10-01',
            '2026-10-31',
            7500,
            0,
            'unpaid',
            '2026-10-31'
          )
        `,
        [
          house.id,
          ordinary.id,
        ]
      )

      await db.exec(
        'SET ROLE authenticated'
      )

      await db.query(
        `
          SELECT set_config(
            'request.jwt.claim.sub',
            $1::text,
            false
          )
        `,
        [
          adminAuthId,
        ]
      )

      const futureWithRealInvoice =
        await first(
          db,
          `
            SELECT
              public.admin_report_page(
                'future',
                '2026-10-01',
                '2026-10-31',
                '2026-09-30',
                50,
                0
              ) AS result
          `
        )

      const ordinaryRows =
        futureWithRealInvoice
          .result
          .rows
          .filter(
            (
              row
            ) =>
              row.charge ===
                'Ordinary Monthly Reporting Charge'
          )

      assert.equal(
        ordinaryRows.length,
        1
      )

      assert.equal(
        ordinaryRows[0].status,
        'unpaid'
      )

      await db.exec(
        'RESET ROLE'
      )
    } finally {
      await db.close()
    }
  }
)

test(
  'registration approval claimant foreign key has a covering index',
  async () => {
    const db =
      await createDatabase()

    try {
      const foreignKey =
        await first(
          db,
          `
            SELECT
              pg_get_constraintdef(
                c.oid
              ) AS definition

            FROM pg_constraint c

            WHERE
              c.conrelid =
                'public.registration_requests'::regclass

              AND c.conname =
                'registration_requests_approval_claimed_by_fkey'
          `
        )

      assert.ok(
        foreignKey
      )

      assert.match(
        foreignKey.definition,
        /FOREIGN KEY \(approval_claimed_by\) REFERENCES admins\(id\) ON DELETE SET NULL/
      )

      const index =
        await first(
          db,
          `
            SELECT
              indexname,
              indexdef

            FROM pg_indexes

            WHERE
              schemaname =
                'public'

              AND tablename =
                'registration_requests'

              AND indexname =
                'idx_registration_requests_approval_claimed_by'
          `
        )

      assert.ok(
        index
      )

      assert.equal(
        index.indexname,
        'idx_registration_requests_approval_claimed_by'
      )

      assert.match(
        index.indexdef,
        /\(approval_claimed_by\)/
      )
    } finally {
      await db.close()
    }
  }
)

test(
  'legacy single-house invoice helper is restricted to service role',
  async () => {
    const db =
      await createDatabase()

    try {
      const privileges =
        await first(
          db,
          `
            SELECT
              has_function_privilege(
                'anon',
                p.oid,
                'EXECUTE'
              ) AS anon_execute,

              has_function_privilege(
                'authenticated',
                p.oid,
                'EXECUTE'
              ) AS authenticated_execute,

              has_function_privilege(
                'service_role',
                p.oid,
                'EXECUTE'
              ) AS service_execute

            FROM pg_proc p

            JOIN pg_namespace n
              ON n.oid =
                p.pronamespace

            WHERE
              n.nspname =
                'public'

              AND p.proname =
                'generate_single_house_invoice'

              AND pg_get_function_identity_arguments(
                p.oid
              ) =
                'p_house uuid, p_due_type uuid, p_period_start date, p_period_end date, p_due_date date'
          `
        )

      assert.ok(
        privileges
      )

      assert.equal(
        privileges.anon_execute,
        false
      )

      assert.equal(
        privileges.authenticated_execute,
        false
      )

      assert.equal(
        privileges.service_execute,
        true
      )
    } finally {
      await db.close()
    }
  }
)