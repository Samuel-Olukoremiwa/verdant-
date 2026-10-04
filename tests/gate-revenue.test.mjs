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
  'gate payment amount comes from the configured charge rather than the caller',
  async () => {
    const db =
      await createDatabase()

    try {
      const charge =
        await first(
          db,
          `
            INSERT INTO public.gate_charge_types (
              name,
              description,
              amount,
              active
            )

            VALUES (
              'Contractor Entry',
              'Test contractor charge',
              2500.50,
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
                'Gate Test Payer',
                'gate-payer@example.test',
                '08012345678',
                'Example Contractor Ltd',
                'ABC-123XY',
                'House 12',
                'Installation work'
              ) AS result
          `,
          [
            charge.id,
          ]
        )

      assert.equal(
        Number(
          prepared
            .result
            .amount
        ),
        2500.5
      )

      assert.equal(
        Number(
          prepared
            .result
            .amount_kobo
        ),
        250050
      )

      assert.match(
        prepared
          .result
          .reference,
        /^GATE-[a-f0-9]{32}$/i
      )

      assert.match(
        prepared
          .result
          .payment_code,
        /^GATE-\d{6}-\d{6}$/
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
  'gate payment confirmation rejects amount mismatch and is idempotent',
  async () => {
    const db =
      await createDatabase()

    try {
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
              'Moving Truck',
              5000,
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
                'Truck Driver',
                'driver@example.test',
                '08012345679',
                'Moving Company',
                'LAG-100AA',
                NULL,
                NULL
              ) AS result
          `,
          [
            charge.id,
          ]
        )

      await assert.rejects(
        db.query(
          `
            SELECT
              public.confirm_gate_payment(
                $1,
                100,
                'NGN',
                now(),
                '100001'
              )
          `,
          [
            prepared
              .result
              .reference,
          ]
        ),
        /amount mismatch/i
      )

      const confirmed =
        await first(
          db,
          `
            SELECT
              public.confirm_gate_payment(
                $1,
                500000,
                'NGN',
                now(),
                '100002'
              ) AS result
          `,
          [
            prepared
              .result
              .reference,
          ]
        )

      assert.equal(
        confirmed
          .result
          .ok,
        true
      )

      assert.equal(
        confirmed
          .result
          .already_confirmed,
        false
      )

      const retried =
        await first(
          db,
          `
            SELECT
              public.confirm_gate_payment(
                $1,
                500000,
                'NGN',
                now(),
                '100002'
              ) AS result
          `,
          [
            prepared
              .result
              .reference,
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
          .already_confirmed,
        true
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
  'public gate checkout uses server-side pricing and Paystack',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          root,
          'src',
          'app',
          'api',
          'gate-payments',
          'initialize',
          'route.ts'
        ),
        'utf8'
      )

    assert.match(
      source,
      /prepare_gate_payment/
    )

    assert.match(
      source,
      /initializeTransaction/
    )

    assert.match(
      source,
      /amount_kobo/
    )

    assert.match(
      source,
      /consume_registration_limit/
    )

    assert.doesNotMatch(
      source,
      /expected_total_kobo/
    )
  }
)

test(
  'Paystack webhook routes gate references through gate confirmation',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          root,
          'src',
          'app',
          'api',
          'payments',
          'webhook',
          'route.ts'
        ),
        'utf8'
      )

    assert.match(
      source,
      /applyConfirmedGatePayment/
    )

    assert.match(
      source,
      /reference\.startsWith\(\s*['"]GATE-['"]\s*\)/s
    )

    assert.match(
      source,
      /verifyTransaction/
    )

    assert.match(
      source,
      /timingSafeEqual/
    )
  }
)