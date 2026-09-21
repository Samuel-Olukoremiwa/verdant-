# Phase 13 — KudiSMS

## Enable

1. Run `supabase/migration_phase13_sms.sql` in Supabase SQL Editor. This adds a service-only dispatch audit table with a unique event key. No live database migration was applied during development.
2. Keep server environment variables `KUDISMS_API_KEY` and `KUDISMS_SENDER_ID=Verdant` in `.env.local` and Vercel.
3. Wait for **promotional sender ID approval** on the same KudiSMS account as that API key, then redeploy.

## Live test result

One authorized SMS was attempted to the supplied test number ending 8110. KudiSMS rejected it with code 106, "Sender ID does not exist". A subsequent read-only sender-status check returned code 135, "The sender ID is still pending". No second SMS was attempted. Handset delivery has not been verified.

## Behavior

- Billing: existing daily reminder cron and admin button send grouped email/SMS reminders for due and overdue bills. The assigned billing resident receives reminders when designated; otherwise active owners receive them. Email and SMS failures are reported separately. Missing Resend configuration does not prevent SMS.
- Registration: after approval and successful account linking, send an SMS telling the resident to check their email invitation to set their password. SMS failure is displayed to the admin and does not undo approval.
- Visitors: optional Nigerian visitor mobile field when creating a pass. The invitation includes the code, address and start/expiry times in WAT. The SMS outcome is displayed. Copy-and-share remains available even if SMS fails. Leaving the phone blank sends no SMS.
- Nigerian numbers are normalized from local `0...` or `+234...` format. Multiple-recipient strings are rejected.
- Credentials are sent in the HTTPS POST body, never a URL or browser bundle. Only fixed KudiSMS URLs are used; redirects are rejected.
- Audit records contain event keys/status/provider codes, not phone numbers or message bodies. A unique claim prevents repeat attempts for the same registration/pass or payer/house/day. Failed and uncertain attempts are not automatically retried, to avoid duplicate charges. Inspect KudiSMS before deliberately retrying an uncertain attempt.
- Provider acceptance is not handset delivery. The documented promotional gateway (`2`) does not deliver to DND numbers. No delivery-confirmation webhook was configured.

## Validation

Existing billing/visitor tests plus mocked SMS tests cover number formats, provider error codes, timeouts, duplicate claims, audit permissions, and credential-safe requests. Production build, TypeScript and lint run in addition to the tests. The test message is intentionally the only real SMS attempt; no resident reminders or approvals were sent during development.

API reference: https://www.kudisms.net/docs/sms/
