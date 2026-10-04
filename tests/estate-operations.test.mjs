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
    process.env
      .PGLITE_TEST_MODULE ||
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

const migrationsDirectory =
  path.join(
    root,
    'supabase',
    'migrations'
  )

function migrationFiles() {
  return fs
    .readdirSync(
      migrationsDirectory
    )
    .filter(
      (
        name
      ) =>
        /^\d+_.+\.sql$/.test(
          name
        )
    )
    .sort()
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
    const filename
    of migrationFiles()
  ) {
    await db.exec(
      fs.readFileSync(
        path.join(
          migrationsDirectory,
          filename
        ),
        'utf8'
      )
    )
  }

  await db.exec(`
    GRANT
      SELECT,
      INSERT,
      UPDATE,
      DELETE

    ON ALL TABLES
    IN SCHEMA public

    TO service_role;


    GRANT
      USAGE,
      SELECT

    ON ALL SEQUENCES
    IN SCHEMA public

    TO service_role;
  `)

  return db
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

test(
  'estate operations migration builds the new operational schema',
  async () => {
    const db =
      await createDatabase()

    try {
      const requiredTables = [
        'gate_charge_types',
        'gate_payments',
        'announcements',
        'emergency_incidents',
      ]

      const tableRows =
        await db.query(`
          SELECT table_name

          FROM information_schema.tables

          WHERE table_schema =
            'public'
        `)

      const tables =
        new Set(
          tableRows.rows.map(
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

      for (
        const column
        of [
          'checked_out_at',
          'checked_out_by',
        ]
      ) {
        const result =
          await first(
            db,
            `
              SELECT
                count(*)::int
                  AS n

              FROM information_schema.columns

              WHERE
                table_schema =
                  'public'

                AND table_name =
                  'visitor_passes'

                AND column_name =
                  $1
            `,
            [
              column,
            ]
          )

        assert.equal(
          result.n,
          1,
          `Missing visitor_passes.${column}`
        )
      }

      const functions =
        await db.query(`
          SELECT proname

          FROM pg_proc p

          JOIN pg_namespace n
            ON n.oid =
              p.pronamespace

          WHERE
            n.nspname =
              'public'

            AND p.proname IN (
              'prepare_gate_payment',
              'confirm_gate_payment',
              'admit_gate_payment',
              'raise_emergency_incident',
              'update_emergency_incident',
              'checkout_visitor_pass',
              'admin_gate_revenue_page',
              'admin_income_statement_page'
            )
        `)

      const names =
        new Set(
          functions.rows.map(
            (
              row
            ) =>
              row.proname
          )
        )

      for (
        const name
        of [
          'prepare_gate_payment',
          'confirm_gate_payment',
          'admit_gate_payment',
          'raise_emergency_incident',
          'update_emergency_incident',
          'checkout_visitor_pass',
          'admin_gate_revenue_page',
          'admin_income_statement_page',
        ]
      ) {
        assert.ok(
          names.has(
            name
          ),
          `Missing function: ${name}`
        )
      }
    } finally {
      await db.close()
    }
  }
)

test(
  'visitor checkout is staff-only, atomic and idempotent',
  async () => {
    const db =
      await createDatabase()

    try {
      const gateAuthId =
        '81000000-0000-4000-8000-000000000001'

      const residentAuthId =
        '81000000-0000-4000-8000-000000000002'

      await db.query(
        `
          INSERT INTO auth.users (
            id,
            email
          )

          VALUES
            (
              $1::uuid,
              'gate-checkout@example.test'
            ),
            (
              $2::uuid,
              'resident-checkout@example.test'
            )
        `,
        [
          gateAuthId,
          residentAuthId,
        ]
      )

      const admin =
        await first(
          db,
          `
            INSERT INTO public.admins (
              auth_user_id,
              full_name,
              role
            )

            VALUES (
              $1::uuid,
              'Checkout Gate Staff',
              'gate_staff'
            )

            RETURNING id
          `,
          [
            gateAuthId,
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
              'Checkout Street'
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
              '12 Checkout Street',
              $1::uuid,
              '12'
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
              'Checkout Resident',
              '08012345678',
              'resident-checkout@example.test',
              'owner',
              '2026-10-01',
              '2026-09-01'
            )

            RETURNING id
          `,
          [
            residentAuthId,
            house.id,
          ]
        )

      const visitor =
        await first(
          db,
          `
            INSERT INTO public.visitor_passes (
              resident_id,
              house_id,
              code,
              visitor_name,
              address,
              expires_at,
              redeemed_at,
              redeemed_by
            )

            VALUES (
              $1::uuid,
              $2::uuid,
              'ABCDEF1234',
              'Checkout Visitor',
              '12 Checkout Street',
              now() + interval '4 hours',
              now() - interval '30 minutes',
              $3::uuid
            )

            RETURNING id
          `,
          [
            resident.id,
            house.id,
            admin.id,
          ]
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
          residentAuthId,
        ]
      )

      await db.exec(
        'SET ROLE authenticated'
      )

      await assert.rejects(
        db.query(
          `
            SELECT
              public.checkout_visitor_pass(
                $1::uuid
              )
          `,
          [
            visitor.id,
          ]
        ),
        /Only estate staff/
      )

      await db.exec(
        'RESET ROLE'
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
          gateAuthId,
        ]
      )

      await db.exec(
        'SET ROLE authenticated'
      )

      const checkedOut =
        await first(
          db,
          `
            SELECT
              public.checkout_visitor_pass(
                $1::uuid
              ) AS result
          `,
          [
            visitor.id,
          ]
        )

      assert.equal(
        checkedOut
          .result
          .ok,
        true
      )

      assert.equal(
        checkedOut
          .result
          .already_checked_out,
        false
      )

      assert.ok(
        checkedOut
          .result
          .checked_out_at
      )

      const retried =
        await first(
          db,
          `
            SELECT
              public.checkout_visitor_pass(
                $1::uuid
              ) AS result
          `,
          [
            visitor.id,
          ]
        )

      assert.equal(
        retried
          .result
          .ok,
        true
      )

      assert.equal(
        retried
          .result
          .already_checked_out,
        true
      )

      await db.exec(
        'RESET ROLE'
      )

      const stored =
        await first(
          db,
          `
            SELECT
              checked_out_at,
              checked_out_by

            FROM public.visitor_passes

            WHERE id =
              $1::uuid
          `,
          [
            visitor.id,
          ]
        )

      assert.ok(
        stored.checked_out_at
      )

      assert.equal(
        stored.checked_out_by,
        admin.id
      )
    } finally {
      await db.exec(
        'RESET ROLE'
      ).catch(
        () => {}
      )

      await db.close()
    }
  }
)

test(
  'gate visitor API exposes authenticated checkout through the database RPC',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          root,
          'src',
          'app',
          'api',
          'gate',
          'visitors',
          'route.ts'
        ),
        'utf8'
      )

    assert.match(
      source,
      /export async function PATCH/
    )

    assert.match(
      source,
      /\.auth\.getUser\(\)/
    )

    assert.match(
      source,
      /\.rpc\(\s*['"]checkout_visitor_pass['"]/s
    )

    assert.match(
      source,
      /p_id/
    )
  }
)