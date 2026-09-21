# Gate dues reminders and required resident dates

## Deployment

1. Apply `supabase/migration_gate_dues_dates.sql` after the existing migrations, before deploying this code. It is repeatable and does not invent dates for existing records.
2. Set `RESEND_FROM_EMAIL` to a sender address on your verified Resend domain (optionally including the Verdant display name). `RESEND_API_KEY` and `CRON_SECRET` must also be present. The local key and cron secret exist, but the sender variable was not set when checked. Production values have not been inspected or changed.
3. Deploy the application and its updated Vercel cron configuration together. Resident scanning now uses `record_resident_scan`; the migration revokes direct browser inserts to access logs. An older cached scanner will need reloading after deployment.

## Behaviour

- Successful resident QR entry records an access log and snapshots any outstanding household dues in the same transaction. Exits, inactive passes and households without unpaid balances do not create alerts. Positive unpaid/partial/overdue balances are included, even when their due date is in the future; the wording is unpaid, not overdue.
- The entrant gets a reminder at their resident email, falling back to their auth account email if absent. Each admin and super-admin gets a separate email using their auth-account email. Gate-only staff do not receive financial notifications. No SMS is added or sent by this feature.
- Bills belong to households in this application. The message explicitly identifies a household balance and does not attribute personal liability to a tenant or family member. Gate access is not denied because of dues.
- Admins see recent alerts under Access activity, including entrant name, address, phone, email, entry time and outstanding balance. The navigation badge counts entries with unpaid dues in the last 24 hours; it is not an unread count. The panel and badge refresh every 30 seconds.
- The gate response is sent before email delivery. Durable queued mail is processed immediately afterwards, on subsequent scans, and by the daily recovery cron. Missing email configuration leaves mail queued rather than falsely marking it sent.
- Resident locking suppresses duplicate scans in the same direction within eight seconds. Mail jobs use leases and per-recipient provider idempotency keys. Failed/uncertain sends remain pending; after five attempts or 23 hours from the first attempt they are marked for review. Accepted means accepted by the provider, not confirmed inbox delivery. Retry timing depends on later scans and the daily recovery job; delivery is not guaranteed during an outage.
- Provider idempotency reference: https://resend.com/docs/dashboard/emails/idempotency-keys . No live email or SMS was sent during testing.

## Forms and historical data

Both move-in date and property allocation date are required in new resident, resident edit and public registration forms. The registration API validates real calendar dates. Database triggers enforce the requirement for new rows and date edits, including calls that bypass the browser.

Historical missing dates remain unknown until supplied. Other operations such as account linking or deactivation are not blocked by an old missing date. Pending legacy registrations can have both dates supplied in the approval screen; approval validates them before creating a house or resident.

The new-resident household dropdown starts with the disabled placeholder “Choose an address or create a new one”. “Create a new house” is an explicit choice; selecting it reveals the new-house fields. Existing household selection continues to use shared billing records.

## Verification

Isolated database tests cover required dates, migration repeatability, staff permissions, resident/admin email recipient selection, partial balances, duplicate scans, exits, cleared balances, inactive passes and private alert visibility. Mocked sender tests cover acceptance, rejection, timeout, missing configuration and per-recipient idempotency. No live records were altered.
