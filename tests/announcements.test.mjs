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
    /*
     * Match the relevant Supabase production privileges.
     *
     * BYPASSRLS does not provide table privileges by itself,
     * so the service role still needs explicit access in PGlite.
     */
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


    /*
     * Announcement RLS determines resident audience membership
     * through the resident and household records.
     *
     * Production grants authenticated users SELECT access to
     * these tables, while RLS determines which rows they can see.
     * PGlite does not recreate those Supabase privileges
     * automatically.
     */
    GRANT SELECT
    ON
      public.residents,
      public.houses
    TO authenticated;
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
  'announcements respect resident, street, household and staff audiences',
  async () => {
    const db =
      await createDatabase()

    try {
      const residentAuth =
        '82000000-0000-4000-8000-000000000001'

      const gateAuth =
        '82000000-0000-4000-8000-000000000002'

      const adminAuth =
        '82000000-0000-4000-8000-000000000003'

      await db.query(
        `
          INSERT INTO auth.users (
            id,
            email
          )

          VALUES
            (
              $1::uuid,
              'announcement-resident@example.test'
            ),
            (
              $2::uuid,
              'announcement-gate@example.test'
            ),
            (
              $3::uuid,
              'announcement-admin@example.test'
            )
        `,
        [
          residentAuth,
          gateAuth,
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

          VALUES
            (
              $1::uuid,
              'Announcement Gate',
              'gate_staff'
            ),
            (
              $2::uuid,
              'Announcement Admin',
              'admin'
            )
        `,
        [
          gateAuth,
          adminAuth,
        ]
      )

      const residentStreet =
        await first(
          db,
          `
            INSERT INTO public.streets (
              name
            )

            VALUES (
              'Announcement Street'
            )

            RETURNING id
          `
        )

      const otherStreet =
        await first(
          db,
          `
            INSERT INTO public.streets (
              name
            )

            VALUES (
              'Other Announcement Street'
            )

            RETURNING id
          `
        )

      const residentHouse =
        await first(
          db,
          `
            INSERT INTO public.houses (
              address,
              street_id,
              house_number
            )

            VALUES (
              '10 Announcement Street',
              $1::uuid,
              '10'
            )

            RETURNING id
          `,
          [
            residentStreet.id,
          ]
        )

      const otherHouse =
        await first(
          db,
          `
            INSERT INTO public.houses (
              address,
              street_id,
              house_number
            )

            VALUES (
              '20 Other Announcement Street',
              $1::uuid,
              '20'
            )

            RETURNING id
          `,
          [
            otherStreet.id,
          ]
        )

      await db.query(
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
            'Announcement Resident',
            '08012345678',
            'announcement-resident@example.test',
            'owner',
            '2026-10-01',
            '2026-09-01'
          )
        `,
        [
          residentAuth,
          residentHouse.id,
        ]
      )

      await db.query(
        `
          INSERT INTO public.announcements (
            title,
            body,
            audience,
            publish_at,
            expires_at
          )

          VALUES
            (
              'Everyone',
              'Visible to everybody',
              'all',
              now() - interval '1 hour',
              now() + interval '1 day'
            ),
            (
              'Residents',
              'Visible to residents',
              'residents',
              now() - interval '1 hour',
              now() + interval '1 day'
            ),
            (
              'Staff',
              'Visible to staff',
              'staff',
              now() - interval '1 hour',
              now() + interval '1 day'
            )
        `
      )

      await db.query(
        `
          INSERT INTO public.announcements (
            title,
            body,
            audience,
            street_id,
            publish_at,
            expires_at
          )

          VALUES
            (
              'Resident Street',
              'Matching street',
              'street',
              $1::uuid,
              now() - interval '1 hour',
              now() + interval '1 day'
            ),
            (
              'Other Street',
              'Different street',
              'street',
              $2::uuid,
              now() - interval '1 hour',
              now() + interval '1 day'
            )
        `,
        [
          residentStreet.id,
          otherStreet.id,
        ]
      )

      await db.query(
        `
          INSERT INTO public.announcements (
            title,
            body,
            audience,
            house_id,
            publish_at,
            expires_at
          )

          VALUES
            (
              'Resident Household',
              'Matching household',
              'household',
              $1::uuid,
              now() - interval '1 hour',
              now() + interval '1 day'
            ),
            (
              'Other Household',
              'Different household',
              'household',
              $2::uuid,
              now() - interval '1 hour',
              now() + interval '1 day'
            )
        `,
        [
          residentHouse.id,
          otherHouse.id,
        ]
      )

      await db.exec(`
        INSERT INTO public.announcements (
          title,
          body,
          audience,
          publish_at,
          expires_at
        )

        VALUES
          (
            'Future',
            'Not published yet',
            'all',
            now() + interval '1 day',
            now() + interval '2 days'
          ),
          (
            'Expired',
            'Already expired',
            'all',
            now() - interval '2 days',
            now() - interval '1 day'
          );
      `)

      /*
       * RESIDENT
       */
      await db.query(
        `
          SELECT set_config(
            'request.jwt.claim.sub',
            $1,
            false
          )
        `,
        [
          residentAuth,
        ]
      )

      await db.exec(
        'SET ROLE authenticated'
      )

      const residentRows =
        await db.query(`
          SELECT title

          FROM public.announcements

          ORDER BY title
        `)

      assert.deepEqual(
        residentRows.rows
          .map(
            (
              row
            ) =>
              row.title
          )
          .sort(),
        [
          'Everyone',
          'Resident Household',
          'Resident Street',
          'Residents',
        ].sort()
      )

      await db.exec(
        'RESET ROLE'
      )

      /*
       * GATE STAFF
       */
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

      const gateRows =
        await db.query(`
          SELECT title

          FROM public.announcements

          ORDER BY title
        `)

      assert.deepEqual(
        gateRows.rows
          .map(
            (
              row
            ) =>
              row.title
          )
          .sort(),
        [
          'Everyone',
          'Staff',
        ].sort()
      )

      await db.exec(
        'RESET ROLE'
      )

      /*
       * ADMIN
       *
       * Administrators can see the complete archive, including
       * scheduled and expired notices, so they can manage them.
       */
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

      const adminRows =
        await db.query(`
          SELECT count(*)::int AS n

          FROM public.announcements
        `)

      assert.equal(
        adminRows.rows[0].n,
        9
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
  'announcement administration uses authenticated admin checks and server-only writes',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          root,
          'src',
          'app',
          'api',
          'admin',
          'announcements',
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
      /createServiceClient/
    )

    assert.match(
      source,
      /super_admin/
    )

    assert.match(
      source,
      /admin/
    )

    assert.match(
      source,
      /\.from\(\s*['"]announcements['"]\s*\)/s
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