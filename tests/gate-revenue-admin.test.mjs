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
  return (
    await db.query(
      query,
      args
    )
  ).rows[0]
}

test(
  'gate revenue report and income statement include successful gate income',
  async () => {
    const db =
      await createDatabase()

    try {
      const adminAuth =
        '84000000-0000-4000-8000-000000000001'

      await db.query(
        `
          INSERT INTO auth.users (
            id,
            email
          )

          VALUES (
            $1::uuid,
            'gate-report-admin@example.test'
          )
        `,
        [
          adminAuth,
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
            'Gate Revenue Admin',
            'admin'
          )
        `,
        [
          adminAuth,
        ]
      )

      const charge =
        await first(
          db,
          `
            INSERT INTO public.gate_charge_types (
              name,
              amount,
              active
            )

            VALUES (
              'Contractor Entry',
              2000,
              true
            )

            RETURNING id
          `
        )

      await db.exec(
        'SET ROLE service_role'
      )

      const prepared =
        await first(
          db,
          `
            SELECT
              public.prepare_gate_payment(
                $1::uuid,
                'Gate Report Payer',
                'gate-report@example.test',
                '08012345678',
                'Report Contractor Ltd',
                'ABC-123XY',
                'House 12',
                'Repair work'
              ) AS result
          `,
          [
            charge.id,
          ]
        )

      await db.query(
        `
          SELECT
            public.confirm_gate_payment(
              $1,
              200000,
              'NGN',
              now(),
              'REPORT-TRANSACTION-1'
            )
        `,
        [
          prepared
            .result
            .reference,
        ]
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
          adminAuth,
        ]
      )

      await db.exec(
        'SET ROLE authenticated'
      )

      const revenue =
        await first(
          db,
          `
            SELECT
              public.admin_gate_revenue_page(
                current_date,
                current_date,
                50,
                0
              ) AS result
          `
        )

      assert.equal(
        Number(
          revenue
            .result
            .total
        ),
        1
      )

      assert.equal(
        Number(
          revenue
            .result
            .total_amount
        ),
        2000
      )

      assert.equal(
        revenue
          .result
          .rows[0]
          .reference,
        prepared
          .result
          .payment_code
      )

      const statement =
        await first(
          db,
          `
            SELECT
              public.admin_income_statement_page(
                current_date,
                current_date,
                100,
                0
              ) AS result
          `
        )

      const gateIncome =
        statement
          .result
          .rows
          .find(
            (
              row
            ) =>
              row.kind ===
                'income' &&
              row.label ===
                'Gate — Contractor Entry'
          )

      assert.ok(
        gateIncome
      )

      assert.equal(
        Number(
          gateIncome.total
        ),
        2000
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
  'admin gate revenue API requires administrator access and manages charge types',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          root,
          'src',
          'app',
          'api',
          'admin',
          'gate-revenue',
          'route.ts'
        ),
        'utf8'
      )

    assert.match(
      source,
      /\.auth\.getUser\(\)/
    )

    assert.match(
      source,
      /super_admin/
    )

    assert.match(
      source,
      /admin_gate_revenue_page/
    )

    assert.match(
      source,
      /\.from\(\s*['"]gate_charge_types['"]\s*\)/s
    )

    assert.match(
      source,
      /\.from\(\s*['"]gate_payments['"]\s*\)/s
    )

    assert.match(
      source,
      /created_by/
    )

    assert.match(
      source,
      /updated_by/
    )
  }
)

test(
  'report API uses dedicated gate revenue and extended income statement RPCs',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          root,
          'src',
          'app',
          'api',
          'admin',
          'reports',
          'route.ts'
        ),
        'utf8'
      )

    assert.match(
      source,
      /gate-revenue/
    )

    assert.match(
      source,
      /admin_gate_revenue_page/
    )

    assert.match(
      source,
      /admin_income_statement_page/
    )
  }
)