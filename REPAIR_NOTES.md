# Phase 1–6 repair package

The original ESTATE-PROJ was left unchanged. This package contains corrections for the audited issues, not Phase 7 visitor codes.

## Confirmed cause of the gate-pass failure

The billing-responsibility migration introduced a second foreign-key relationship between residents and houses. The original embedded `houses (...)` query now returns Supabase error PGRST201 (ambiguous relationship). The gate-pass page converted that query error into a 404, while the portal displayed its empty-profile fallback.

The corrected queries explicitly select `houses:houses!residents_house_id_fkey (...)`. These queries were verified against the configured live database using read-only requests. No QR values or personal records were changed.

## Included changes

- Explicit resident-to-house lookups on the portal, gate pass, receipt, and admin resident pages.
- Clear profile/pass error messages rather than a false missing-house message or generic 404.
- Loading fallbacks for the admin, resident, gate and root route trees.
- Atomic payment confirmation with verified amount/currency validation, database locks, and safe retry behaviour.
- Atomic manual payment recording, including duplicate-submission protection.
- Exact advance-payment review showing already-paid months and remaining partial balances; checkout rejects a stale quote rather than charging a changed amount silently.
- Owner billing rights retained after responsibility is assigned to a tenant/family member. Unassigned members cannot read house invoices through the repaired database policy.
- Existing-house selector for admin resident creation, using one atomic house/resident save.
- Atomic monthly charge generation with duplicate-period protection and truthful failure responses.
- Positive expense validation, report request cancellation, consistent outstanding totals, and corrected future-report identity matching.
- Billing reminders restricted to owners and assigned payers, with delivery errors checked.
- Four lint errors and the navigation warning resolved.

## Database change — required before using the corrected payment/create-resident flows

Review `supabase/migration_phase1_6_repairs.sql`, then apply it to the intended database before deploying the corrected code. It has **not** been applied to the live project.

It preserves existing balances/history and existing QR codes; adds transaction functions, invoice uniqueness, and permission rules; creates missing phase columns/tables where applicable; seeds missing fixed charges without changing existing prices; and generates QR values only for active residents who have none. The live read-only check found no residents needing that backfill.

The migration aborts rather than deleting or merging duplicate invoice periods or duplicate fixed-charge types. Existing historical balance discrepancies are not silently rewritten. This is a repair migration on the existing estate schema/auth setup, not a replacement for every earlier registration migration.

The functions controlling gateway payments and monthly generation are callable only with the server service role. Admin-only manual payment/resident creation functions verify the authenticated caller. The resident-update boundary prevents a resident from changing their own house, ownership role or active status directly through Supabase.

## Installation order

1. Keep the original project as your backup; use the separate corrected project or apply the files in `changed-files.zip` to another copy.
2. Review and apply the repair migration in the intended Supabase environment.
3. Add your existing `.env.local` to the separate copy locally. Secrets are deliberately excluded from the deliverables. Use `.env.example` for required variable names.
4. Set `CRON_SECRET` locally and in Vercel for scheduled jobs. It was missing locally during this check; the deployment's environment was not inspected. Keep `NEXT_PUBLIC_SITE_URL` set to an allowed invite/reset URL.
5. Install dependencies, build and run the copy. The verified production build command was `npm exec next build --webpack`.
6. Test signed-in owner, assigned tenant, unassigned family, admin and gate-staff flows, including invite email/password setup, a Paystack test payment, callback/webhook retry, expense creation, and the restored gate pass. No live payments or emails were sent during this work.
7. Deploy only after those integration checks. The live site and original files have not been replaced.

## Verification completed

- ESLint: zero errors and zero warnings.
- TypeScript and production Webpack build: passed.
- 19 Node test results passed, including an isolated PostgreSQL test suite. Tests cover rollback on failed invoice writes, safe confirmation retry, amount/currency mismatch rejection, paid/partial month quoting, stale quote rollback, multiple-month payment references, manual/online partial payments, invoice permissions, existing-house creation and expense permissions.
- Public-page HTTP checks passed. Logged-out admin/portal/gate routes redirect to login; protected API requests reject unauthenticated access. Next.js can stream these redirects in an HTTP 200 response, which was accounted for in the checks.
- Live read-only checks confirmed the required phase columns, expenses table and fixed charges exist. No active residents lacked QR codes, no duplicate invoice-period groups were found, and invoice amount-paid totals matched successful-payment sums in the returned dataset.
- Corrected gate-pass and portal queries succeeded against Supabase.
- Original source hashes matched the snapshot taken before repair work.

These checks do not certify every production interaction as error-free. Live policy changes, authenticated browser flows, actual email delivery, scheduled execution and Paystack processing still need post-migration integration testing. Tests use in-memory PostgreSQL; they are not a production multi-connection load test.

## Running the regression tests without changing app dependencies

From the corrected project, install the test-only runtime separately:

```sh
npm install --prefix /tmp/verdant-db-test @electric-sql/pglite@0.5.8
PGLITE_TEST_MODULE=/tmp/verdant-db-test/node_modules/@electric-sql/pglite node --test tests/*.test.mjs
```

No `.env` is loaded by these tests, and they never contact Supabase.
