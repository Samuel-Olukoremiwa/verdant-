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
  'successful gate payment can be admitted once and remains idempotent',
  async () => {
    const db =
      await createDatabase()

    try {
      const gateAuth =
        '83000000-0000-4000-8000-000000000001'

      await db.query(
        `
          INSERT INTO auth.users (
            id,
            email
          )

          VALUES (
            $1::uuid,
            'gate-admission@example.test'
          )
        `,
        [
          gateAuth,
        ]
      )

      const staff =
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
              'Gate Admission Staff',
              'gate_staff'
            )

            RETURNING id
          `,
          [
            gateAuth,
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
                'Admission Test',
                'admission@example.test',
                '08012345678',
                'Test Contractor',
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
              'ADMISSION-TEST-1'
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
          gateAuth,
        ]
      )

      await db.exec(
        'SET ROLE authenticated'
      )

      const admitted =
        await first(
          db,
          `
            SELECT
              public.admit_gate_payment(
                $1
              ) AS result
          `,
          [
            prepared
              .result
              .payment_code,
          ]
        )

      assert.equal(
        admitted
          .result
          .ok,
        true
      )

      assert.equal(
        admitted
          .result
          .already_admitted,
        false
      )

      assert.ok(
        admitted
          .result
          .admitted_at
      )

      const retried =
        await first(
          db,
          `
            SELECT
              public.admit_gate_payment(
                $1
              ) AS result
          `,
          [
            prepared
              .result
              .payment_code,
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
          .already_admitted,
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
              admitted_at,
              admitted_by

            FROM public.gate_payments

            WHERE payment_code =
              $1
          `,
          [
            prepared
              .result
              .payment_code,
          ]
        )

      assert.ok(
        stored.admitted_at
      )

      assert.equal(
        stored.admitted_by,
        staff.id
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
  'gate payment cannot be admitted before successful payment',
  async () => {
    const db =
      await createDatabase()

    try {
      const gateAuth =
        '83000000-0000-4000-8000-000000000002'

      await db.query(
        `
          INSERT INTO auth.users (
            id,
            email
          )

          VALUES (
            $1::uuid,
            'gate-pending@example.test'
          )
        `,
        [
          gateAuth,
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
            'Pending Gate Staff',
            'gate_staff'
          )
        `,
        [
          gateAuth,
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
              'Vendor Entry',
              1500,
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
                'Pending Payer',
                'pending@example.test',
                '08012345679',
                NULL,
                NULL,
                NULL,
                NULL
              ) AS result
          `,
          [
            charge.id,
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
          gateAuth,
        ]
      )

      await db.exec(
        'SET ROLE authenticated'
      )

      await assert.rejects(
        db.query(
          `
            SELECT
              public.admit_gate_payment(
                $1
              )
          `,
          [
            prepared
              .result
              .payment_code,
          ]
        ),
        /has not been verified/i
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
  'gate payment API authenticates staff and uses the admission RPC',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          root,
          'src',
          'app',
          'api',
          'gate',
          'payments',
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
      /\.from\(\s*['"]admins['"]\s*\)/s
    )

    assert.match(
      source,
      /\.from\(\s*['"]gate_payments['"]\s*\)/s
    )

    assert.match(
      source,
      /\.rpc\(\s*['"]admit_gate_payment['"]/s
    )

    assert.match(
      source,
      /gate_staff/
    )
  }
)