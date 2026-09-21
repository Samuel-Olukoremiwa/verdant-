# Phases 7–12

Implemented in the main project. Phase 13 (KudiSMS) is deferred.

## Enable on Supabase

Run `supabase/migration_phase7_12.sql` in the Supabase SQL Editor after the Phase 1–6 repair migration. It is transactional and can be rerun. It creates visitor passes and permission-checked creation, cancellation and redemption functions. No live migration was applied during implementation.

The new dependencies are installed locally and recorded in package.json/package-lock.json. Redeploy the project so Vercel installs them. No new environment variables are needed for these phases.

## Features

- **7:** Residents, including tenants/family members, can create visitor codes under **Visitor codes** in their portal. Codes start immediately, expire at the resident's chosen WAT time, and permit one entry. Copyable invitations include code, visitor name, validity times and the resident's own address. Residents can cancel unused codes. Gate staff enter the code at `/gate`; successful verification records entry atomically. Reused, expired, cancelled and invalid-host passes are rejected. Recent visitor entries appear at the gate and in admin gate activity.
- **8:** Dashboard balances default to five streets, with View more, a house toggle and street filtering. Each charge has a month/all-time breakdown. Recorded collections, expenses and net balance follow the selected period. Collections use successful payment receipt dates (including advance payments); billed/outstanding use invoice due dates. Net balance excludes any unrecorded opening bank balance.
- **9:** Residents have Has dues / No outstanding dues filters, combined with street, status and search. View all residents resets filters. The dashboard link opens Has dues. Displayed debt belongs to the household, not separately to each occupant.
- **10:** Invoice headings filter House, Charge, Period, Due date, Status and Outstanding. Filters combine, totals follow the visible rows, and Clear filters resets them.
- **11:** Registration confirmation explains that approval brings an email invitation to set a password and access the portal.
- **12:** Reports offer PDF and CSV downloads, preset periods (this/last month, quarter, year, next month/three months) and custom date ranges. PDF includes headings, totals, pagination and projected-row explanations. Exports use NGN currency labels. Font is bundled with its license. CSV fields are quoted and spreadsheet formula prefixes neutralized.

Financial lists/reports fetch all API pages instead of silently stopping at the default row limit. Report payment date boundaries use WAT and include fractional seconds through the last day. Future projections do not duplicate an existing fixed-charge invoice even when its due date was changed.

## Validation

- TypeScript and ESLint.
- Production build in an isolated source copy, so the main development cache was not replaced.
- 33 automated tests covering existing payment/household behavior, visitor permissions and replay prevention, date boundaries, CSV escaping and pagination, using isolated in-memory PostgreSQL; no live test writes.
- Browser checks with synthetic data for dashboard modes, combined invoice filters, resident dues, report periods/custom dates, invitation copying and PDF export button.
- Rendered and visually checked all pages of three sample PDF reports, including accented names, long descriptions and multiple pages.

After applying SQL and redeploying, check one real resident invitation: create, copy, redeem at the gate, and verify a second attempt is rejected. Also check a cancelled pass and an expired pass. These final authenticated deployment checks remain to be performed in your environment.

## Backup

Current source and configuration before these changes:
`/Users/simon/.codex/visualizations/2026/09/20/01a0be42-9ee9-7ab3-ab6f-b4566b9f66af/ESTATE-before-phase7-12-184138`

The backup excludes dependencies, build cache and Git metadata. The earlier full backup remains intact. The source backup contains private environment configuration; keep it private.
