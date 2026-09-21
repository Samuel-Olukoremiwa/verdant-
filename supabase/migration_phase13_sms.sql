begin;
-- A durable send claim prevents concurrent requests and cron retries sending the same SMS twice.
-- Contains no API keys, message bodies, visitor codes or recipient phone numbers.
create table if not exists public.sms_dispatches (
 event_key text primary key,
 kind text not null check(kind in ('billing','registration','visitor')),
 status text not null default 'pending' check(status in ('pending','accepted','failed','unknown')),
 provider_code text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.sms_dispatches enable row level security;
revoke all on public.sms_dispatches from public,anon,authenticated;
grant select,insert,update on public.sms_dispatches to service_role;
commit;
