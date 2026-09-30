-- ============================================================
-- ZADANT ESTATE LEGACY SCHEMA BASELINE
--
-- This migration consolidates the schema work that predates
-- the tracked Supabase migration history.
--
-- Production already contains these objects.
--
-- This file exists so a new/fresh database can reconstruct the
-- application schema before replaying the tracked migrations
-- that begin at 20260930124452.
-- ============================================================



-- ============================================================
-- SOURCE: supabase/schema.sql
-- ============================================================

-- ESTATE MANAGEMENT APP — DATABASE SCHEMA
-- Run this in Supabase SQL editor (Project > SQL Editor > New query)

-- 1. HOUSES / UNITS
create table houses (
  id uuid primary key default gen_random_uuid(),
  address text not null,           -- e.g. "Block 4, House 12"
  house_type text,                 -- e.g. "3-bedroom duplex"
  created_at timestamptz default now()
);

-- 2. RESIDENTS
create table residents (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id), -- links to Supabase auth login
  house_id uuid references houses(id),
  full_name text not null,
  phone text,
  email text,
  relationship text default 'owner',  -- owner, tenant, family member
  photo_url text,
  vehicle_plate_numbers text[],       -- e.g. {"ABC-123-XY", "LND-456-KJ"}
  emergency_contact_name text,
  emergency_contact_phone text,
  move_in_date date,
  qr_code_value text unique,          -- unique code embedded in resident's QR
  is_active boolean default true,     -- false = moved out / disabled access
  created_at timestamptz default now()
);

-- 3. DUES / BILL TYPES (e.g. "Monthly Service Charge", "Security Levy")
create table due_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(12,2) not null,
  frequency text default 'monthly', -- monthly, quarterly, yearly, one-time
  created_at timestamptz default now()
);

-- 4. INVOICES/CHARGES (a due assigned to a house for a period)
create table invoices (
  id uuid primary key default gen_random_uuid(),
  house_id uuid references houses(id),
  due_type_id uuid references due_types(id),
  period_label text,             -- e.g. "March 2026"
  amount numeric(12,2) not null,
  amount_paid numeric(12,2) default 0,
  status text default 'unpaid',  -- unpaid, partial, paid, overdue
  due_date date,
  created_at timestamptz default now()
);

-- 5. PAYMENTS (actual transactions, linked to Paystack)
create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id),
  resident_id uuid references residents(id),
  amount numeric(12,2) not null,
  paystack_reference text unique,
  status text default 'pending', -- pending, success, failed
  receipt_url text,
  paid_at timestamptz,
  created_at timestamptz default now()
);

-- 6. ENTRY / EXIT LOGS (QR scans at gate)
create table access_logs (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid references residents(id),
  direction text not null,   -- 'entry' or 'exit'
  scanned_by text,           -- gate staff name/id
  scanned_at timestamptz default now(),
  notes text
);

-- 7. ADMIN USERS (staff who manage the system)
create table admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id),
  full_name text,
  role text default 'admin', -- admin, super_admin, gate_staff
  created_at timestamptz default now()
);

-- Helpful indexes
create index idx_residents_house on residents(house_id);
create index idx_invoices_house on invoices(house_id);
create index idx_payments_resident on payments(resident_id);
create index idx_access_logs_resident on access_logs(resident_id);



-- ============================================================
-- SOURCE: supabase/auth.sql
-- ============================================================

-- Run after creating the initial Supabase Auth account and linking its UUID to admins.auth_user_id.
create or replace function public.is_estate_staff() returns boolean language sql security definer set search_path = public stable as $$ select exists (select 1 from public.admins where auth_user_id = auth.uid() and role in ('super_admin','admin','gate_staff')); $$;
create or replace function public.is_estate_admin() returns boolean language sql security definer set search_path = public stable as $$ select exists (select 1 from public.admins where auth_user_id = auth.uid() and role in ('super_admin','admin')); $$;
alter table public.houses enable row level security; alter table public.residents enable row level security; alter table public.due_types enable row level security; alter table public.invoices enable row level security; alter table public.payments enable row level security; alter table public.access_logs enable row level security; alter table public.admins enable row level security;
create policy "admins manage houses" on public.houses for all using (public.is_estate_admin()) with check (public.is_estate_admin());
create policy "residents view own house" on public.houses for select using (exists (select 1 from public.residents where residents.house_id = houses.id and residents.auth_user_id = auth.uid()));
create policy "admins manage residents" on public.residents for all using (public.is_estate_admin()) with check (public.is_estate_admin());
create policy "residents view own profile" on public.residents for select using (auth_user_id = auth.uid());
create policy "residents update own profile" on public.residents for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy "staff view residents" on public.residents for select using (public.is_estate_staff());
create policy "admins manage due types" on public.due_types for all using (public.is_estate_admin()) with check (public.is_estate_admin());
create policy "admins manage invoices" on public.invoices for all using (public.is_estate_admin()) with check (public.is_estate_admin());
create policy "residents view home invoices" on public.invoices for select using (exists (select 1 from public.residents where residents.house_id = invoices.house_id and residents.auth_user_id = auth.uid()));
create policy "admins manage payments" on public.payments for all using (public.is_estate_admin()) with check (public.is_estate_admin());
create policy "residents view own payments" on public.payments for select using (resident_id in (select id from public.residents where auth_user_id = auth.uid()));
create policy "admins manage access logs" on public.access_logs for all using (public.is_estate_admin()) with check (public.is_estate_admin());
create policy "gate staff view access logs" on public.access_logs for select using (public.is_estate_staff());
create policy "gate staff add access logs" on public.access_logs for insert with check (public.is_estate_staff());
create policy "staff view own account" on public.admins for select using (auth_user_id = auth.uid());



-- ============================================================
-- SOURCE: supabase/migration_phase1_6_repairs.sql
-- ============================================================

-- Review and apply before deploying the corrected code. All changes are transactional.
-- Existing duplicate invoices stop this migration; no billing history is deleted.
begin;
alter table public.residents add column if not exists property_allocation_date date;
alter table public.houses add column if not exists billing_responsible_resident_id uuid references public.residents(id);
create table if not exists public.expenses (
 id uuid primary key default gen_random_uuid(), category text not null,
 description text not null, amount numeric(12,2) not null check (amount > 0),
 expense_date date not null, created_by uuid references public.admins(id),
 created_at timestamptz default now()
);
alter table public.expenses enable row level security;
drop policy if exists "repair admins manage expenses" on public.expenses;
create policy "repair admins manage expenses" on public.expenses for all to authenticated
 using (public.is_estate_admin()) with check (public.is_estate_admin() and amount > 0);
-- Restrictive policies also constrain any permissive policy from an earlier migration.
drop policy if exists "repair expenses admin boundary" on public.expenses;
create policy "repair expenses admin boundary" on public.expenses as restrictive for all to public
 using (public.is_estate_admin()) with check (public.is_estate_admin() and amount > 0);

-- Never let residents grant themselves ownership, change houses, or reactivate access.
drop policy if exists "residents update own profile" on public.residents;
drop policy if exists "repair resident write boundary" on public.residents;
create policy "repair resident write boundary" on public.residents as restrictive for update to authenticated
 using (public.is_estate_admin()) with check (public.is_estate_admin());

create or replace function public.can_pay_house(p_house uuid) returns boolean
language sql stable security definer set search_path = public as $$
 select exists(select 1 from residents r join houses h on h.id=r.house_id
 where r.auth_user_id=auth.uid() and r.is_active and h.id=p_house
 and (r.relationship='owner' or h.billing_responsible_resident_id=r.id));
$$;
revoke all on function public.can_pay_house(uuid) from public, anon;
grant execute on function public.can_pay_house(uuid) to authenticated;
drop policy if exists "residents view home invoices" on public.invoices;
drop policy if exists "repair responsible residents view invoices" on public.invoices;
create policy "repair responsible residents view invoices" on public.invoices for select to authenticated
 using (public.can_pay_house(house_id));
drop policy if exists "repair invoice visibility boundary" on public.invoices;
create policy "repair invoice visibility boundary" on public.invoices as restrictive for select to authenticated
 using (public.is_estate_admin() or public.can_pay_house(house_id));
drop policy if exists "repair residents view due types" on public.due_types;
create policy "repair residents view due types" on public.due_types for select to authenticated
 using (exists(select 1 from public.residents where auth_user_id=auth.uid() and is_active));

insert into public.due_types(name,amount,frequency)
 select 'Service Charge',5000,'monthly' where not exists(select 1 from public.due_types where name='Service Charge');
insert into public.due_types(name,amount,frequency)
 select 'CDA Levy',1000,'monthly' where not exists(select 1 from public.due_types where name='CDA Levy');

do $$ declare c record; begin
 if exists(select 1 from public.invoices where period_label is not null group by house_id,due_type_id,period_label having count(*)>1) then
  raise exception 'Duplicate invoice periods exist. Review and reconcile them before applying this migration.';
 end if;
 if exists(select 1 from public.due_types where name in ('Service Charge','CDA Levy') group by name having count(*)>1) then
  raise exception 'Duplicate fixed charge types exist. Review them before applying this migration.';
 end if;
 -- Drop only a single-column UNIQUE constraint on the gateway reference.
 for c in select conname from pg_constraint where conrelid='public.payments'::regclass and contype='u'
 and conkey=array[(select attnum from pg_attribute where attrelid='public.payments'::regclass and attname='paystack_reference')]::smallint[] loop
  execute format('alter table public.payments drop constraint %I',c.conname);
 end loop;
end $$;
create unique index if not exists repair_invoice_period_unique on public.invoices(house_id,due_type_id,period_label);
create index if not exists repair_payment_reference on public.payments(paystack_reference);

-- A quote is read-only; checkout creates the invoice/payment rows in a single transaction.
-- The house lock serializes advance checkout and monthly generation for that house.
create or replace function public.prepare_estate_payment(
 p_auth_user uuid, p_items jsonb, p_reference text, p_expected_kobo bigint, p_quote_only boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare r residents%rowtype; h houses%rowtype; item jsonb; inv invoices%rowtype; dt due_types%rowtype;
 m date; period text; due date; amount_due numeric; total_kobo bigint:=0; line_kobo bigint;
 lines jsonb:='[]'::jsonb; seen text[]:='{}'; key text; current_month date:=date_trunc('month',now() at time zone 'Africa/Lagos')::date;
begin
 select * into strict r from residents where auth_user_id=p_auth_user and is_active;
 select * into strict h from houses where id=r.house_id for update;
 if r.relationship is distinct from 'owner' and h.billing_responsible_resident_id is distinct from r.id then
  raise exception 'You are not responsible for this house''s bills'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 120 then
  raise exception 'Choose between 1 and 120 payment items'; end if;
 if not p_quote_only and (p_reference is null or length(p_reference)<10) then raise exception 'Missing payment reference'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  inv:=null;
  if item ? 'invoice_id' then
   select * into strict inv from invoices where id=(item->>'invoice_id')::uuid and house_id=h.id for update;
   amount_due:=(item->>'amount')::numeric;
   if amount_due is null or amount_due::text in ('NaN','Infinity','-Infinity') or amount_due<=0 or round(amount_due,2)<>amount_due
    or amount_due>inv.amount-coalesce(inv.amount_paid,0) then raise exception 'Enter an amount within the outstanding balance, with at most two decimal places'; end if;
   select * into strict dt from due_types where id=inv.due_type_id;
   period:=inv.period_label; due:=inv.due_date;
  else
   select * into strict dt from due_types where id=(item->>'due_type_id')::uuid and name in ('Service Charge','CDA Levy');
   if coalesce(item->>'month','') !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Invalid billing month'; end if;
   m:=((item->>'month')||'-01')::date;
   if m<current_month or m>=current_month+interval '60 months' then raise exception 'Choose a month within the next five years'; end if;
   period:=to_char(m,'FMMonth YYYY'); due:=(m+interval '1 month - 1 day')::date;
   select * into inv from invoices where house_id=h.id and due_type_id=dt.id and period_label=period for update;
   amount_due:=case when inv.id is null then dt.amount else greatest(0,inv.amount-coalesce(inv.amount_paid,0)) end;
  end if;
  key:=dt.id::text||':'||coalesce(period,inv.id::text);
  if key=any(seen) then raise exception 'The same bill was selected more than once'; end if;
  seen:=array_append(seen,key);
  if amount_due<0 or dt.amount<=0 then raise exception 'Invalid charge amount'; end if;
  line_kobo:=round(amount_due*100)::bigint;
  total_kobo:=total_kobo+line_kobo;
  if not p_quote_only and line_kobo>0 and inv.id is null then
   insert into invoices(house_id,due_type_id,period_label,amount,due_date,status)
   values(h.id,dt.id,period,dt.amount,due,'unpaid') returning * into inv;
  end if;
  lines:=lines||jsonb_build_array(jsonb_build_object('invoice_id',inv.id,'charge',dt.name,'period',period,'amount_kobo',line_kobo));
 end loop;
 if not p_quote_only then
  if total_kobo<=0 then raise exception 'Nothing left to pay for'; end if;
  if p_expected_kobo is null or total_kobo<>p_expected_kobo then raise exception 'Your balance changed. Review the payment amount again.'; end if;
  insert into payments(invoice_id,resident_id,amount,paystack_reference,status)
   select (x->>'invoice_id')::uuid,r.id,(x->>'amount_kobo')::numeric/100,p_reference,'pending'
   from jsonb_array_elements(lines) x where (x->>'amount_kobo')::bigint>0;
 end if;
 return jsonb_build_object('total_kobo',total_kobo,'lines',lines,'resident_id',r.id,'email',r.email);
end $$;
revoke all on function public.prepare_estate_payment(uuid,jsonb,text,bigint,boolean) from public,anon,authenticated;
grant execute on function public.prepare_estate_payment(uuid,jsonb,text,bigint,boolean) to service_role;

-- Both the webhook and browser callback use this one transaction.
create or replace function public.confirm_estate_payment(p_reference text,p_amount_kobo bigint,p_currency text,p_paid_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p payments%rowtype; inv invoices%rowtype; expected bigint; applied integer:=0; already integer:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_reference,0));
 select round(sum(amount)*100)::bigint into expected from payments where paystack_reference=p_reference;
 if expected is null then raise exception 'Payment reference not found'; end if;
 if p_currency is distinct from 'NGN' or p_amount_kobo is distinct from expected then raise exception 'Verified payment amount or currency does not match'; end if;
 -- A stable invoice order prevents deadlocks between multi-invoice payments.
 for p in select * from payments where paystack_reference=p_reference order by invoice_id,id for update loop
  if p.status='success' then already:=already+1; continue; end if;
  if p.amount<=0 then raise exception 'Invalid payment amount'; end if;
  select * into strict inv from invoices where id=p.invoice_id for update;
  update invoices set amount_paid=coalesce(amount_paid,0)+p.amount,
   status=case when coalesce(amount_paid,0)+p.amount>=amount then 'paid' else 'partial' end where id=inv.id;
  update payments set status='success',paid_at=coalesce(p_paid_at,now()) where id=p.id;
  applied:=applied+1;
 end loop;
 return jsonb_build_object('ok',true,'applied',applied,'alreadyProcessed',already);
end $$;
revoke all on function public.confirm_estate_payment(text,bigint,text,timestamptz) from public,anon,authenticated;
grant execute on function public.confirm_estate_payment(text,bigint,text,timestamptz) to service_role;

create or replace function public.generate_estate_fixed_charges() returns jsonb
language plpgsql security definer set search_path=public as $$
declare h houses%rowtype; d due_types%rowtype; period text; due date; n integer; created integer:=0; skipped integer:=0;
 m date:=date_trunc('month',now() at time zone 'Africa/Lagos')::date;
begin
 period:=to_char(m,'FMMonth YYYY');due:=(m+interval '1 month - 1 day')::date;
 if (select count(*) from due_types where name in ('Service Charge','CDA Levy'))<>2 then raise exception 'Both fixed charges must be configured exactly once'; end if;
 for h in select * from houses order by id for update loop
  for d in select * from due_types where name in ('Service Charge','CDA Levy') order by id loop
   if d.amount<=0 then raise exception 'Fixed charge amount must be positive'; end if;
   insert into invoices(house_id,due_type_id,period_label,amount,due_date,status)
    values(h.id,d.id,period,d.amount,due,'unpaid') on conflict(house_id,due_type_id,period_label) do nothing;
   get diagnostics n=row_count;created:=created+n;skipped:=skipped+(1-n);
  end loop;
 end loop;
 return jsonb_build_object('periodLabel',period,'created',created,'skipped',skipped);
end $$;
revoke all on function public.generate_estate_fixed_charges() from public,anon,authenticated;
grant execute on function public.generate_estate_fixed_charges() to service_role;

create or replace function public.record_estate_manual_payment(p_invoice uuid,p_resident uuid,p_amount numeric,p_reference text)
returns uuid language plpgsql security definer set search_path=public as $$
declare inv invoices%rowtype; payment_id uuid;
begin
 if not public.is_estate_admin() then raise exception 'Not authorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_reference,0));
 select id into payment_id from payments where paystack_reference=p_reference;
 if found then return payment_id; end if;
 select * into strict inv from invoices where id=p_invoice for update;
 if not exists(select 1 from residents where id=p_resident and house_id=inv.house_id) then raise exception 'Resident does not belong to this house'; end if;
 if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or round(p_amount,2)<>p_amount or p_amount>inv.amount-coalesce(inv.amount_paid,0) then raise exception 'Invalid payment amount'; end if;
 insert into payments(invoice_id,resident_id,amount,paystack_reference,status,paid_at)
 values(p_invoice,p_resident,p_amount,p_reference,'success',now()) returning id into payment_id;
 update invoices set amount_paid=coalesce(amount_paid,0)+p_amount,
 status=case when coalesce(amount_paid,0)+p_amount>=amount then 'paid' else 'partial' end where id=p_invoice;
 return payment_id;
end $$;
revoke all on function public.record_estate_manual_payment(uuid,uuid,numeric,text) from public,anon;
grant execute on function public.record_estate_manual_payment(uuid,uuid,numeric,text) to authenticated;

-- Repair missing passes without changing any existing QR code or inactive resident.
update public.residents set qr_code_value='RES-'||gen_random_uuid()::text
 where is_active and (qr_code_value is null or btrim(qr_code_value)='');
grant select,insert,update,delete on public.expenses to authenticated;
-- Existing streets migration is preserved; these additions also support a fresh base schema.
create table if not exists public.streets(id uuid primary key default gen_random_uuid(),name text not null,created_at timestamptz default now());
alter table public.houses add column if not exists street_id uuid references public.streets(id);
alter table public.houses add column if not exists house_number text;
alter table public.streets enable row level security;
drop policy if exists "repair admin streets" on public.streets;
create policy "repair admin streets" on public.streets for all to authenticated using(public.is_estate_admin()) with check(public.is_estate_admin());
drop policy if exists "repair read streets" on public.streets;
create policy "repair read streets" on public.streets for select to anon,authenticated using(true);
grant select on public.streets to anon,authenticated;
grant insert,update,delete on public.streets to authenticated;

create or replace function public.add_estate_resident(p_house_id uuid,p_house jsonb,p_resident jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare house_id uuid:=p_house_id; resident_id uuid; street_name text; street_uuid uuid; number_text text;
begin
 if not public.is_estate_admin() then raise exception 'Not authorized'; end if;
 if coalesce(btrim(p_resident->>'full_name'),'')='' or coalesce(btrim(p_resident->>'phone'),'')='' or coalesce(p_resident->>'email','') !~ '^[^ @]+@[^ @]+\.[^ @]+$'
  or coalesce(p_resident->>'relationship','') not in ('owner','tenant','family_member') then raise exception 'Enter valid resident details'; end if;
 if house_id is null then
  street_uuid:=(p_house->>'street_id')::uuid;number_text:=btrim(p_house->>'house_number');
  if coalesce(number_text,'')='' then raise exception 'Enter a house number'; end if;
  select name into strict street_name from streets where id=street_uuid;
  perform pg_advisory_xact_lock(hashtextextended(street_uuid::text||':'||lower(number_text),0));
  if exists(select 1 from houses where street_id=street_uuid and lower(btrim(house_number))=lower(number_text)) then
   raise exception 'This house already exists. Select it from the Household dropdown.'; end if;
  insert into houses(address,house_type,street_id,house_number) values(number_text||', '||street_name,nullif(p_house->>'house_type',''),street_uuid,number_text) returning id into house_id;
 elsif not exists(select 1 from houses where id=house_id) then raise exception 'House not found'; end if;
 insert into residents(house_id,full_name,phone,email,relationship,vehicle_plate_numbers,emergency_contact_name,emergency_contact_phone,move_in_date,property_allocation_date,qr_code_value)
 values(house_id,btrim(p_resident->>'full_name'),btrim(p_resident->>'phone'),btrim(p_resident->>'email'),p_resident->>'relationship',
 array(select jsonb_array_elements_text(coalesce(p_resident->'vehicle_plate_numbers','[]'::jsonb))),nullif(p_resident->>'emergency_contact_name',''),nullif(p_resident->>'emergency_contact_phone',''),
 nullif(p_resident->>'move_in_date','')::date,nullif(p_resident->>'property_allocation_date','')::date,'RES-'||gen_random_uuid()::text) returning id into resident_id;
 return resident_id;
end $$;
revoke all on function public.add_estate_resident(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.add_estate_resident(uuid,jsonb,jsonb) to authenticated;

commit;



-- ============================================================
-- SOURCE: supabase/migration_registration_requests_base.sql
-- ============================================================

-- ZADANT
-- Reconstructs the original registration_requests base table that exists
-- in production but was previously missing from the repository migration chain.
--
-- Run after:
--   schema.sql
--   auth.sql
--   migration_phase1_6_repairs.sql
--
-- Later migrations add consent, dates, block/flat, vehicles,
-- emergency contacts and stricter registration rules.
--
-- Safe on an existing database.

BEGIN;

CREATE TABLE IF NOT EXISTS public.registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  surname text NOT NULL,

  first_name text NOT NULL,

  other_names text,

  phone text NOT NULL,

  email text NOT NULL,

  street_id uuid
    REFERENCES public.streets(id),

  house_number text NOT NULL,

  house_type text,

  relationship text
    DEFAULT 'owner',

  status text
    DEFAULT 'pending',

  decline_reason text,

  reviewed_by uuid
    REFERENCES public.admins(id),

  reviewed_at timestamptz,

  created_resident_id uuid
    REFERENCES public.residents(id),

  created_at timestamptz
    DEFAULT now()
);

-- Preserve the database-level validation currently present in production.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid =
      'public.registration_requests'::regclass
      AND conname =
        'registration_phone_format'
  ) THEN
    ALTER TABLE
      public.registration_requests

    ADD CONSTRAINT
      registration_phone_format

    CHECK (
      phone ~
      '^[0-9+[:space:]-]{7,15}$'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid =
      'public.registration_requests'::regclass
      AND conname =
        'registration_email_format'
  ) THEN
    ALTER TABLE
      public.registration_requests

    ADD CONSTRAINT
      registration_email_format

    CHECK (
      email ~
      '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    );
  END IF;
END
$$;

ALTER TABLE
  public.registration_requests
ENABLE ROW LEVEL SECURITY;

-- Registration administration is restricted to estate administrators.
DROP POLICY IF EXISTS
  "admins manage registration requests"
ON public.registration_requests;

CREATE POLICY
  "admins manage registration requests"
ON public.registration_requests
FOR ALL
TO authenticated
USING (
  public.is_estate_admin()
)
WITH CHECK (
  public.is_estate_admin()
);

-- Public registrations now go through the validated server API,
-- which uses the service role.
REVOKE ALL
ON public.registration_requests
FROM anon;

REVOKE INSERT
ON public.registration_requests
FROM authenticated;

GRANT
  SELECT,
  UPDATE,
  DELETE
ON public.registration_requests
TO authenticated;

GRANT
  SELECT,
  INSERT,
  UPDATE,
  DELETE
ON public.registration_requests
TO service_role;

COMMIT;


-- ============================================================
-- SOURCE: supabase/migration_phase7_12.sql
-- ============================================================

-- Apply after migration_phase1_6_repairs.sql. Safe to run again.
begin;
create table if not exists public.visitor_passes (
 id uuid primary key default gen_random_uuid(),
 resident_id uuid not null references public.residents(id),
 house_id uuid not null references public.houses(id),
 code text not null unique,
 visitor_name text not null default 'Visitor',
 address text not null,
 starts_at timestamptz not null default now(),
 expires_at timestamptz not null,
 redeemed_at timestamptz,
 redeemed_by uuid references public.admins(id),
 cancelled_at timestamptz,
 check (expires_at > starts_at),
 check (not (redeemed_at is not null and cancelled_at is not null))
);
create index if not exists visitor_passes_resident_idx on public.visitor_passes(resident_id,starts_at desc);
alter table public.visitor_passes enable row level security;
drop policy if exists "view visitor passes" on public.visitor_passes;
create policy "view visitor passes" on public.visitor_passes for select to authenticated using (
 public.is_estate_staff() or exists(select 1 from public.residents r where r.id=resident_id and r.auth_user_id=auth.uid() and r.is_active)
);
revoke all on public.visitor_passes from anon,authenticated;
grant select on public.visitor_passes to authenticated;

create or replace function public.create_visitor_pass(p_visitor_name text,p_expires_at timestamptz)
returns public.visitor_passes language plpgsql security definer set search_path=public as $$
declare r public.residents; h public.houses; v public.visitor_passes; addr text; attempts int:=0;
begin
 select * into r from public.residents where auth_user_id=auth.uid() and is_active order by id limit 1 for update;
 if r.id is null or r.house_id is null then raise exception 'An active resident with a house is required'; end if;
 select * into h from public.houses where id=r.house_id;
 if h.id is null then raise exception 'Your house record is unavailable'; end if;
 if p_expires_at is null or not isfinite(p_expires_at) or p_expires_at<=clock_timestamp() then raise exception 'Choose an expiry time in the future'; end if;
 if length(trim(coalesce(p_visitor_name,'')))>100 then raise exception 'Visitor name must be 100 characters or fewer'; end if;
 addr:=h.address;
 -- Append street only when the saved address does not already include it.
 select addr || case when s.name is not null and position(lower(s.name) in lower(addr))=0 then ', '||s.name else '' end into addr
 from (select 1) x left join public.streets s on s.id=h.street_id;
 loop
  attempts:=attempts+1;
  begin
   insert into public.visitor_passes(resident_id,house_id,code,visitor_name,address,starts_at,expires_at)
   values(r.id,r.house_id,upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),coalesce(nullif(trim(p_visitor_name),''),'Visitor'),addr,clock_timestamp(),p_expires_at)
   returning * into v;
   return v;
  exception when unique_violation then if attempts>=5 then raise exception 'Please try generating the code again'; end if;
  end;
 end loop;
end $$;

create or replace function public.cancel_visitor_pass(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 update public.visitor_passes v set cancelled_at=clock_timestamp()
 where v.id=p_id and v.redeemed_at is null and v.cancelled_at is null
 and exists(select 1 from public.residents r where r.id=v.resident_id and r.auth_user_id=auth.uid() and r.is_active);
 if not found then raise exception 'This pass cannot be cancelled'; end if;
end $$;

create or replace function public.redeem_visitor_pass(p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.visitor_passes; staff public.admins; r public.residents;
begin
 select * into staff from public.admins where auth_user_id=auth.uid() and role in ('admin','super_admin','gate_staff') order by id limit 1;
 if staff.id is null then raise exception 'Only estate staff can verify visitor entry'; end if;
 select * into v from public.visitor_passes where code=upper(trim(p_code)) for update;
 if v.id is null then raise exception 'Invalid visitor code'; end if;
 if v.cancelled_at is not null then raise exception 'This visitor code was cancelled'; end if;
 if v.redeemed_at is not null then raise exception 'This visitor code has already been used'; end if;
 if clock_timestamp()<v.starts_at or clock_timestamp()>=v.expires_at then raise exception 'This visitor code has expired or is not yet valid'; end if;
 select * into r from public.residents where id=v.resident_id for share;
 if r.is_active is not true or r.house_id is distinct from v.house_id then raise exception 'The host no longer has access to this house'; end if;
 update public.visitor_passes set redeemed_at=clock_timestamp(),redeemed_by=staff.id where id=v.id;
 return jsonb_build_object('visitor',v.visitor_name,'host',r.full_name,'address',v.address,'message','Entry recorded. This code cannot be used again.');
end $$;
revoke all on function public.create_visitor_pass(text,timestamptz),public.cancel_visitor_pass(uuid),public.redeem_visitor_pass(text) from public,anon;
grant execute on function public.create_visitor_pass(text,timestamptz),public.cancel_visitor_pass(uuid),public.redeem_visitor_pass(text) to authenticated;
commit;



-- ============================================================
-- SOURCE: supabase/migration_design_security.sql
-- ============================================================

-- Apply after existing phase migrations. No existing records are deleted.
BEGIN;
ALTER TABLE public.registration_requests ADD COLUMN IF NOT EXISTS consent_version text;
ALTER TABLE public.registration_requests ADD COLUMN IF NOT EXISTS consent_at timestamptz;
ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;
-- Public submissions now pass through the validated server endpoint.
REVOKE INSERT, UPDATE, DELETE ON public.registration_requests FROM anon;
REVOKE INSERT ON public.registration_requests FROM authenticated;
CREATE TABLE IF NOT EXISTS public.registration_rate_limits (
 key text PRIMARY KEY,
 window_start timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 1
);
ALTER TABLE public.registration_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_rate_limits FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.consume_registration_limit(p_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE count_now integer;
BEGIN
 IF p_key !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
 INSERT INTO registration_rate_limits AS limits(key,window_start,attempts)
 VALUES(p_key,now(),1)
 ON CONFLICT(key) DO UPDATE SET
 attempts=CASE WHEN limits.window_start < now()-interval '1 hour' THEN 1 ELSE limits.attempts+1 END,
 window_start=CASE WHEN limits.window_start < now()-interval '1 hour' THEN now() ELSE limits.window_start END
 RETURNING attempts INTO count_now;
 DELETE FROM registration_rate_limits WHERE window_start < now()-interval '2 days';
 RETURN count_now<=5;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_registration_limit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_registration_limit(text) TO service_role;
COMMIT;



-- ============================================================
-- SOURCE: supabase/migration_gate_dues_dates.sql
-- ============================================================

-- Apply after existing phase and design-security migrations.
BEGIN;
ALTER TABLE public.registration_requests ADD COLUMN IF NOT EXISTS move_in_date date;
ALTER TABLE public.registration_requests ADD COLUMN IF NOT EXISTS property_allocation_date date;
-- Preserve unknown historic dates. Require actual dates on new records and date edits.
CREATE OR REPLACE FUNCTION public.require_resident_dates() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.move_in_date IS NULL OR NEW.property_allocation_date IS NULL THEN
  RAISE EXCEPTION 'Move-in date and property allocation date are required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS require_resident_dates ON public.residents;
CREATE TRIGGER require_resident_dates BEFORE INSERT OR UPDATE OF move_in_date,property_allocation_date ON public.residents FOR EACH ROW EXECUTE FUNCTION public.require_resident_dates();
DROP TRIGGER IF EXISTS require_registration_dates ON public.registration_requests;
CREATE TRIGGER require_registration_dates BEFORE INSERT OR UPDATE OF move_in_date,property_allocation_date ON public.registration_requests FOR EACH ROW EXECUTE FUNCTION public.require_resident_dates();

CREATE TABLE IF NOT EXISTS public.gate_due_alerts (
 id uuid PRIMARY KEY REFERENCES public.access_logs(id) ON DELETE CASCADE,
 resident_id uuid REFERENCES public.residents(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 details jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.gate_due_emails (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 alert_id uuid NOT NULL REFERENCES public.gate_due_alerts(id) ON DELETE CASCADE,
 recipient text NOT NULL,
 audience text NOT NULL CHECK(audience IN ('resident','admin')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 first_attempt_at timestamptz,
 sent_at timestamptz,
 UNIQUE(alert_id,recipient,audience)
);
ALTER TABLE public.gate_due_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_due_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gate_due_alerts,public.gate_due_emails FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.gate_due_alerts,public.gate_due_emails TO authenticated;
GRANT ALL ON public.gate_due_alerts,public.gate_due_emails TO service_role;
DROP POLICY IF EXISTS "admins read gate debt alerts" ON public.gate_due_alerts;
CREATE POLICY "admins read gate debt alerts" ON public.gate_due_alerts FOR SELECT TO authenticated USING(public.is_estate_admin());
DROP POLICY IF EXISTS "admins read gate debt email status" ON public.gate_due_emails;
CREATE POLICY "admins read gate debt email status" ON public.gate_due_emails FOR SELECT TO authenticated USING(public.is_estate_admin());
CREATE INDEX IF NOT EXISTS gate_due_emails_pending ON public.gate_due_emails(status,available_at);

CREATE OR REPLACE FUNCTION public.queue_gate_due_alert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r residents%rowtype; address_text text; bills jsonb; balance numeric; recipient_email text;
BEGIN
 IF NEW.direction<>'entry' THEN RETURN NEW; END IF;
 SELECT * INTO r FROM residents WHERE id=NEW.resident_id;
 IF r.id IS NULL OR NOT r.is_active THEN RETURN NEW; END IF;
 SELECT address INTO address_text FROM houses WHERE id=r.house_id;
 SELECT sum(greatest(i.amount-coalesce(i.amount_paid,0),0)),
 jsonb_agg(jsonb_build_object('label',coalesce(d.name,'Estate charge'),'amount',greatest(i.amount-coalesce(i.amount_paid,0),0),'due_date',i.due_date) ORDER BY i.due_date,i.id)
 INTO balance,bills FROM invoices i LEFT JOIN due_types d ON d.id=i.due_type_id
 WHERE i.house_id=r.house_id AND i.status IN ('unpaid','partial','overdue') AND i.amount>coalesce(i.amount_paid,0);
 IF coalesce(balance,0)<=0 THEN RETURN NEW; END IF;
 INSERT INTO gate_due_alerts(id,resident_id,details) VALUES(NEW.id,r.id,jsonb_build_object(
 'name',r.full_name,'email',r.email,'phone',r.phone,'address',coalesce(address_text,'Unassigned home'),
 'entered_at',NEW.scanned_at,'balance',balance,'bills',bills));
 recipient_email:=nullif(btrim(r.email),'');
 IF recipient_email IS NULL THEN SELECT email INTO recipient_email FROM auth.users WHERE id=r.auth_user_id; END IF;
 IF recipient_email IS NOT NULL THEN INSERT INTO gate_due_emails(alert_id,recipient,audience) VALUES(NEW.id,lower(recipient_email),'resident') ON CONFLICT DO NOTHING; END IF;
 INSERT INTO gate_due_emails(alert_id,recipient,audience)
 SELECT DISTINCT NEW.id,lower(u.email),'admin' FROM admins a JOIN auth.users u ON u.id=a.auth_user_id
 WHERE a.role IN ('admin','super_admin') AND nullif(btrim(u.email),'') IS NOT NULL ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS queue_gate_due_alert ON public.access_logs;
CREATE TRIGGER queue_gate_due_alert AFTER INSERT ON public.access_logs FOR EACH ROW EXECUTE FUNCTION public.queue_gate_due_alert();

CREATE OR REPLACE FUNCTION public.record_resident_scan(p_code text,p_direction text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r residents%rowtype; log_id uuid; scanner text;
BEGIN
 IF NOT public.is_estate_staff() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF p_direction NOT IN ('entry','exit') OR p_direction IS NULL OR length(p_code)>200 THEN RAISE EXCEPTION 'Invalid scan'; END IF;
 SELECT * INTO r FROM residents WHERE qr_code_value=p_code FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'QR code not recognized'; END IF;
 IF NOT coalesce(r.is_active,false) THEN RAISE EXCEPTION 'Resident access is inactive'; END IF;
 -- Locking the resident serialises simultaneous scanners and suppresses duplicate reads.
 SELECT id INTO log_id FROM access_logs WHERE resident_id=r.id AND direction=p_direction AND scanned_at>now()-interval '8 seconds' ORDER BY scanned_at DESC LIMIT 1;
 IF log_id IS NULL THEN
 SELECT coalesce(full_name,'Gate staff') INTO scanner FROM admins WHERE auth_user_id=auth.uid() LIMIT 1;
 INSERT INTO access_logs(resident_id,direction,scanned_by) VALUES(r.id,p_direction,scanner) RETURNING id INTO log_id;
 END IF;
 RETURN jsonb_build_object('id',log_id,'name',r.full_name,'direction',p_direction);
END $$;
REVOKE ALL ON FUNCTION public.record_resident_scan(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_resident_scan(text,text) TO authenticated;
-- Every browser scan must go through the checked, deduplicated function.
REVOKE INSERT ON public.access_logs FROM authenticated,anon;

CREATE OR REPLACE FUNCTION public.claim_gate_due_emails(p_alert uuid DEFAULT NULL) RETURNS SETOF public.gate_due_emails
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- Never retry an uncertain send after the provider's 24-hour idempotency window.
 UPDATE gate_due_emails SET status='failed' WHERE status IN ('pending','sending') AND (attempts>=5 OR first_attempt_at<now()-interval '23 hours');
 RETURN QUERY WITH candidates AS (
 SELECT id FROM gate_due_emails WHERE status IN ('pending','sending') AND available_at<=now()
 AND (p_alert IS NULL OR alert_id=p_alert) ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED
 ) UPDATE gate_due_emails e SET status='sending',attempts=e.attempts+1,
 first_attempt_at=coalesce(e.first_attempt_at,now()),available_at=now()+interval '2 minutes'
 FROM candidates c WHERE e.id=c.id RETURNING e.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_gate_due_emails(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_gate_due_emails(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.queue_gate_due_alert() FROM PUBLIC,anon,authenticated;
COMMIT;



-- ============================================================
-- SOURCE: supabase/migration_address_billing_integrity.sql
-- ============================================================

-- VERDANT
-- Address, household, billing-responsibility and visitor-debt integrity upgrade.
--
-- Apply AFTER:
--   migration_phase1_6_repairs.sql
--   migration_phase7_12.sql
--   migration_gate_dues_dates.sql
--
-- This migration intentionally refuses to continue when ambiguous/duplicate
-- historical data is found. It does NOT delete or merge billing history.

BEGIN;

-- ---------------------------------------------------------------------------
-- NORMALISATION HELPERS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_address_key(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(
    regexp_replace(
      coalesce(p_text, ''),
      '[^a-zA-Z0-9]+',
      '',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.normalize_label(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(
    regexp_replace(
      btrim(coalesce(p_text, '')),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- PRE-FLIGHT INTEGRITY CHECKS
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- Every property must now use the structured address model.
  IF EXISTS (
    SELECT 1
    FROM public.houses
    WHERE street_id IS NULL
       OR house_number IS NULL
       OR btrim(house_number) = ''
  ) THEN
    RAISE EXCEPTION
      'Some houses do not have a structured street and house/block/flat number. Fix those records before applying this migration.';
  END IF;

  -- Duplicate street names such as:
  -- Palm Street / palm street / Palm-Street
  IF EXISTS (
    SELECT 1
    FROM public.streets
    GROUP BY public.normalize_address_key(name)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate street names exist. Reconcile them before applying this migration.';
  END IF;

  -- Duplicate properties on the same street.
  IF EXISTS (
    SELECT 1
    FROM public.houses
    GROUP BY
      street_id,
      public.normalize_address_key(house_number)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate houses/flats/blocks exist for the same street. Reconcile them before applying this migration.';
  END IF;

  -- More than one active owner on the same property.
  IF EXISTS (
    SELECT 1
    FROM public.residents
    WHERE is_active
      AND relationship = 'owner'
      AND house_id IS NOT NULL
    GROUP BY house_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'A household has more than one active Home Owner. Reconcile the ownership records before applying this migration.';
  END IF;

  -- Invalid existing billing delegation.
  IF EXISTS (
    SELECT 1
    FROM public.houses h
    LEFT JOIN public.residents r
      ON r.id = h.billing_responsible_resident_id
    WHERE h.billing_responsible_resident_id IS NOT NULL
      AND (
        r.id IS NULL
        OR NOT coalesce(r.is_active, false)
        OR r.house_id IS DISTINCT FROM h.id
      )
  ) THEN
    RAISE EXCEPTION
      'A house has an invalid billing-responsible resident. Fix the billing assignment before applying this migration.';
  END IF;

  -- One active resident login/email identity should correspond to one resident.
  IF EXISTS (
    SELECT 1
    FROM public.residents
    WHERE is_active
      AND nullif(btrim(email), '') IS NOT NULL
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate active resident email addresses exist. Reconcile them before applying this migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.residents
    WHERE auth_user_id IS NOT NULL
    GROUP BY auth_user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'The same Supabase Auth account is linked to more than one resident.';
  END IF;

  -- Prevent duplicate due types with cosmetic differences.
  IF EXISTS (
    SELECT 1
    FROM public.due_types
    GROUP BY public.normalize_label(name)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate due type names exist. Reconcile them before applying this migration.';
  END IF;

  -- Stronger invoice duplication check:
  -- "March 2027", " march 2027 " and "MARCH 2027" are the same period.
  IF EXISTS (
    SELECT 1
    FROM public.invoices
    WHERE period_label IS NOT NULL
    GROUP BY
      house_id,
      due_type_id,
      public.normalize_label(period_label)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate invoice periods exist after normalisation. Reconcile them before applying this migration.';
  END IF;

  -- Same pending registration email should not exist repeatedly.
  IF EXISTS (
    SELECT 1
    FROM public.registration_requests
    WHERE status = 'pending'
      AND nullif(btrim(email), '') IS NOT NULL
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate pending registration emails exist. Reconcile them before applying this migration.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- STRUCTURED ADDRESS GUARANTEES
-- ---------------------------------------------------------------------------

ALTER TABLE public.houses
  ALTER COLUMN street_id SET NOT NULL;

ALTER TABLE public.houses
  ALTER COLUMN house_number SET NOT NULL;

ALTER TABLE public.streets
  DROP CONSTRAINT IF EXISTS street_name_not_blank;

ALTER TABLE public.streets
  ADD CONSTRAINT street_name_not_blank
  CHECK (btrim(name) <> '');

ALTER TABLE public.houses
  DROP CONSTRAINT IF EXISTS house_number_not_blank;

ALTER TABLE public.houses
  ADD CONSTRAINT house_number_not_blank
  CHECK (btrim(house_number) <> '');

-- ---------------------------------------------------------------------------
-- DATABASE-LEVEL DUPLICATE PROTECTION
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS address_integrity_street_unique
ON public.streets (
  public.normalize_address_key(name)
);

CREATE UNIQUE INDEX IF NOT EXISTS address_integrity_house_unique
ON public.houses (
  street_id,
  public.normalize_address_key(house_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS address_integrity_one_active_owner
ON public.residents (house_id)
WHERE is_active
  AND relationship = 'owner'
  AND house_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS address_integrity_active_resident_email
ON public.residents (lower(btrim(email)))
WHERE is_active
  AND nullif(btrim(email), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS address_integrity_resident_auth_user
ON public.residents (auth_user_id)
WHERE auth_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS address_integrity_due_type_name
ON public.due_types (
  public.normalize_label(name)
);

CREATE UNIQUE INDEX IF NOT EXISTS address_integrity_invoice_period
ON public.invoices (
  house_id,
  due_type_id,
  public.normalize_label(period_label)
)
WHERE period_label IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS address_integrity_pending_registration_email
ON public.registration_requests (lower(btrim(email)))
WHERE status = 'pending'
  AND nullif(btrim(email), '') IS NOT NULL;

-- Keep the original exact invoice uniqueness protection as well.
CREATE UNIQUE INDEX IF NOT EXISTS repair_invoice_period_unique
ON public.invoices (
  house_id,
  due_type_id,
  period_label
);

-- ---------------------------------------------------------------------------
-- NORMALISE STREET NAMES
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_street_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.name :=
    regexp_replace(
      btrim(NEW.name),
      '[[:space:]]+',
      ' ',
      'g'
    );

  IF NEW.name = '' THEN
    RAISE EXCEPTION 'Street name cannot be empty';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_street_row
ON public.streets;

CREATE TRIGGER normalize_street_row
BEFORE INSERT OR UPDATE OF name
ON public.streets
FOR EACH ROW
EXECUTE FUNCTION public.normalize_street_row();

-- ---------------------------------------------------------------------------
-- ADDRESS IS DERIVED FROM STREET + HOUSE/BLOCK/FLAT NUMBER
--
-- This means somebody cannot change houses.address directly and create a
-- conflict between the displayed address and the actual structured address.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_house_address()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  street_name text;
BEGIN
  IF NEW.street_id IS NULL THEN
    RAISE EXCEPTION 'Every property must belong to a street';
  END IF;

  NEW.house_number :=
    regexp_replace(
      btrim(NEW.house_number),
      '[[:space:]]+',
      ' ',
      'g'
    );

  IF NEW.house_number = '' THEN
    RAISE EXCEPTION 'Enter a house, block or flat number';
  END IF;

  SELECT s.name
  INTO street_name
  FROM public.streets s
  WHERE s.id = NEW.street_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Street not found';
  END IF;

  NEW.address := NEW.house_number || ', ' || street_name;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_house_address
ON public.houses;

CREATE TRIGGER sync_house_address
BEFORE INSERT OR UPDATE OF street_id, house_number, address
ON public.houses
FOR EACH ROW
EXECUTE FUNCTION public.sync_house_address();

-- Re-sync existing display addresses using their structured property fields.
UPDATE public.houses
SET address = address;

-- ---------------------------------------------------------------------------
-- BILLING RESPONSIBILITY
--
-- Ownership and billing responsibility are separate concepts.
--
-- billing_responsible_resident_id NULL:
--   active Home Owner is responsible
--
-- billing_responsible_resident_id NOT NULL:
--   ONLY that active resident is the resident-side billing contact.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_house_billing_responsible()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.billing_responsible_resident_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.residents r
       WHERE r.id = NEW.billing_responsible_resident_id
         AND r.house_id = NEW.id
         AND r.is_active
     )
  THEN
    RAISE EXCEPTION
      'Billing contact must be an active resident of this household';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_house_billing_responsible
ON public.houses;

CREATE TRIGGER validate_house_billing_responsible
BEFORE INSERT OR UPDATE OF billing_responsible_resident_id
ON public.houses
FOR EACH ROW
EXECUTE FUNCTION public.validate_house_billing_responsible();

-- Automatically clear a billing delegation if that resident becomes inactive
-- or moves to another house.
CREATE OR REPLACE FUNCTION public.clear_invalid_billing_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.house_id IS NOT NULL
     AND (
       NEW.house_id IS DISTINCT FROM OLD.house_id
       OR NEW.is_active IS NOT TRUE
     )
  THEN
    UPDATE public.houses
    SET billing_responsible_resident_id = NULL
    WHERE id = OLD.house_id
      AND billing_responsible_resident_id = OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_invalid_billing_assignment
ON public.residents;

CREATE TRIGGER clear_invalid_billing_assignment
BEFORE UPDATE OF house_id, is_active
ON public.residents
FOR EACH ROW
EXECUTE FUNCTION public.clear_invalid_billing_assignment();

CREATE OR REPLACE FUNCTION public.can_pay_house(p_house uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.residents r
    JOIN public.houses h
      ON h.id = r.house_id
    WHERE r.auth_user_id = auth.uid()
      AND r.is_active
      AND h.id = p_house
      AND (
        (
          h.billing_responsible_resident_id IS NOT NULL
          AND h.billing_responsible_resident_id = r.id
        )
        OR
        (
          h.billing_responsible_resident_id IS NULL
          AND r.relationship = 'owner'
        )
      )
  );
$$;

REVOKE ALL
ON FUNCTION public.can_pay_house(uuid)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.can_pay_house(uuid)
TO authenticated;

-- ---------------------------------------------------------------------------
-- RESOLVE A REGISTRATION ADDRESS
--
-- If the property already exists, reuse the same house_id.
-- Do NOT create a second house with the same address.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_registration_house(
  p_street_id uuid,
  p_house_number text,
  p_house_type text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  house_uuid uuid;
  number_text text;
  street_name text;
BEGIN
  IF p_street_id IS NULL THEN
    RAISE EXCEPTION 'Select a street';
  END IF;

  number_text :=
    regexp_replace(
      btrim(coalesce(p_house_number, '')),
      '[[:space:]]+',
      ' ',
      'g'
    );

  IF number_text = '' THEN
    RAISE EXCEPTION 'Enter a house, block or flat number';
  END IF;

  SELECT name
  INTO street_name
  FROM public.streets
  WHERE id = p_street_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Street not found';
  END IF;

  -- Serialise creation for this exact property.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_street_id::text || ':' ||
      public.normalize_address_key(number_text),
      0
    )
  );

  SELECT h.id
  INTO house_uuid
  FROM public.houses h
  WHERE h.street_id = p_street_id
    AND public.normalize_address_key(h.house_number)
        = public.normalize_address_key(number_text)
  LIMIT 1;

  IF house_uuid IS NOT NULL THEN
    RETURN house_uuid;
  END IF;

  INSERT INTO public.houses (
    address,
    house_type,
    street_id,
    house_number
  )
  VALUES (
    number_text,
    nullif(btrim(p_house_type), ''),
    p_street_id,
    number_text
  )
  RETURNING id
  INTO house_uuid;

  RETURN house_uuid;
END;
$$;

REVOKE ALL
ON FUNCTION public.resolve_registration_house(uuid, text, text)
FROM public, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.resolve_registration_house(uuid, text, text)
TO service_role;

-- ---------------------------------------------------------------------------
-- NEW RESIDENT CREATION
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_estate_resident(
  p_house_id uuid,
  p_house jsonb,
  p_resident jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  house_uuid uuid := p_house_id;
  resident_uuid uuid;
  street_uuid uuid;
  street_name text;
  number_text text;
  resident_name text;
  resident_phone text;
  resident_email text;
  resident_relationship text;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  resident_name := btrim(p_resident->>'full_name');
  resident_phone := btrim(p_resident->>'phone');
  resident_email := lower(btrim(p_resident->>'email'));
  resident_relationship := p_resident->>'relationship';

  IF coalesce(resident_name, '') = ''
     OR coalesce(resident_phone, '') = ''
     OR coalesce(resident_email, '') !~ '^[^ @]+@[^ @]+\.[^ @]+$'
     OR coalesce(resident_relationship, '')
        NOT IN ('owner', 'tenant', 'family_member')
  THEN
    RAISE EXCEPTION 'Enter valid resident details';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.residents
    WHERE is_active
      AND lower(btrim(email)) = resident_email
  ) THEN
    RAISE EXCEPTION
      'An active resident already uses this email address';
  END IF;

  IF house_uuid IS NULL THEN
    street_uuid := (p_house->>'street_id')::uuid;

    number_text :=
      regexp_replace(
        btrim(coalesce(p_house->>'house_number', '')),
        '[[:space:]]+',
        ' ',
        'g'
      );

    IF street_uuid IS NULL THEN
      RAISE EXCEPTION 'Select a street';
    END IF;

    IF number_text = '' THEN
      RAISE EXCEPTION 'Enter a house, block or flat number';
    END IF;

    SELECT name
    INTO street_name
    FROM public.streets
    WHERE id = street_uuid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Street not found';
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        street_uuid::text || ':' ||
        public.normalize_address_key(number_text),
        0
      )
    );

    IF EXISTS (
      SELECT 1
      FROM public.houses h
      WHERE h.street_id = street_uuid
        AND public.normalize_address_key(h.house_number)
            = public.normalize_address_key(number_text)
    ) THEN
      RAISE EXCEPTION
        'This property already exists. Select it from the Household dropdown instead of creating another one.';
    END IF;

    INSERT INTO public.houses (
      address,
      house_type,
      street_id,
      house_number
    )
    VALUES (
      number_text,
      nullif(btrim(p_house->>'house_type'), ''),
      street_uuid,
      number_text
    )
    RETURNING id
    INTO house_uuid;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.houses
      WHERE id = house_uuid
    ) THEN
      RAISE EXCEPTION 'Household not found';
    END IF;
  END IF;

  IF resident_relationship = 'owner'
     AND EXISTS (
       SELECT 1
       FROM public.residents
       WHERE house_id = house_uuid
         AND is_active
         AND relationship = 'owner'
     )
  THEN
    RAISE EXCEPTION
      'This household already has an active Home Owner';
  END IF;

  INSERT INTO public.residents (
    house_id,
    full_name,
    phone,
    email,
    relationship,
    vehicle_plate_numbers,
    emergency_contact_name,
    emergency_contact_phone,
    move_in_date,
    property_allocation_date,
    qr_code_value
  )
  VALUES (
    house_uuid,
    resident_name,
    resident_phone,
    resident_email,
    resident_relationship,
    ARRAY(
      SELECT btrim(value)
      FROM jsonb_array_elements_text(
        coalesce(
          p_resident->'vehicle_plate_numbers',
          '[]'::jsonb
        )
      ) AS value
      WHERE btrim(value) <> ''
    ),
    nullif(btrim(p_resident->>'emergency_contact_name'), ''),
    nullif(btrim(p_resident->>'emergency_contact_phone'), ''),
    nullif(p_resident->>'move_in_date', '')::date,
    nullif(p_resident->>'property_allocation_date', '')::date,
    'RES-' || gen_random_uuid()::text
  )
  RETURNING id
  INTO resident_uuid;

  RETURN resident_uuid;
END;
$$;

REVOKE ALL
ON FUNCTION public.add_estate_resident(uuid, jsonb, jsonb)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.add_estate_resident(uuid, jsonb, jsonb)
TO authenticated;

-- ---------------------------------------------------------------------------
-- EDIT/MOVE RESIDENT
--
-- IMPORTANT:
-- Editing a resident does NOT rename their old house.
-- Changing p_house_id actually moves the resident to another household.
-- Existing invoices stay attached to their original house_id.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_estate_resident(
  p_resident_id uuid,
  p_house_id uuid,
  p_resident jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_resident public.residents%rowtype;
  resident_name text;
  resident_phone text;
  resident_email text;
  resident_relationship text;
  move_date date;
  allocation_date date;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT *
  INTO current_resident
  FROM public.residents
  WHERE id = p_resident_id
  FOR UPDATE;

  IF current_resident.id IS NULL THEN
    RAISE EXCEPTION 'Resident not found';
  END IF;

  IF p_house_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.houses
       WHERE id = p_house_id
     )
  THEN
    RAISE EXCEPTION 'Select a valid household';
  END IF;

  resident_name := btrim(p_resident->>'full_name');
  resident_phone := btrim(p_resident->>'phone');
  resident_email := lower(btrim(p_resident->>'email'));
  resident_relationship := p_resident->>'relationship';

  move_date := nullif(p_resident->>'move_in_date', '')::date;
  allocation_date :=
    nullif(p_resident->>'property_allocation_date', '')::date;

  IF coalesce(resident_name, '') = ''
     OR coalesce(resident_phone, '') = ''
     OR coalesce(resident_email, '') !~ '^[^ @]+@[^ @]+\.[^ @]+$'
     OR resident_relationship
        NOT IN ('owner', 'tenant', 'family_member')
     OR move_date IS NULL
     OR allocation_date IS NULL
  THEN
    RAISE EXCEPTION 'Enter valid resident details';
  END IF;

  IF current_resident.is_active
     AND EXISTS (
       SELECT 1
       FROM public.residents r
       WHERE r.id <> p_resident_id
         AND r.is_active
         AND lower(btrim(r.email)) = resident_email
     )
  THEN
    RAISE EXCEPTION
      'Another active resident already uses this email address';
  END IF;

  IF current_resident.is_active
     AND resident_relationship = 'owner'
     AND EXISTS (
       SELECT 1
       FROM public.residents r
       WHERE r.id <> p_resident_id
         AND r.house_id = p_house_id
         AND r.is_active
         AND r.relationship = 'owner'
     )
  THEN
    RAISE EXCEPTION
      'The selected household already has an active Home Owner';
  END IF;

  UPDATE public.residents
  SET
    house_id = p_house_id,
    full_name = resident_name,
    phone = resident_phone,
    email = resident_email,
    relationship = resident_relationship,
    vehicle_plate_numbers = ARRAY(
      SELECT btrim(value)
      FROM jsonb_array_elements_text(
        coalesce(
          p_resident->'vehicle_plate_numbers',
          '[]'::jsonb
        )
      ) AS value
      WHERE btrim(value) <> ''
    ),
    emergency_contact_name =
      nullif(btrim(p_resident->>'emergency_contact_name'), ''),
    emergency_contact_phone =
      nullif(btrim(p_resident->>'emergency_contact_phone'), ''),
    move_in_date = move_date,
    property_allocation_date = allocation_date
  WHERE id = p_resident_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.update_estate_resident(uuid, uuid, jsonb)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.update_estate_resident(uuid, uuid, jsonb)
TO authenticated;

-- ---------------------------------------------------------------------------
-- PAYMENT PREPARATION
--
-- When billing is delegated, the owner no longer remains a second
-- resident-side payer. There is one billing contact for the household.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prepare_estate_payment(
  p_auth_user uuid,
  p_items jsonb,
  p_reference text,
  p_expected_kobo bigint,
  p_quote_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r residents%rowtype;
  h houses%rowtype;
  item jsonb;
  inv invoices%rowtype;
  dt due_types%rowtype;
  m date;
  period text;
  due date;
  amount_due numeric;
  total_kobo bigint := 0;
  line_kobo bigint;
  lines jsonb := '[]'::jsonb;
  seen text[] := '{}';
  key text;
  current_month date :=
    date_trunc(
      'month',
      now() AT TIME ZONE 'Africa/Lagos'
    )::date;
BEGIN
  SELECT *
  INTO STRICT r
  FROM public.residents
  WHERE auth_user_id = p_auth_user
    AND is_active;

  SELECT *
  INTO STRICT h
  FROM public.houses
  WHERE id = r.house_id
  FOR UPDATE;

  IF h.billing_responsible_resident_id IS NOT NULL THEN
    IF h.billing_responsible_resident_id IS DISTINCT FROM r.id THEN
      RAISE EXCEPTION
        'You are not the billing contact for this household';
    END IF;
  ELSIF r.relationship IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION
      'You are not responsible for this household''s bills';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 120
  THEN
    RAISE EXCEPTION 'Choose between 1 and 120 payment items';
  END IF;

  IF NOT p_quote_only
     AND (
       p_reference IS NULL
       OR length(p_reference) < 10
     )
  THEN
    RAISE EXCEPTION 'Missing payment reference';
  END IF;

  FOR item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
  LOOP
    inv := NULL;

    IF item ? 'invoice_id' THEN
      SELECT *
      INTO STRICT inv
      FROM public.invoices
      WHERE id = (item->>'invoice_id')::uuid
        AND house_id = h.id
      FOR UPDATE;

      amount_due := (item->>'amount')::numeric;

      IF amount_due IS NULL
         OR amount_due::text IN (
           'NaN',
           'Infinity',
           '-Infinity'
         )
         OR amount_due <= 0
         OR round(amount_due, 2) <> amount_due
         OR amount_due >
            inv.amount - coalesce(inv.amount_paid, 0)
      THEN
        RAISE EXCEPTION
          'Enter an amount within the outstanding balance, with at most two decimal places';
      END IF;

      SELECT *
      INTO STRICT dt
      FROM public.due_types
      WHERE id = inv.due_type_id;

      period := inv.period_label;
      due := inv.due_date;
    ELSE
      SELECT *
      INTO STRICT dt
      FROM public.due_types
      WHERE id = (item->>'due_type_id')::uuid
        AND name IN ('Service Charge', 'CDA Levy');

      IF coalesce(item->>'month', '')
         !~ '^\d{4}-(0[1-9]|1[0-2])$'
      THEN
        RAISE EXCEPTION 'Invalid billing month';
      END IF;

      m := ((item->>'month') || '-01')::date;

      IF m < current_month
         OR m >= current_month + interval '60 months'
      THEN
        RAISE EXCEPTION
          'Choose a month within the next five years';
      END IF;

      period := to_char(m, 'FMMonth YYYY');
      due := (m + interval '1 month - 1 day')::date;

      SELECT *
      INTO inv
      FROM public.invoices
      WHERE house_id = h.id
        AND due_type_id = dt.id
        AND public.normalize_label(period_label)
            = public.normalize_label(period)
      FOR UPDATE;

      amount_due :=
        CASE
          WHEN inv.id IS NULL
          THEN dt.amount
          ELSE greatest(
            0,
            inv.amount - coalesce(inv.amount_paid, 0)
          )
        END;
    END IF;

    key :=
      dt.id::text || ':' ||
      coalesce(
        public.normalize_label(period),
        inv.id::text
      );

    IF key = ANY(seen) THEN
      RAISE EXCEPTION
        'The same bill was selected more than once';
    END IF;

    seen := array_append(seen, key);

    IF amount_due < 0 OR dt.amount <= 0 THEN
      RAISE EXCEPTION 'Invalid charge amount';
    END IF;

    line_kobo :=
      round(amount_due * 100)::bigint;

    total_kobo :=
      total_kobo + line_kobo;

    IF NOT p_quote_only
       AND line_kobo > 0
       AND inv.id IS NULL
    THEN
      INSERT INTO public.invoices (
        house_id,
        due_type_id,
        period_label,
        amount,
        due_date,
        status
      )
      VALUES (
        h.id,
        dt.id,
        period,
        dt.amount,
        due,
        'unpaid'
      )
      RETURNING *
      INTO inv;
    END IF;

    lines :=
      lines ||
      jsonb_build_array(
        jsonb_build_object(
          'invoice_id',
          inv.id,
          'charge',
          dt.name,
          'period',
          period,
          'amount_kobo',
          line_kobo
        )
      );
  END LOOP;

  IF NOT p_quote_only THEN
    IF total_kobo <= 0 THEN
      RAISE EXCEPTION 'Nothing left to pay for';
    END IF;

    IF p_expected_kobo IS NULL
       OR total_kobo <> p_expected_kobo
    THEN
      RAISE EXCEPTION
        'Your balance changed. Review the payment amount again.';
    END IF;

    INSERT INTO public.payments (
      invoice_id,
      resident_id,
      amount,
      paystack_reference,
      status
    )
    SELECT
      (x->>'invoice_id')::uuid,
      r.id,
      (x->>'amount_kobo')::numeric / 100,
      p_reference,
      'pending'
    FROM jsonb_array_elements(lines) x
    WHERE (x->>'amount_kobo')::bigint > 0;
  END IF;

  RETURN jsonb_build_object(
    'total_kobo',
    total_kobo,
    'lines',
    lines,
    'resident_id',
    r.id,
    'email',
    r.email
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.prepare_estate_payment(
  uuid,
  jsonb,
  text,
  bigint,
  boolean
)
FROM public, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.prepare_estate_payment(
  uuid,
  jsonb,
  text,
  bigint,
  boolean
)
TO service_role;

-- ---------------------------------------------------------------------------
-- GATE ALERTS NOW SUPPORT BOTH RESIDENT AND VISITOR ENTRY
-- ---------------------------------------------------------------------------

ALTER TABLE public.gate_due_alerts
  DROP CONSTRAINT IF EXISTS gate_due_alerts_id_fkey;

ALTER TABLE public.gate_due_alerts
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.gate_due_alerts
  ADD COLUMN IF NOT EXISTS source_type text;

ALTER TABLE public.gate_due_alerts
  ADD COLUMN IF NOT EXISTS source_id uuid;

UPDATE public.gate_due_alerts
SET
  source_type = coalesce(source_type, 'resident'),
  source_id = coalesce(source_id, id);

ALTER TABLE public.gate_due_alerts
  ALTER COLUMN source_type
  SET DEFAULT 'resident';

ALTER TABLE public.gate_due_alerts
  ALTER COLUMN source_type
  SET NOT NULL;

ALTER TABLE public.gate_due_alerts
  ALTER COLUMN source_id
  SET NOT NULL;

ALTER TABLE public.gate_due_alerts
  DROP CONSTRAINT IF EXISTS gate_due_alerts_source_type_check;

ALTER TABLE public.gate_due_alerts
  ADD CONSTRAINT gate_due_alerts_source_type_check
  CHECK (
    source_type IN ('resident', 'visitor')
  );

CREATE UNIQUE INDEX IF NOT EXISTS gate_due_alert_source_unique
ON public.gate_due_alerts (
  source_type,
  source_id
);

-- ---------------------------------------------------------------------------
-- RESIDENT ENTRY BILLING ALERT
--
-- The email now goes to the actual household billing contact:
--   delegated resident if present
--   otherwise active owner
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.queue_gate_due_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.residents%rowtype;
  h public.houses%rowtype;
  billing public.residents%rowtype;
  bills jsonb;
  balance numeric;
  recipient_email text;
  alert_uuid uuid;
BEGIN
  IF NEW.direction <> 'entry' THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO r
  FROM public.residents
  WHERE id = NEW.resident_id;

  IF r.id IS NULL
     OR NOT r.is_active
     OR r.house_id IS NULL
  THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO h
  FROM public.houses
  WHERE id = r.house_id;

  IF h.id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    coalesce(
      sum(
        greatest(
          i.amount - coalesce(i.amount_paid, 0),
          0
        )
      ),
      0
    ),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'label',
          coalesce(d.name, 'Estate charge'),
          'amount',
          greatest(
            i.amount - coalesce(i.amount_paid, 0),
            0
          ),
          'due_date',
          i.due_date
        )
        ORDER BY i.due_date, i.id
      ) FILTER (
        WHERE i.id IS NOT NULL
      ),
      '[]'::jsonb
    )
  INTO balance, bills
  FROM public.invoices i
  LEFT JOIN public.due_types d
    ON d.id = i.due_type_id
  WHERE i.house_id = r.house_id
    AND i.status IN (
      'unpaid',
      'partial',
      'overdue'
    )
    AND i.amount > coalesce(i.amount_paid, 0);

  IF coalesce(balance, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT br.*
  INTO billing
  FROM public.residents br
  WHERE br.house_id = h.id
    AND br.is_active
    AND (
      (
        h.billing_responsible_resident_id IS NOT NULL
        AND br.id = h.billing_responsible_resident_id
      )
      OR
      (
        h.billing_responsible_resident_id IS NULL
        AND br.relationship = 'owner'
      )
    )
  LIMIT 1;

  recipient_email :=
    nullif(
      btrim(billing.email),
      ''
    );

  IF recipient_email IS NULL
     AND billing.auth_user_id IS NOT NULL
  THEN
    SELECT u.email
    INTO recipient_email
    FROM auth.users u
    WHERE u.id = billing.auth_user_id;
  END IF;

  INSERT INTO public.gate_due_alerts (
    resident_id,
    source_type,
    source_id,
    details
  )
  VALUES (
    r.id,
    'resident',
    NEW.id,
    jsonb_build_object(
      'source_type',
      'resident',
      'name',
      r.full_name,
      'host',
      NULL,
      'billing_contact_name',
      billing.full_name,
      'email',
      recipient_email,
      'phone',
      billing.phone,
      'address',
      h.address,
      'entered_at',
      NEW.scanned_at,
      'balance',
      balance,
      'bills',
      bills
    )
  )
  RETURNING id
  INTO alert_uuid;

  IF recipient_email IS NOT NULL THEN
    INSERT INTO public.gate_due_emails (
      alert_id,
      recipient,
      audience
    )
    VALUES (
      alert_uuid,
      lower(recipient_email),
      'resident'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.gate_due_emails (
    alert_id,
    recipient,
    audience
  )
  SELECT DISTINCT
    alert_uuid,
    lower(u.email),
    'admin'
  FROM public.admins a
  JOIN auth.users u
    ON u.id = a.auth_user_id
  WHERE a.role IN (
    'admin',
    'super_admin'
  )
    AND nullif(btrim(u.email), '') IS NOT NULL
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- VISITOR REDEMPTION + UNPAID-DUES WARNING
--
-- IMPORTANT:
-- Visitor entry is STILL APPROVED.
-- Outstanding dues produce an alert but DO NOT block the visitor.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.redeem_visitor_pass(
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.visitor_passes%rowtype;
  staff public.admins%rowtype;
  host_resident public.residents%rowtype;
  billing public.residents%rowtype;
  h public.houses%rowtype;
  bills jsonb := '[]'::jsonb;
  balance numeric := 0;
  recipient_email text;
  alert_uuid uuid;
  entered_at timestamptz := clock_timestamp();
BEGIN
  SELECT *
  INTO staff
  FROM public.admins
  WHERE auth_user_id = auth.uid()
    AND role IN (
      'admin',
      'super_admin',
      'gate_staff'
    )
  ORDER BY id
  LIMIT 1;

  IF staff.id IS NULL THEN
    RAISE EXCEPTION
      'Only estate staff can verify visitor entry';
  END IF;

  SELECT *
  INTO v
  FROM public.visitor_passes
  WHERE code = upper(trim(p_code))
  FOR UPDATE;

  IF v.id IS NULL THEN
    RAISE EXCEPTION 'Invalid visitor code';
  END IF;

  IF v.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION
      'This visitor code was cancelled';
  END IF;

  IF v.redeemed_at IS NOT NULL THEN
    RAISE EXCEPTION
      'This visitor code has already been used';
  END IF;

  IF entered_at < v.starts_at
     OR entered_at >= v.expires_at
  THEN
    RAISE EXCEPTION
      'This visitor code has expired or is not yet valid';
  END IF;

  SELECT *
  INTO host_resident
  FROM public.residents
  WHERE id = v.resident_id
  FOR SHARE;

  IF host_resident.is_active IS NOT TRUE
     OR host_resident.house_id IS DISTINCT FROM v.house_id
  THEN
    RAISE EXCEPTION
      'The host no longer has access to this house';
  END IF;

  SELECT *
  INTO h
  FROM public.houses
  WHERE id = v.house_id;

  IF h.id IS NULL THEN
    RAISE EXCEPTION
      'The household record is unavailable';
  END IF;

  SELECT
    coalesce(
      sum(
        greatest(
          i.amount - coalesce(i.amount_paid, 0),
          0
        )
      ),
      0
    ),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'label',
          coalesce(d.name, 'Estate charge'),
          'amount',
          greatest(
            i.amount - coalesce(i.amount_paid, 0),
            0
          ),
          'due_date',
          i.due_date
        )
        ORDER BY i.due_date, i.id
      ) FILTER (
        WHERE i.id IS NOT NULL
      ),
      '[]'::jsonb
    )
  INTO balance, bills
  FROM public.invoices i
  LEFT JOIN public.due_types d
    ON d.id = i.due_type_id
  WHERE i.house_id = v.house_id
    AND i.status IN (
      'unpaid',
      'partial',
      'overdue'
    )
    AND i.amount > coalesce(i.amount_paid, 0);

  -- Valid visitor is admitted regardless of household debt.
  UPDATE public.visitor_passes
  SET
    redeemed_at = entered_at,
    redeemed_by = staff.id
  WHERE id = v.id;

  IF balance > 0 THEN
    SELECT br.*
    INTO billing
    FROM public.residents br
    WHERE br.house_id = h.id
      AND br.is_active
      AND (
        (
          h.billing_responsible_resident_id IS NOT NULL
          AND br.id = h.billing_responsible_resident_id
        )
        OR
        (
          h.billing_responsible_resident_id IS NULL
          AND br.relationship = 'owner'
        )
      )
    LIMIT 1;

    recipient_email :=
      nullif(
        btrim(billing.email),
        ''
      );

    IF recipient_email IS NULL
       AND billing.auth_user_id IS NOT NULL
    THEN
      SELECT u.email
      INTO recipient_email
      FROM auth.users u
      WHERE u.id = billing.auth_user_id;
    END IF;

    INSERT INTO public.gate_due_alerts (
      resident_id,
      source_type,
      source_id,
      details
    )
    VALUES (
      host_resident.id,
      'visitor',
      v.id,
      jsonb_build_object(
        'source_type',
        'visitor',
        'name',
        v.visitor_name,
        'host',
        host_resident.full_name,
        'billing_contact_name',
        billing.full_name,
        'email',
        recipient_email,
        'phone',
        billing.phone,
        'address',
        h.address,
        'entered_at',
        entered_at,
        'balance',
        balance,
        'bills',
        bills
      )
    )
    RETURNING id
    INTO alert_uuid;

    IF recipient_email IS NOT NULL THEN
      INSERT INTO public.gate_due_emails (
        alert_id,
        recipient,
        audience
      )
      VALUES (
        alert_uuid,
        lower(recipient_email),
        'resident'
      )
      ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO public.gate_due_emails (
      alert_id,
      recipient,
      audience
    )
    SELECT DISTINCT
      alert_uuid,
      lower(u.email),
      'admin'
    FROM public.admins a
    JOIN auth.users u
      ON u.id = a.auth_user_id
    WHERE a.role IN (
      'admin',
      'super_admin'
    )
      AND nullif(btrim(u.email), '') IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'visitor',
    v.visitor_name,
    'host',
    host_resident.full_name,
    'address',
    h.address,
    'message',
    'Entry recorded. This code cannot be used again.',
    'has_outstanding',
    balance > 0,
    'balance',
    balance,
    'alert_queued',
    balance > 0
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.redeem_visitor_pass(text)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.redeem_visitor_pass(text)
TO authenticated;

COMMIT;


-- ============================================================
-- SOURCE: supabase/migration_registration_visitor_upgrade.sql
-- ============================================================

-- VERDANT
-- Registration, structured resident location, visitor phone,
-- visitor-debt notification and house-number cleanup.
--
-- IMPORTANT:
-- Run AFTER migration_address_billing_integrity.sql.
--
-- BILLING RULE:
-- Invoices belong to houses.
-- Block/Flat are resident-location information and DO NOT create
-- separate billing accounts.

BEGIN;

-- =========================================================
-- HOUSE NUMBER NORMALISATION
-- =========================================================

CREATE OR REPLACE FUNCTION public.canonical_house_number(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  value_text text;
BEGIN
  value_text :=
    lower(
      regexp_replace(
        btrim(coalesce(p_text, '')),
        '[[:space:]]+',
        ' ',
        'g'
      )
    );

  value_text :=
    regexp_replace(
      value_text,
      '^house[[:space:]#-]*',
      '',
      'i'
    );

  IF value_text ~ '^[0-9]+$' THEN
    RETURN (value_text::integer)::text;
  END IF;

  RETURN public.normalize_address_key(p_text);
END;
$$;

-- Detect legacy duplicates such as:
-- 18
-- House 18
-- house-18
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.houses
    WHERE street_id IS NOT NULL
    GROUP BY
      street_id,
      public.canonical_house_number(house_number)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate house records exist after house-number normalisation. Reconcile them before applying this migration.';
  END IF;
END $$;

DROP INDEX IF EXISTS public.address_integrity_house_unique;

CREATE UNIQUE INDEX address_integrity_house_unique
ON public.houses (
  street_id,
  public.canonical_house_number(house_number)
);

-- =========================================================
-- RESIDENT-SPECIFIC BLOCK / FLAT
--
-- House is the billing unit.
-- Block and flat do NOT affect invoice uniqueness.
-- =========================================================

ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS block_number text;

ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS flat_number text;

ALTER TABLE public.registration_requests
  ADD COLUMN IF NOT EXISTS block_number text;

ALTER TABLE public.registration_requests
  ADD COLUMN IF NOT EXISTS flat_number text;

ALTER TABLE public.registration_requests
  ADD COLUMN IF NOT EXISTS vehicle_plate_numbers text[];

ALTER TABLE public.registration_requests
  ADD COLUMN IF NOT EXISTS emergency_contact_name text;

ALTER TABLE public.registration_requests
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text;

ALTER TABLE public.residents
  DROP CONSTRAINT IF EXISTS residents_block_number_check;

ALTER TABLE public.residents
  ADD CONSTRAINT residents_block_number_check
  CHECK (
    block_number IS NULL
    OR block_number ~ '^(10|[1-9])$'
  );

ALTER TABLE public.residents
  DROP CONSTRAINT IF EXISTS residents_flat_number_check;

ALTER TABLE public.residents
  ADD CONSTRAINT residents_flat_number_check
  CHECK (
    flat_number IS NULL
    OR flat_number ~ '^(10|[1-9])$'
  );

ALTER TABLE public.registration_requests
  DROP CONSTRAINT IF EXISTS registration_block_number_check;

ALTER TABLE public.registration_requests
  ADD CONSTRAINT registration_block_number_check
  CHECK (
    block_number IS NULL
    OR block_number ~ '^(10|[1-9])$'
  );

ALTER TABLE public.registration_requests
  DROP CONSTRAINT IF EXISTS registration_flat_number_check;

ALTER TABLE public.registration_requests
  ADD CONSTRAINT registration_flat_number_check
  CHECK (
    flat_number IS NULL
    OR flat_number ~ '^(10|[1-9])$'
  );

-- =========================================================
-- DISPLAY ADDRESS FOR A RESIDENT
--
-- Example:
-- House 18, Block 2, Flat 4, Chateau Street
--
-- The actual billing house remains just one house_id.
-- =========================================================

CREATE OR REPLACE FUNCTION public.resident_display_address(
  p_house_id uuid,
  p_block_number text DEFAULT NULL,
  p_flat_number text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  h public.houses%rowtype;
  street_name text;
  house_label text;
  result_text text;
BEGIN
  SELECT *
  INTO h
  FROM public.houses
  WHERE id = p_house_id;

  IF h.id IS NULL THEN
    RETURN 'Unknown household';
  END IF;

  SELECT name
  INTO street_name
  FROM public.streets
  WHERE id = h.street_id;

  house_label :=
    CASE
      WHEN lower(btrim(h.house_number)) LIKE 'house %'
        THEN btrim(h.house_number)
      WHEN btrim(h.house_number) ~ '^[0-9]+$'
        THEN 'House ' || btrim(h.house_number)
      ELSE btrim(h.house_number)
    END;

  result_text := house_label;

  IF nullif(btrim(p_block_number), '') IS NOT NULL THEN
    result_text :=
      result_text || ', Block ' || btrim(p_block_number);
  END IF;

  IF nullif(btrim(p_flat_number), '') IS NOT NULL THEN
    result_text :=
      result_text || ', Flat ' || btrim(p_flat_number);
  END IF;

  IF nullif(btrim(street_name), '') IS NOT NULL THEN
    result_text :=
      result_text || ', ' || btrim(street_name);
  END IF;

  RETURN result_text;
END;
$$;

-- =========================================================
-- HOUSE DISPLAY ADDRESS
-- =========================================================

CREATE OR REPLACE FUNCTION public.sync_house_address()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  street_name text;
  number_text text;
BEGIN
  IF NEW.street_id IS NULL THEN
    RAISE EXCEPTION 'Every property must belong to a street';
  END IF;

  number_text :=
    regexp_replace(
      btrim(coalesce(NEW.house_number, '')),
      '[[:space:]]+',
      ' ',
      'g'
    );

  IF number_text = '' THEN
    RAISE EXCEPTION 'Select a house number';
  END IF;

  SELECT s.name
  INTO street_name
  FROM public.streets s
  WHERE s.id = NEW.street_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Street not found';
  END IF;

  NEW.house_number := number_text;

  NEW.address :=
    CASE
      WHEN lower(number_text) LIKE 'house %'
        THEN number_text || ', ' || street_name
      WHEN number_text ~ '^[0-9]+$'
        THEN 'House ' || number_text || ', ' || street_name
      ELSE number_text || ', ' || street_name
    END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_house_address
ON public.houses;

CREATE TRIGGER sync_house_address
BEFORE INSERT OR UPDATE OF street_id, house_number, address
ON public.houses
FOR EACH ROW
EXECUTE FUNCTION public.sync_house_address();

UPDATE public.houses
SET address = address;

-- =========================================================
-- RESOLVE HOUSE FROM PUBLIC REGISTRATION
--
-- House Number + Street = billing house identity.
-- Block and Flat deliberately do NOT participate.
--
-- Therefore:
-- Owner + Tenant + Relative registering House 18
-- independently all resolve to the same house_id.
-- =========================================================

CREATE OR REPLACE FUNCTION public.resolve_registration_house(
  p_street_id uuid,
  p_house_number text,
  p_house_type text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  house_uuid uuid;
  number_integer integer;
  number_text text;
BEGIN
  IF p_street_id IS NULL THEN
    RAISE EXCEPTION 'Select a street';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.streets
    WHERE id = p_street_id
  ) THEN
    RAISE EXCEPTION 'Street not found';
  END IF;

  IF coalesce(btrim(p_house_number), '') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'Select a valid house number';
  END IF;

  number_integer := btrim(p_house_number)::integer;

  IF number_integer < 1 OR number_integer > 50 THEN
    RAISE EXCEPTION 'House number must be between 1 and 50';
  END IF;

  number_text := number_integer::text;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_street_id::text || ':' || number_text,
      0
    )
  );

  SELECT h.id
  INTO house_uuid
  FROM public.houses h
  WHERE h.street_id = p_street_id
    AND public.canonical_house_number(h.house_number) = number_text
  LIMIT 1;

  IF house_uuid IS NOT NULL THEN
    RETURN house_uuid;
  END IF;

  INSERT INTO public.houses (
    address,
    house_type,
    street_id,
    house_number
  )
  VALUES (
    number_text,
    nullif(btrim(p_house_type), ''),
    p_street_id,
    number_text
  )
  RETURNING id
  INTO house_uuid;

  RETURN house_uuid;
END;
$$;

REVOKE ALL
ON FUNCTION public.resolve_registration_house(uuid, text, text)
FROM public, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.resolve_registration_house(uuid, text, text)
TO service_role;

-- =========================================================
-- ADMIN ADD RESIDENT RPC
-- =========================================================

CREATE OR REPLACE FUNCTION public.add_estate_resident(
  p_house_id uuid,
  p_house jsonb,
  p_resident jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  house_uuid uuid := p_house_id;
  resident_uuid uuid;
  street_uuid uuid;
  number_integer integer;
  number_text text;
  resident_name text;
  resident_phone text;
  resident_email text;
  resident_relationship text;
  resident_block text;
  resident_flat text;
  emergency_phone text;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  resident_name :=
    btrim(p_resident->>'full_name');

  resident_phone :=
    btrim(p_resident->>'phone');

  resident_email :=
    lower(btrim(p_resident->>'email'));

  resident_relationship :=
    p_resident->>'relationship';

  resident_block :=
    nullif(btrim(p_resident->>'block_number'), '');

  resident_flat :=
    nullif(btrim(p_resident->>'flat_number'), '');

  emergency_phone :=
    nullif(btrim(p_resident->>'emergency_contact_phone'), '');

  IF coalesce(resident_name, '') = '' THEN
    RAISE EXCEPTION 'Enter the resident name';
  END IF;

  IF length(resident_phone) < 11
     OR resident_phone !~ '^\+?[0-9]{10,15}$'
  THEN
    RAISE EXCEPTION
      'Phone number must contain only numbers and an optional leading +, with at least 11 characters';
  END IF;

  IF resident_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address';
  END IF;

  IF resident_relationship
     NOT IN ('owner', 'tenant', 'family_member')
  THEN
    RAISE EXCEPTION 'Select a resident status';
  END IF;

  IF resident_block IS NOT NULL
     AND resident_block !~ '^(10|[1-9])$'
  THEN
    RAISE EXCEPTION 'Block number must be between 1 and 10';
  END IF;

  IF resident_flat IS NOT NULL
     AND resident_flat !~ '^(10|[1-9])$'
  THEN
    RAISE EXCEPTION 'Flat number must be between 1 and 10';
  END IF;

  IF emergency_phone IS NOT NULL
     AND (
       length(emergency_phone) < 11
       OR emergency_phone !~ '^\+?[0-9]{10,15}$'
     )
  THEN
    RAISE EXCEPTION 'Enter a valid emergency contact phone number';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.residents
    WHERE is_active
      AND lower(btrim(email)) = resident_email
  ) THEN
    RAISE EXCEPTION
      'An active resident already uses this email address';
  END IF;

  IF house_uuid IS NULL THEN
    street_uuid :=
      (p_house->>'street_id')::uuid;

    IF street_uuid IS NULL THEN
      RAISE EXCEPTION 'Select a street';
    END IF;

    IF coalesce(btrim(p_house->>'house_number'), '')
       !~ '^[0-9]+$'
    THEN
      RAISE EXCEPTION 'Select a valid house number';
    END IF;

    number_integer :=
      btrim(p_house->>'house_number')::integer;

    IF number_integer < 1 OR number_integer > 50 THEN
      RAISE EXCEPTION
        'House number must be between 1 and 50';
    END IF;

    number_text := number_integer::text;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        street_uuid::text || ':' || number_text,
        0
      )
    );

    IF EXISTS (
      SELECT 1
      FROM public.houses h
      WHERE h.street_id = street_uuid
        AND public.canonical_house_number(h.house_number) = number_text
    ) THEN
      RAISE EXCEPTION
        'This house already exists. Select it from the Household dropdown.';
    END IF;

    INSERT INTO public.houses (
      address,
      house_type,
      street_id,
      house_number
    )
    VALUES (
      number_text,
      nullif(btrim(p_house->>'house_type'), ''),
      street_uuid,
      number_text
    )
    RETURNING id
    INTO house_uuid;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.houses
      WHERE id = house_uuid
    ) THEN
      RAISE EXCEPTION 'Household not found';
    END IF;
  END IF;

  IF resident_relationship = 'owner'
     AND EXISTS (
       SELECT 1
       FROM public.residents
       WHERE house_id = house_uuid
         AND is_active
         AND relationship = 'owner'
     )
  THEN
    RAISE EXCEPTION
      'This household already has an active Home Owner';
  END IF;

  INSERT INTO public.residents (
    house_id,
    full_name,
    phone,
    email,
    relationship,
    block_number,
    flat_number,
    vehicle_plate_numbers,
    emergency_contact_name,
    emergency_contact_phone,
    move_in_date,
    property_allocation_date,
    qr_code_value
  )
  VALUES (
    house_uuid,
    resident_name,
    resident_phone,
    resident_email,
    resident_relationship,
    resident_block,
    resident_flat,
    ARRAY(
      SELECT btrim(value)
      FROM jsonb_array_elements_text(
        coalesce(
          p_resident->'vehicle_plate_numbers',
          '[]'::jsonb
        )
      ) AS value
      WHERE btrim(value) <> ''
    ),
    nullif(btrim(p_resident->>'emergency_contact_name'), ''),
    emergency_phone,
    nullif(p_resident->>'move_in_date', '')::date,
    nullif(p_resident->>'property_allocation_date', '')::date,
    'RES-' || gen_random_uuid()::text
  )
  RETURNING id
  INTO resident_uuid;

  RETURN resident_uuid;
END;
$$;

REVOKE ALL
ON FUNCTION public.add_estate_resident(uuid, jsonb, jsonb)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.add_estate_resident(uuid, jsonb, jsonb)
TO authenticated;

-- =========================================================
-- EDIT / MOVE RESIDENT
-- =========================================================

CREATE OR REPLACE FUNCTION public.update_estate_resident(
  p_resident_id uuid,
  p_house_id uuid,
  p_resident jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_resident public.residents%rowtype;
  resident_name text;
  resident_phone text;
  resident_email text;
  resident_relationship text;
  resident_block text;
  resident_flat text;
  emergency_phone text;
  move_date date;
  allocation_date date;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT *
  INTO current_resident
  FROM public.residents
  WHERE id = p_resident_id
  FOR UPDATE;

  IF current_resident.id IS NULL THEN
    RAISE EXCEPTION 'Resident not found';
  END IF;

  IF p_house_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.houses
       WHERE id = p_house_id
     )
  THEN
    RAISE EXCEPTION 'Select a valid household';
  END IF;

  resident_name :=
    btrim(p_resident->>'full_name');

  resident_phone :=
    btrim(p_resident->>'phone');

  resident_email :=
    lower(btrim(p_resident->>'email'));

  resident_relationship :=
    p_resident->>'relationship';

  resident_block :=
    nullif(btrim(p_resident->>'block_number'), '');

  resident_flat :=
    nullif(btrim(p_resident->>'flat_number'), '');

  emergency_phone :=
    nullif(btrim(p_resident->>'emergency_contact_phone'), '');

  move_date :=
    nullif(p_resident->>'move_in_date', '')::date;

  allocation_date :=
    nullif(p_resident->>'property_allocation_date', '')::date;

  IF resident_name = '' THEN
    RAISE EXCEPTION 'Enter the resident name';
  END IF;

  IF length(resident_phone) < 11
     OR resident_phone !~ '^\+?[0-9]{10,15}$'
  THEN
    RAISE EXCEPTION 'Enter a valid phone number';
  END IF;

  IF resident_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address';
  END IF;

  IF resident_relationship
     NOT IN ('owner', 'tenant', 'family_member')
  THEN
    RAISE EXCEPTION 'Select a resident status';
  END IF;

  IF resident_block IS NOT NULL
     AND resident_block !~ '^(10|[1-9])$'
  THEN
    RAISE EXCEPTION 'Block number must be between 1 and 10';
  END IF;

  IF resident_flat IS NOT NULL
     AND resident_flat !~ '^(10|[1-9])$'
  THEN
    RAISE EXCEPTION 'Flat number must be between 1 and 10';
  END IF;

  IF emergency_phone IS NOT NULL
     AND (
       length(emergency_phone) < 11
       OR emergency_phone !~ '^\+?[0-9]{10,15}$'
     )
  THEN
    RAISE EXCEPTION 'Enter a valid emergency contact phone number';
  END IF;

  IF move_date IS NULL
     OR allocation_date IS NULL
  THEN
    RAISE EXCEPTION
      'Move-in date and property allocation date are required';
  END IF;

  IF current_resident.is_active
     AND EXISTS (
       SELECT 1
       FROM public.residents r
       WHERE r.id <> p_resident_id
         AND r.is_active
         AND lower(btrim(r.email)) = resident_email
     )
  THEN
    RAISE EXCEPTION
      'Another active resident already uses this email address';
  END IF;

  IF current_resident.is_active
     AND resident_relationship = 'owner'
     AND EXISTS (
       SELECT 1
       FROM public.residents r
       WHERE r.id <> p_resident_id
         AND r.house_id = p_house_id
         AND r.is_active
         AND r.relationship = 'owner'
     )
  THEN
    RAISE EXCEPTION
      'The selected household already has an active Home Owner';
  END IF;

  UPDATE public.residents
  SET
    house_id = p_house_id,
    full_name = resident_name,
    phone = resident_phone,
    email = resident_email,
    relationship = resident_relationship,
    block_number = resident_block,
    flat_number = resident_flat,
    vehicle_plate_numbers = ARRAY(
      SELECT btrim(value)
      FROM jsonb_array_elements_text(
        coalesce(
          p_resident->'vehicle_plate_numbers',
          '[]'::jsonb
        )
      ) AS value
      WHERE btrim(value) <> ''
    ),
    emergency_contact_name =
      nullif(btrim(p_resident->>'emergency_contact_name'), ''),
    emergency_contact_phone =
      emergency_phone,
    move_in_date = move_date,
    property_allocation_date = allocation_date
  WHERE id = p_resident_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.update_estate_resident(uuid, uuid, jsonb)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.update_estate_resident(uuid, uuid, jsonb)
TO authenticated;

-- =========================================================
-- VISITOR PHONE
-- =========================================================

ALTER TABLE public.visitor_passes
  ADD COLUMN IF NOT EXISTS visitor_phone text;

ALTER TABLE public.visitor_passes
  DROP CONSTRAINT IF EXISTS visitor_phone_format_check;

ALTER TABLE public.visitor_passes
  ADD CONSTRAINT visitor_phone_format_check
  CHECK (
    visitor_phone IS NULL
    OR visitor_phone ~ '^\+?[0-9]{10,15}$'
  );

ALTER TABLE public.visitor_passes
  DROP CONSTRAINT IF EXISTS visitor_name_not_blank;

ALTER TABLE public.visitor_passes
  ADD CONSTRAINT visitor_name_not_blank
  CHECK (btrim(visitor_name) <> '');

ALTER TABLE public.visitor_passes
  ALTER COLUMN visitor_name DROP DEFAULT;

-- Replace old 2-argument visitor-pass function.
DROP FUNCTION IF EXISTS public.create_visitor_pass(text, timestamptz);

CREATE OR REPLACE FUNCTION public.create_visitor_pass(
  p_visitor_name text,
  p_visitor_phone text,
  p_expires_at timestamptz
)
RETURNS public.visitor_passes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.residents%rowtype;
  v public.visitor_passes%rowtype;
  visitor_name_text text;
  visitor_phone_text text;
  addr text;
  attempts integer := 0;
BEGIN
  SELECT *
  INTO r
  FROM public.residents
  WHERE auth_user_id = auth.uid()
    AND is_active
  ORDER BY id
  LIMIT 1
  FOR UPDATE;

  IF r.id IS NULL
     OR r.house_id IS NULL
  THEN
    RAISE EXCEPTION
      'An active resident with a house is required';
  END IF;

  visitor_name_text :=
    btrim(coalesce(p_visitor_name, ''));

  IF visitor_name_text = '' THEN
    RAISE EXCEPTION 'Visitor name is required';
  END IF;

  IF length(visitor_name_text) > 100 THEN
    RAISE EXCEPTION
      'Visitor name must be 100 characters or fewer';
  END IF;

  visitor_phone_text :=
    nullif(btrim(p_visitor_phone), '');

  IF visitor_phone_text IS NOT NULL
     AND visitor_phone_text !~ '^\+?[0-9]{10,15}$'
  THEN
    RAISE EXCEPTION
      'Enter a valid visitor mobile number';
  END IF;

  IF p_expires_at IS NULL
     OR NOT isfinite(p_expires_at)
     OR p_expires_at <= clock_timestamp()
  THEN
    RAISE EXCEPTION
      'Choose an expiry time in the future';
  END IF;

  addr :=
    public.resident_display_address(
      r.house_id,
      r.block_number,
      r.flat_number
    );

  LOOP
    attempts := attempts + 1;

    BEGIN
      INSERT INTO public.visitor_passes (
        resident_id,
        house_id,
        code,
        visitor_name,
        visitor_phone,
        address,
        starts_at,
        expires_at
      )
      VALUES (
        r.id,
        r.house_id,
        upper(
          substr(
            replace(
              gen_random_uuid()::text,
              '-',
              ''
            ),
            1,
            10
          )
        ),
        visitor_name_text,
        visitor_phone_text,
        addr,
        clock_timestamp(),
        p_expires_at
      )
      RETURNING *
      INTO v;

      RETURN v;

    EXCEPTION
      WHEN unique_violation THEN
        IF attempts >= 5 THEN
          RAISE EXCEPTION
            'Please try generating the code again';
        END IF;
    END;
  END LOOP;
END;
$$;

REVOKE ALL
ON FUNCTION public.create_visitor_pass(text, text, timestamptz)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.create_visitor_pass(text, text, timestamptz)
TO authenticated;

-- =========================================================
-- VISITOR REDEMPTION + HOUSE DEBT ALERT
--
-- ENTRY IS NEVER BLOCKED ONLY BECAUSE OF DEBT.
--
-- When debt exists:
--   Host resident receives alert
--   Designated payee receives alert if different
--   Admin/Super Admin receives alert
-- =========================================================

CREATE OR REPLACE FUNCTION public.redeem_visitor_pass(
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.visitor_passes%rowtype;
  staff public.admins%rowtype;
  host_resident public.residents%rowtype;
  billing_resident public.residents%rowtype;
  h public.houses%rowtype;

  bills jsonb := '[]'::jsonb;
  balance numeric := 0;

  host_email text;
  billing_email text;
  alert_uuid uuid;

  entered_at timestamptz :=
    clock_timestamp();
BEGIN
  SELECT *
  INTO staff
  FROM public.admins
  WHERE auth_user_id = auth.uid()
    AND role IN (
      'admin',
      'super_admin',
      'gate_staff'
    )
  ORDER BY id
  LIMIT 1;

  IF staff.id IS NULL THEN
    RAISE EXCEPTION
      'Only estate staff can verify visitor entry';
  END IF;

  SELECT *
  INTO v
  FROM public.visitor_passes
  WHERE code = upper(trim(p_code))
  FOR UPDATE;

  IF v.id IS NULL THEN
    RAISE EXCEPTION 'Invalid visitor code';
  END IF;

  IF v.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION
      'This visitor code was cancelled';
  END IF;

  IF v.redeemed_at IS NOT NULL THEN
    RAISE EXCEPTION
      'This visitor code has already been used';
  END IF;

  IF entered_at < v.starts_at
     OR entered_at >= v.expires_at
  THEN
    RAISE EXCEPTION
      'This visitor code has expired or is not yet valid';
  END IF;

  SELECT *
  INTO host_resident
  FROM public.residents
  WHERE id = v.resident_id
  FOR SHARE;

  IF host_resident.is_active IS NOT TRUE
     OR host_resident.house_id IS DISTINCT FROM v.house_id
  THEN
    RAISE EXCEPTION
      'The host no longer has access to this house';
  END IF;

  SELECT *
  INTO h
  FROM public.houses
  WHERE id = v.house_id;

  IF h.id IS NULL THEN
    RAISE EXCEPTION
      'The household record is unavailable';
  END IF;

  SELECT
    coalesce(
      sum(
        greatest(
          i.amount - coalesce(i.amount_paid, 0),
          0
        )
      ),
      0
    ),

    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'label',
          coalesce(d.name, 'Estate charge'),

          'amount',
          greatest(
            i.amount - coalesce(i.amount_paid, 0),
            0
          ),

          'due_date',
          i.due_date
        )

        ORDER BY
          i.due_date,
          i.id
      )
      FILTER (
        WHERE i.id IS NOT NULL
      ),

      '[]'::jsonb
    )
  INTO
    balance,
    bills

  FROM public.invoices i

  LEFT JOIN public.due_types d
    ON d.id = i.due_type_id

  WHERE i.house_id = v.house_id
    AND i.status IN (
      'unpaid',
      'partial',
      'overdue'
    )
    AND i.amount > coalesce(i.amount_paid, 0);

  -- Entry is approved before notifications.
  UPDATE public.visitor_passes
  SET
    redeemed_at = entered_at,
    redeemed_by = staff.id
  WHERE id = v.id;

  IF balance > 0 THEN

    -- Resolve designated billing resident.
    SELECT br.*
    INTO billing_resident
    FROM public.residents br
    WHERE br.house_id = h.id
      AND br.is_active
      AND (
        (
          h.billing_responsible_resident_id IS NOT NULL
          AND br.id = h.billing_responsible_resident_id
        )
        OR
        (
          h.billing_responsible_resident_id IS NULL
          AND br.relationship = 'owner'
        )
      )
    LIMIT 1;

    -- Host email.
    host_email :=
      nullif(
        btrim(host_resident.email),
        ''
      );

    IF host_email IS NULL
       AND host_resident.auth_user_id IS NOT NULL
    THEN
      SELECT u.email
      INTO host_email
      FROM auth.users u
      WHERE u.id = host_resident.auth_user_id;
    END IF;

    -- Billing contact email.
    billing_email :=
      nullif(
        btrim(billing_resident.email),
        ''
      );

    IF billing_email IS NULL
       AND billing_resident.auth_user_id IS NOT NULL
    THEN
      SELECT u.email
      INTO billing_email
      FROM auth.users u
      WHERE u.id = billing_resident.auth_user_id;
    END IF;

    INSERT INTO public.gate_due_alerts (
      resident_id,
      source_type,
      source_id,
      details
    )
    VALUES (
      host_resident.id,
      'visitor',
      v.id,

      jsonb_build_object(
        'source_type',
        'visitor',

        'name',
        v.visitor_name,

        'visitor_phone',
        v.visitor_phone,

        'host',
        host_resident.full_name,

        'host_email',
        host_email,

        'host_phone',
        host_resident.phone,

        'billing_contact_name',
        billing_resident.full_name,

        'email',
        billing_email,

        'phone',
        billing_resident.phone,

        'address',
        v.address,

        'entered_at',
        entered_at,

        'balance',
        balance,

        'bills',
        bills
      )
    )
    RETURNING id
    INTO alert_uuid;

    -- Notify the host resident.
    IF host_email IS NOT NULL THEN
      INSERT INTO public.gate_due_emails (
        alert_id,
        recipient,
        audience
      )
      VALUES (
        alert_uuid,
        lower(host_email),
        'resident'
      )
      ON CONFLICT DO NOTHING;
    END IF;

    -- Notify designated payee if different.
    IF billing_email IS NOT NULL THEN
      INSERT INTO public.gate_due_emails (
        alert_id,
        recipient,
        audience
      )
      VALUES (
        alert_uuid,
        lower(billing_email),
        'resident'
      )
      ON CONFLICT DO NOTHING;
    END IF;

    -- Notify Admin and Super Admin.
    INSERT INTO public.gate_due_emails (
      alert_id,
      recipient,
      audience
    )
    SELECT DISTINCT
      alert_uuid,
      lower(u.email),
      'admin'
    FROM public.admins a
    JOIN auth.users u
      ON u.id = a.auth_user_id
    WHERE a.role IN (
      'admin',
      'super_admin'
    )
      AND nullif(btrim(u.email), '') IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'visitor',
    v.visitor_name,

    'visitor_phone',
    v.visitor_phone,

    'host',
    host_resident.full_name,

    'address',
    v.address,

    'message',
    'Entry recorded. This code cannot be used again.',

    'has_outstanding',
    balance > 0,

    'balance',
    balance,

    'alert_queued',
    balance > 0
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.redeem_visitor_pass(text)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.redeem_visitor_pass(text)
TO authenticated;

-- Force PostgREST/Supabase API schema refresh.
NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- SOURCE: supabase/migration_hybrid_house_resident_billing.sql
-- ============================================================

-- VERDANT
-- Hybrid household + resident-specific billing.
--
-- Existing invoices remain HOUSE invoices.
-- Existing due types remain HOUSE due types.
--
-- New resident-specific invoices:
--   house_id    = NULL
--   resident_id = resident UUID
--
-- Household invoices:
--   house_id    = house UUID
--   resident_id = NULL

BEGIN;

-- ============================================================
-- 1. DUE TYPE BILLING SCOPE
-- ============================================================

ALTER TABLE public.due_types
ADD COLUMN IF NOT EXISTS billing_scope text;

UPDATE public.due_types
SET billing_scope = 'house'
WHERE billing_scope IS NULL;

ALTER TABLE public.due_types
ALTER COLUMN billing_scope
SET DEFAULT 'house';

ALTER TABLE public.due_types
ALTER COLUMN billing_scope
SET NOT NULL;

ALTER TABLE public.due_types
DROP CONSTRAINT IF EXISTS due_types_billing_scope_check;

ALTER TABLE public.due_types
ADD CONSTRAINT due_types_billing_scope_check
CHECK (
  billing_scope IN (
    'house',
    'resident'
  )
);

ALTER TABLE public.due_types
DROP CONSTRAINT IF EXISTS due_types_frequency_check;

ALTER TABLE public.due_types
ADD CONSTRAINT due_types_frequency_check
CHECK (
  frequency IN (
    'monthly',
    'quarterly',
    'yearly',
    'one-time'
  )
)
NOT VALID;

-- Existing unusual historical values, if any, are not destroyed.
-- New/updated rows must use the supported frequencies.

-- ============================================================
-- 2. INVOICE TARGET
-- ============================================================

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS resident_id uuid
REFERENCES public.residents(id);

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS period_start date;

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS period_end date;

CREATE INDEX IF NOT EXISTS hybrid_invoice_resident_idx
ON public.invoices(resident_id);

-- Existing Verdant invoices should all already belong to houses.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.invoices
    WHERE house_id IS NULL
      AND resident_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Existing invoices without a house were found. Reconcile them before applying the hybrid billing migration.';
  END IF;
END;
$$;

ALTER TABLE public.invoices
DROP CONSTRAINT IF EXISTS hybrid_invoice_exactly_one_target;

ALTER TABLE public.invoices
ADD CONSTRAINT hybrid_invoice_exactly_one_target
CHECK (
  (
    house_id IS NOT NULL
    AND resident_id IS NULL
  )
  OR
  (
    house_id IS NULL
    AND resident_id IS NOT NULL
  )
);

ALTER TABLE public.invoices
DROP CONSTRAINT IF EXISTS hybrid_invoice_period_dates;

ALTER TABLE public.invoices
ADD CONSTRAINT hybrid_invoice_period_dates
CHECK (
  period_start IS NULL
  OR period_end IS NULL
  OR period_start <= period_end
);

-- A resident cannot receive the same charge twice
-- for the same generated billing period.
CREATE UNIQUE INDEX IF NOT EXISTS
hybrid_resident_invoice_period_unique
ON public.invoices (
  resident_id,
  due_type_id,
  period_start,
  period_end
)
WHERE resident_id IS NOT NULL;

-- ============================================================
-- 3. PROTECT BILLING SCOPE
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_invoice_billing_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_scope text;
BEGIN
  SELECT billing_scope
  INTO STRICT v_scope
  FROM public.due_types
  WHERE id = NEW.due_type_id;

  IF v_scope = 'house' THEN
    IF NEW.house_id IS NULL
       OR NEW.resident_id IS NOT NULL
    THEN
      RAISE EXCEPTION
        'This due type is a Household / Property charge and must be billed to a house.';
    END IF;
  ELSIF v_scope = 'resident' THEN
    IF NEW.resident_id IS NULL
       OR NEW.house_id IS NOT NULL
    THEN
      RAISE EXCEPTION
        'This due type is an Individual Resident charge and must be billed to a resident.';
    END IF;

    IF NEW.period_start IS NULL
       OR NEW.period_end IS NULL
    THEN
      RAISE EXCEPTION
        'Resident-specific invoices require a billing start and end date.';
    END IF;
  ELSE
    RAISE EXCEPTION
      'Unsupported billing scope.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
validate_invoice_billing_scope_trigger
ON public.invoices;

CREATE TRIGGER
validate_invoice_billing_scope_trigger
BEFORE INSERT OR UPDATE OF
  house_id,
  resident_id,
  due_type_id,
  period_start,
  period_end
ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.validate_invoice_billing_scope();

-- A due type cannot switch from house -> resident or vice versa
-- once it already has invoice history.
CREATE OR REPLACE FUNCTION public.protect_due_type_billing_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.billing_scope IS DISTINCT FROM OLD.billing_scope
     AND EXISTS (
       SELECT 1
       FROM public.invoices
       WHERE due_type_id = OLD.id
     )
  THEN
    RAISE EXCEPTION
      'This due type already has invoice history. Create a new due type instead of changing its billing scope.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
protect_due_type_billing_scope_trigger
ON public.due_types;

CREATE TRIGGER
protect_due_type_billing_scope_trigger
BEFORE UPDATE OF billing_scope
ON public.due_types
FOR EACH ROW
EXECUTE FUNCTION public.protect_due_type_billing_scope();

-- ============================================================
-- 4. RESIDENT INVOICE VISIBILITY
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_access_invoice_target(
  p_house uuid,
  p_resident uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.residents r
    LEFT JOIN public.houses h
      ON h.id = r.house_id
    WHERE r.auth_user_id = auth.uid()
      AND r.is_active
      AND (
        (
          p_resident IS NOT NULL
          AND p_resident = r.id
        )
        OR
        (
          p_house IS NOT NULL
          AND h.id = p_house
          AND (
            (
              h.billing_responsible_resident_id IS NOT NULL
              AND
              h.billing_responsible_resident_id = r.id
            )
            OR
            (
              h.billing_responsible_resident_id IS NULL
              AND r.relationship = 'owner'
            )
          )
        )
      )
  );
$$;

REVOKE ALL
ON FUNCTION public.can_access_invoice_target(uuid, uuid)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.can_access_invoice_target(uuid, uuid)
TO authenticated;

DROP POLICY IF EXISTS
"residents view home invoices"
ON public.invoices;

DROP POLICY IF EXISTS
"repair responsible residents view invoices"
ON public.invoices;

DROP POLICY IF EXISTS
"hybrid residents view invoices"
ON public.invoices;

CREATE POLICY
"hybrid residents view invoices"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  public.can_access_invoice_target(
    house_id,
    resident_id
  )
);

DROP POLICY IF EXISTS
"repair invoice visibility boundary"
ON public.invoices;

DROP POLICY IF EXISTS
"hybrid invoice visibility boundary"
ON public.invoices;

CREATE POLICY
"hybrid invoice visibility boundary"
ON public.invoices
AS RESTRICTIVE
FOR SELECT
TO public
USING (
  public.is_estate_admin()
  OR public.can_access_invoice_target(
    house_id,
    resident_id
  )
);

-- ============================================================
-- 5. DATE PERIOD HELPERS
-- ============================================================

-- Adds months while trying to preserve the original billing day.
-- 31 January + 1 month becomes the final valid day in February.
CREATE OR REPLACE FUNCTION public.anchored_month_date(
  p_anchor date,
  p_months integer
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_month_start date;
  v_month_end date;
  v_day integer;
BEGIN
  IF p_anchor IS NULL THEN
    RETURN NULL;
  END IF;

  v_month_start :=
    (
      date_trunc(
        'month',
        p_anchor
      )::date
      +
      make_interval(
        months => p_months
      )
    )::date;

  v_month_end :=
    (
      v_month_start
      +
      interval '1 month - 1 day'
    )::date;

  v_day :=
    least(
      extract(day FROM p_anchor)::integer,
      extract(day FROM v_month_end)::integer
    );

  RETURN make_date(
    extract(year FROM v_month_start)::integer,
    extract(month FROM v_month_start)::integer,
    v_day
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resident_invoice_periods(
  p_frequency text,
  p_start date,
  p_end date
)
RETURNS TABLE (
  sequence_no integer,
  bill_start date,
  bill_end date,
  bill_label text
)
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_month_step integer;
  v_index integer := 0;
  v_start date;
  v_next date;
  v_end date;
BEGIN
  IF p_start IS NULL
     OR p_end IS NULL
     OR p_start > p_end
  THEN
    RAISE EXCEPTION
      'Choose a valid billing date range.';
  END IF;

  IF p_frequency = 'one-time' THEN
    sequence_no := 1;
    bill_start := p_start;
    bill_end := p_end;
    bill_label :=
      to_char(
        p_start,
        'DD/MM/YYYY'
      )
      || ' - ' ||
      to_char(
        p_end,
        'DD/MM/YYYY'
      );

    RETURN NEXT;
    RETURN;
  END IF;

  v_month_step :=
    CASE p_frequency
      WHEN 'monthly'
        THEN 1
      WHEN 'quarterly'
        THEN 3
      WHEN 'yearly'
        THEN 12
      ELSE NULL
    END;

  IF v_month_step IS NULL THEN
    RAISE EXCEPTION
      'Unsupported billing frequency.';
  END IF;

  LOOP
    IF v_index >= 600 THEN
      RAISE EXCEPTION
        'The selected period creates too many invoices.';
    END IF;

    v_start :=
      public.anchored_month_date(
        p_start,
        v_index * v_month_step
      );

    EXIT WHEN v_start > p_end;

    v_next :=
      public.anchored_month_date(
        p_start,
        (v_index + 1) * v_month_step
      );

    v_end :=
      least(
        p_end,
        v_next - 1
      );

    sequence_no :=
      v_index + 1;

    bill_start :=
      v_start;

    bill_end :=
      v_end;

    bill_label :=
      to_char(
        v_start,
        'DD/MM/YYYY'
      )
      || ' - ' ||
      to_char(
        v_end,
        'DD/MM/YYYY'
      );

    RETURN NEXT;

    v_index :=
      v_index + 1;
  END LOOP;
END;
$$;

-- ============================================================
-- 6. PREVIEW RESIDENT INVOICES
-- ============================================================

CREATE OR REPLACE FUNCTION public.preview_resident_invoices(
  p_resident uuid,
  p_due_type uuid,
  p_start date,
  p_end date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resident public.residents%rowtype;
  v_due public.due_types%rowtype;
  v_period record;
  v_periods jsonb := '[]'::jsonb;
  v_exists boolean;
  v_total numeric := 0;
  v_create_count integer := 0;
  v_duplicate_count integer := 0;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION
      'Not authorized';
  END IF;

  SELECT *
  INTO STRICT v_resident
  FROM public.residents
  WHERE id = p_resident;

  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id = p_due_type;

  IF v_due.billing_scope <> 'resident' THEN
    RAISE EXCEPTION
      'Select an Individual Resident due type.';
  END IF;

  IF v_due.amount <= 0 THEN
    RAISE EXCEPTION
      'The due type amount must be greater than zero.';
  END IF;

  FOR v_period IN
    SELECT *
    FROM public.resident_invoice_periods(
      v_due.frequency,
      p_start,
      p_end
    )
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.resident_id = p_resident
        AND i.due_type_id = p_due_type
        AND i.period_start = v_period.bill_start
        AND i.period_end = v_period.bill_end
    )
    INTO v_exists;

    IF v_exists THEN
      v_duplicate_count :=
        v_duplicate_count + 1;
    ELSE
      v_create_count :=
        v_create_count + 1;

      v_total :=
        v_total + v_due.amount;
    END IF;

    v_periods :=
      v_periods ||
      jsonb_build_array(
        jsonb_build_object(
          'period_start',
          v_period.bill_start,
          'period_end',
          v_period.bill_end,
          'period_label',
          v_period.bill_label,
          'due_date',
          v_period.bill_end,
          'amount',
          v_due.amount,
          'already_exists',
          v_exists
        )
      );
  END LOOP;

  RETURN jsonb_build_object(
    'resident_id',
    v_resident.id,
    'resident_name',
    v_resident.full_name,
    'due_type_id',
    v_due.id,
    'due_type_name',
    v_due.name,
    'frequency',
    v_due.frequency,
    'amount_per_period',
    v_due.amount,
    'periods',
    v_periods,
    'create_count',
    v_create_count,
    'duplicate_count',
    v_duplicate_count,
    'total_to_create',
    v_total
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.preview_resident_invoices(
  uuid,
  uuid,
  date,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.preview_resident_invoices(
  uuid,
  uuid,
  date,
  date
)
TO authenticated;

-- ============================================================
-- 7. GENERATE RESIDENT INVOICES
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_resident_invoices(
  p_resident uuid,
  p_due_type uuid,
  p_start date,
  p_end date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due public.due_types%rowtype;
  v_period record;
  v_created integer := 0;
  v_skipped integer := 0;
  v_row_count integer;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION
      'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.residents
    WHERE id = p_resident
  ) THEN
    RAISE EXCEPTION
      'Resident not found.';
  END IF;

  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id = p_due_type;

  IF v_due.billing_scope <> 'resident' THEN
    RAISE EXCEPTION
      'Select an Individual Resident due type.';
  END IF;

  IF v_due.amount <= 0 THEN
    RAISE EXCEPTION
      'The due type amount must be greater than zero.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'resident-billing:'
      || p_resident::text
      || ':'
      || p_due_type::text,
      0
    )
  );

  FOR v_period IN
    SELECT *
    FROM public.resident_invoice_periods(
      v_due.frequency,
      p_start,
      p_end
    )
  LOOP
    INSERT INTO public.invoices (
      house_id,
      resident_id,
      due_type_id,
      period_start,
      period_end,
      period_label,
      amount,
      amount_paid,
      status,
      due_date
    )
    VALUES (
      NULL,
      p_resident,
      p_due_type,
      v_period.bill_start,
      v_period.bill_end,
      v_period.bill_label,
      v_due.amount,
      0,
      'unpaid',
      v_period.bill_end
    )
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS
      v_row_count = ROW_COUNT;

    IF v_row_count = 1 THEN
      v_created :=
        v_created + 1;
    ELSE
      v_skipped :=
        v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'created',
    v_created,
    'skipped',
    v_skipped
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.generate_resident_invoices(
  uuid,
  uuid,
  date,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.generate_resident_invoices(
  uuid,
  uuid,
  date,
  date
)
TO authenticated;

-- ============================================================
-- 8. HOUSE INVOICE GENERATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_house_invoices(
  p_due_type uuid,
  p_period_label text,
  p_due_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due public.due_types%rowtype;
  v_created integer;
  v_total integer;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION
      'Not authorized';
  END IF;

  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id = p_due_type;

  IF v_due.billing_scope <> 'house' THEN
    RAISE EXCEPTION
      'Select a Household / Property due type.';
  END IF;

  IF coalesce(
    btrim(p_period_label),
    ''
  ) = '' THEN
    RAISE EXCEPTION
      'Enter a billing period.';
  END IF;

  IF v_due.amount <= 0 THEN
    RAISE EXCEPTION
      'The due type amount must be greater than zero.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'house-billing:'
      || p_due_type::text
      || ':'
      || public.normalize_label(
        p_period_label
      ),
      0
    )
  );

  SELECT count(*)
  INTO v_total
  FROM public.houses;

  INSERT INTO public.invoices (
    house_id,
    resident_id,
    due_type_id,
    period_label,
    amount,
    amount_paid,
    due_date,
    status
  )
  SELECT
    h.id,
    NULL,
    v_due.id,
    btrim(p_period_label),
    v_due.amount,
    0,
    p_due_date,
    'unpaid'
  FROM public.houses h
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS
    v_created = ROW_COUNT;

  RETURN jsonb_build_object(
    'created',
    v_created,
    'skipped',
    greatest(
      0,
      v_total - v_created
    )
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.generate_house_invoices(
  uuid,
  text,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.generate_house_invoices(
  uuid,
  text,
  date
)
TO authenticated;

-- ============================================================
-- 9. PAYMENT AUTHORIZATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.prepare_estate_payment(
  p_auth_user uuid,
  p_items jsonb,
  p_reference text,
  p_expected_kobo bigint,
  p_quote_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.residents%rowtype;
  h public.houses%rowtype;
  item jsonb;
  inv public.invoices%rowtype;
  dt public.due_types%rowtype;
  m date;
  period text;
  due date;
  amount_due numeric;
  total_kobo bigint := 0;
  line_kobo bigint;
  lines jsonb := '[]'::jsonb;
  seen text[] := '{}';
  key text;
  house_payer boolean := false;

  current_month date :=
    date_trunc(
      'month',
      now() AT TIME ZONE 'Africa/Lagos'
    )::date;
BEGIN
  SELECT *
  INTO STRICT r
  FROM public.residents
  WHERE auth_user_id = p_auth_user
    AND is_active;

  IF r.house_id IS NOT NULL THEN
    SELECT *
    INTO STRICT h
    FROM public.houses
    WHERE id = r.house_id
    FOR UPDATE;

    house_payer :=
      CASE
        WHEN
          h.billing_responsible_resident_id
          IS NOT NULL
        THEN
          h.billing_responsible_resident_id = r.id
        ELSE
          r.relationship = 'owner'
      END;
  END IF;

  IF jsonb_typeof(p_items)
     IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items)
        NOT BETWEEN 1 AND 120
  THEN
    RAISE EXCEPTION
      'Choose between 1 and 120 payment items';
  END IF;

  IF NOT p_quote_only
     AND (
       p_reference IS NULL
       OR length(p_reference) < 10
     )
  THEN
    RAISE EXCEPTION
      'Missing payment reference';
  END IF;

  FOR item IN
    SELECT value
    FROM jsonb_array_elements(
      p_items
    )
  LOOP
    inv := NULL;

    IF item ? 'invoice_id' THEN
      SELECT *
      INTO STRICT inv
      FROM public.invoices
      WHERE id =
        (item->>'invoice_id')::uuid
      FOR UPDATE;

      IF inv.resident_id IS NOT NULL THEN
        IF inv.resident_id
           IS DISTINCT FROM r.id
        THEN
          RAISE EXCEPTION
            'This personal invoice belongs to another resident.';
        END IF;
      ELSIF inv.house_id IS NOT NULL THEN
        IF r.house_id
           IS DISTINCT FROM inv.house_id
        THEN
          RAISE EXCEPTION
            'This household invoice belongs to another house.';
        END IF;

        IF NOT house_payer THEN
          RAISE EXCEPTION
            'You are not the billing contact for this household.';
        END IF;
      ELSE
        RAISE EXCEPTION
          'Invoice has no valid billing target.';
      END IF;

      amount_due :=
        (item->>'amount')::numeric;

      IF amount_due IS NULL
         OR amount_due::text IN (
           'NaN',
           'Infinity',
           '-Infinity'
         )
         OR amount_due <= 0
         OR round(
           amount_due,
           2
         ) <> amount_due
         OR amount_due >
           (
             inv.amount
             -
             coalesce(
               inv.amount_paid,
               0
             )
           )
      THEN
        RAISE EXCEPTION
          'Enter an amount within the outstanding balance, with at most two decimal places';
      END IF;

      SELECT *
      INTO STRICT dt
      FROM public.due_types
      WHERE id = inv.due_type_id;

      period :=
        inv.period_label;

      due :=
        inv.due_date;

      key :=
        'invoice:'
        || inv.id::text;

    ELSE
      -- Advance payments remain HOUSEHOLD billing only.
      IF NOT house_payer THEN
        RAISE EXCEPTION
          'You are not responsible for this household''s bills';
      END IF;

      SELECT *
      INTO STRICT dt
      FROM public.due_types
      WHERE id =
        (item->>'due_type_id')::uuid
        AND billing_scope = 'house'
        AND name IN (
          'Service Charge',
          'CDA Levy'
        );

      IF coalesce(
        item->>'month',
        ''
      ) !~
        '^\d{4}-(0[1-9]|1[0-2])$'
      THEN
        RAISE EXCEPTION
          'Invalid billing month';
      END IF;

      m :=
        (
          (item->>'month')
          || '-01'
        )::date;

      IF m < current_month
         OR
         m >=
           current_month
           + interval '60 months'
      THEN
        RAISE EXCEPTION
          'Choose a month within the next five years';
      END IF;

      period :=
        to_char(
          m,
          'FMMonth YYYY'
        );

      due :=
        (
          m
          +
          interval '1 month - 1 day'
        )::date;

      SELECT *
      INTO inv
      FROM public.invoices
      WHERE house_id = h.id
        AND resident_id IS NULL
        AND due_type_id = dt.id
        AND
          public.normalize_label(
            period_label
          )
          =
          public.normalize_label(
            period
          )
      FOR UPDATE;

      amount_due :=
        CASE
          WHEN inv.id IS NULL
          THEN dt.amount
          ELSE greatest(
            0,
            inv.amount
            -
            coalesce(
              inv.amount_paid,
              0
            )
          )
        END;

      key :=
        'advance:'
        || dt.id::text
        || ':'
        || public.normalize_label(
          period
        );
    END IF;

    IF key = ANY(seen) THEN
      RAISE EXCEPTION
        'The same bill was selected more than once';
    END IF;

    seen :=
      array_append(
        seen,
        key
      );

    IF amount_due < 0
       OR dt.amount <= 0
    THEN
      RAISE EXCEPTION
        'Invalid charge amount';
    END IF;

    line_kobo :=
      round(
        amount_due * 100
      )::bigint;

    total_kobo :=
      total_kobo
      + line_kobo;

    IF NOT p_quote_only
       AND line_kobo > 0
       AND inv.id IS NULL
    THEN
      INSERT INTO public.invoices (
        house_id,
        resident_id,
        due_type_id,
        period_label,
        amount,
        due_date,
        status
      )
      VALUES (
        h.id,
        NULL,
        dt.id,
        period,
        dt.amount,
        due,
        'unpaid'
      )
      RETURNING *
      INTO inv;
    END IF;

    lines :=
      lines
      ||
      jsonb_build_array(
        jsonb_build_object(
          'invoice_id',
          inv.id,
          'charge',
          dt.name,
          'period',
          period,
          'amount_kobo',
          line_kobo
        )
      );
  END LOOP;

  IF NOT p_quote_only THEN
    IF total_kobo <= 0 THEN
      RAISE EXCEPTION
        'Nothing left to pay for';
    END IF;

    IF p_expected_kobo IS NULL
       OR
       total_kobo
       <> p_expected_kobo
    THEN
      RAISE EXCEPTION
        'Your balance changed. Review the payment amount again.';
    END IF;

    INSERT INTO public.payments (
      invoice_id,
      resident_id,
      amount,
      paystack_reference,
      status
    )
    SELECT
      (x->>'invoice_id')::uuid,
      r.id,
      (x->>'amount_kobo')::numeric
        / 100,
      p_reference,
      'pending'
    FROM jsonb_array_elements(
      lines
    ) x
    WHERE
      (x->>'amount_kobo')::bigint
      > 0;
  END IF;

  RETURN jsonb_build_object(
    'total_kobo',
    total_kobo,
    'lines',
    lines,
    'resident_id',
    r.id,
    'email',
    r.email
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.prepare_estate_payment(
  uuid,
  jsonb,
  text,
  bigint,
  boolean
)
FROM public, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.prepare_estate_payment(
  uuid,
  jsonb,
  text,
  bigint,
  boolean
)
TO service_role;

-- ============================================================
-- 10. MANUAL PAYMENTS
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_estate_manual_payment(
  p_invoice uuid,
  p_resident uuid,
  p_amount numeric,
  p_reference text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.invoices%rowtype;
  payment_id uuid;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION
      'Not authorized';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_reference,
      0
    )
  );

  SELECT id
  INTO payment_id
  FROM public.payments
  WHERE paystack_reference =
    p_reference;

  IF FOUND THEN
    RETURN payment_id;
  END IF;

  SELECT *
  INTO STRICT inv
  FROM public.invoices
  WHERE id = p_invoice
  FOR UPDATE;

  IF inv.resident_id IS NOT NULL THEN
    IF inv.resident_id
       IS DISTINCT FROM p_resident
    THEN
      RAISE EXCEPTION
        'This personal invoice belongs to another resident.';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.residents
      WHERE id = p_resident
        AND house_id = inv.house_id
    ) THEN
      RAISE EXCEPTION
        'Resident does not belong to this house.';
    END IF;
  END IF;

  IF p_amount IS NULL
     OR p_amount::text IN (
       'NaN',
       'Infinity',
       '-Infinity'
     )
     OR p_amount <= 0
     OR round(
       p_amount,
       2
     ) <> p_amount
     OR p_amount >
       (
         inv.amount
         -
         coalesce(
           inv.amount_paid,
           0
         )
       )
  THEN
    RAISE EXCEPTION
      'Invalid payment amount';
  END IF;

  INSERT INTO public.payments (
    invoice_id,
    resident_id,
    amount,
    paystack_reference,
    status,
    paid_at
  )
  VALUES (
    p_invoice,
    p_resident,
    p_amount,
    p_reference,
    'success',
    now()
  )
  RETURNING id
  INTO payment_id;

  UPDATE public.invoices
  SET
    amount_paid =
      coalesce(
        amount_paid,
        0
      )
      +
      p_amount,

    status =
      CASE
        WHEN
          coalesce(
            amount_paid,
            0
          )
          +
          p_amount
          >= amount
        THEN 'paid'
        ELSE 'partial'
      END
  WHERE id = p_invoice;

  RETURN payment_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.record_estate_manual_payment(
  uuid,
  uuid,
  numeric,
  text
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.record_estate_manual_payment(
  uuid,
  uuid,
  numeric,
  text
)
TO authenticated;

-- ============================================================
-- 11. EXISTING AUTOMATIC HOUSE CHARGES
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_estate_fixed_charges()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h public.houses%rowtype;
  d public.due_types%rowtype;
  period text;
  due date;
  n integer;
  created integer := 0;
  skipped integer := 0;

  m date :=
    date_trunc(
      'month',
      now() AT TIME ZONE 'Africa/Lagos'
    )::date;
BEGIN
  period :=
    to_char(
      m,
      'FMMonth YYYY'
    );

  due :=
    (
      m
      +
      interval '1 month - 1 day'
    )::date;

  IF (
    SELECT count(*)
    FROM public.due_types
    WHERE name IN (
      'Service Charge',
      'CDA Levy'
    )
      AND billing_scope = 'house'
  ) <> 2
  THEN
    RAISE EXCEPTION
      'Both fixed charges must be configured exactly once as Household / Property charges';
  END IF;

  FOR h IN
    SELECT *
    FROM public.houses
    ORDER BY id
    FOR UPDATE
  LOOP
    FOR d IN
      SELECT *
      FROM public.due_types
      WHERE name IN (
        'Service Charge',
        'CDA Levy'
      )
        AND billing_scope = 'house'
      ORDER BY id
    LOOP
      IF d.amount <= 0 THEN
        RAISE EXCEPTION
          'Fixed charge amount must be positive';
      END IF;

      INSERT INTO public.invoices (
        house_id,
        resident_id,
        due_type_id,
        period_label,
        amount,
        due_date,
        status
      )
      VALUES (
        h.id,
        NULL,
        d.id,
        period,
        d.amount,
        due,
        'unpaid'
      )
      ON CONFLICT DO NOTHING;

      GET DIAGNOSTICS
        n = ROW_COUNT;

      created :=
        created + n;

      skipped :=
        skipped + (
          1 - n
        );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'periodLabel',
    period,
    'created',
    created,
    'skipped',
    skipped
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.generate_estate_fixed_charges()
FROM public, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.generate_estate_fixed_charges()
TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- SOURCE: supabase/migration_single_house_billing.sql
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.generate_single_house_invoice(
  p_house uuid,
  p_due_type uuid,
  p_period_label text,
  p_due_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due public.due_types%rowtype;
  v_house public.houses%rowtype;
  v_existing uuid;
  v_invoice uuid;
  v_period text;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT *
  INTO STRICT v_house
  FROM public.houses
  WHERE id = p_house;

  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id = p_due_type;

  IF v_due.billing_scope <> 'house' THEN
    RAISE EXCEPTION
      'Select a Household / Property due type.';
  END IF;

  IF v_due.amount <= 0 THEN
    RAISE EXCEPTION
      'The due type amount must be greater than zero.';
  END IF;

  v_period := btrim(coalesce(p_period_label, ''));

  IF v_period = '' THEN
    RAISE EXCEPTION 'Enter a billing period.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'single-house-billing:'
      || p_house::text
      || ':'
      || p_due_type::text
      || ':'
      || public.normalize_label(v_period),
      0
    )
  );

  SELECT i.id
  INTO v_existing
  FROM public.invoices i
  WHERE i.house_id = p_house
    AND i.resident_id IS NULL
    AND i.due_type_id = p_due_type
    AND public.normalize_label(i.period_label)
        = public.normalize_label(v_period)
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'created', 0,
      'skipped', 1,
      'invoice_id', v_existing,
      'house_id', v_house.id,
      'address', v_house.address
    );
  END IF;

  INSERT INTO public.invoices (
    house_id,
    resident_id,
    due_type_id,
    period_label,
    amount,
    amount_paid,
    due_date,
    status
  )
  VALUES (
    p_house,
    NULL,
    p_due_type,
    v_period,
    v_due.amount,
    0,
    p_due_date,
    'unpaid'
  )
  RETURNING id
  INTO v_invoice;

  RETURN jsonb_build_object(
    'created', 1,
    'skipped', 0,
    'invoice_id', v_invoice,
    'house_id', v_house.id,
    'address', v_house.address
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.generate_single_house_invoice(
  uuid,
  uuid,
  text,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.generate_single_house_invoice(
  uuid,
  uuid,
  text,
  date
)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- SOURCE: supabase/migration_billing_ranges_and_resident_due_dates.sql
-- ============================================================

BEGIN;

-- Clean up matching signatures from earlier structured-billing attempts.
-- PostgreSQL will not let CREATE OR REPLACE remove existing parameter defaults,
-- so we explicitly drop these RPC signatures before recreating them below.
DROP FUNCTION IF EXISTS public.generate_house_invoices(
  uuid,
  date,
  date,
  date
);

DROP FUNCTION IF EXISTS public.generate_single_house_invoice(
  uuid,
  uuid,
  date,
  date,
  date
);

DROP FUNCTION IF EXISTS public.preview_resident_invoices(
  uuid,
  uuid,
  date,
  date,
  date
);

DROP FUNCTION IF EXISTS public.generate_resident_invoices(
  uuid,
  uuid,
  date,
  date,
  date
);

-- ============================================================
-- VERDANT
-- Multi-period single-house billing + resident due dates
-- ============================================================

CREATE OR REPLACE FUNCTION public.canonical_billing_frequency(
  p_frequency text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE lower(btrim(coalesce(p_frequency, '')))
    WHEN 'monthly' THEN 'monthly'
    WHEN 'quarterly' THEN 'quarterly'
    WHEN 'yearly' THEN 'yearly'
    WHEN 'annual' THEN 'yearly'
    WHEN 'annually' THEN 'yearly'
    WHEN 'one-time' THEN 'one-time'
    WHEN 'one_time' THEN 'one-time'
    WHEN 'one time' THEN 'one-time'
    WHEN 'one-off' THEN 'one-time'
    WHEN 'oneoff' THEN 'one-time'
    WHEN 'once' THEN 'one-time'
    ELSE lower(btrim(coalesce(p_frequency, '')))
  END;
$$;

CREATE OR REPLACE FUNCTION public.house_billing_period_label(
  p_frequency text,
  p_start date,
  p_end date
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_frequency text;
  v_quarter integer;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_start > p_end THEN
    RAISE EXCEPTION 'Choose a valid billing period.';
  END IF;

  v_frequency := public.canonical_billing_frequency(p_frequency);

  IF v_frequency = 'monthly' THEN
    IF p_start <> date_trunc('month', p_start)::date
       OR p_end <> (date_trunc('month', p_start) + interval '1 month - 1 day')::date
    THEN
      RAISE EXCEPTION 'Monthly billing must cover one complete calendar month.';
    END IF;

    RETURN to_char(p_start, 'FMMonth YYYY');
  END IF;

  IF v_frequency = 'quarterly' THEN
    IF extract(month FROM p_start)::integer NOT IN (1, 4, 7, 10)
       OR extract(day FROM p_start)::integer <> 1
       OR p_end <> (p_start + interval '3 months - 1 day')::date
    THEN
      RAISE EXCEPTION 'Quarterly billing must cover one complete calendar quarter.';
    END IF;

    v_quarter := ((extract(month FROM p_start)::integer - 1) / 3) + 1;

    RETURN 'Q' || v_quarter::text || ' ' || extract(year FROM p_start)::integer::text;
  END IF;

  IF v_frequency = 'yearly' THEN
    IF p_start <> make_date(extract(year FROM p_start)::integer, 1, 1)
       OR p_end <> make_date(extract(year FROM p_start)::integer, 12, 31)
    THEN
      RAISE EXCEPTION 'Yearly billing must cover one complete calendar year.';
    END IF;

    RETURN extract(year FROM p_start)::integer::text;
  END IF;

  RETURN to_char(p_start, 'DD/MM/YYYY') || ' - ' || to_char(p_end, 'DD/MM/YYYY');
END;
$$;

-- Produce canonical invoice periods across a selected range.
CREATE OR REPLACE FUNCTION public.billing_periods_canonical(
  p_frequency text,
  p_start date,
  p_end date
)
RETURNS TABLE (
  sequence_no integer,
  bill_start date,
  bill_end date,
  bill_label text
)
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_frequency text;
  v_cursor date;
  v_period_end date;
  v_sequence integer := 0;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_start > p_end THEN
    RAISE EXCEPTION 'Choose a valid billing date range.';
  END IF;

  v_frequency := public.canonical_billing_frequency(p_frequency);

  IF v_frequency = 'monthly' THEN
    IF p_start <> date_trunc('month', p_start)::date
       OR p_end <> (date_trunc('month', p_end) + interval '1 month - 1 day')::date
    THEN
      RAISE EXCEPTION 'Monthly From/To values must cover complete calendar months.';
    END IF;

    v_cursor := p_start;

    WHILE v_cursor <= p_end LOOP
      v_period_end := (date_trunc('month', v_cursor) + interval '1 month - 1 day')::date;
      v_sequence := v_sequence + 1;

      sequence_no := v_sequence;
      bill_start := v_cursor;
      bill_end := v_period_end;
      bill_label := to_char(v_cursor, 'FMMonth YYYY');
      RETURN NEXT;

      v_cursor := (v_cursor + interval '1 month')::date;
    END LOOP;

    RETURN;
  END IF;

  IF v_frequency = 'quarterly' THEN
    IF extract(month FROM p_start)::integer NOT IN (1, 4, 7, 10)
       OR extract(day FROM p_start)::integer <> 1
       OR extract(month FROM p_end)::integer NOT IN (3, 6, 9, 12)
       OR p_end <> (date_trunc('month', p_end) + interval '1 month - 1 day')::date
    THEN
      RAISE EXCEPTION 'Quarterly From/To values must cover complete calendar quarters.';
    END IF;

    v_cursor := p_start;

    WHILE v_cursor <= p_end LOOP
      v_period_end := (v_cursor + interval '3 months - 1 day')::date;

      IF v_period_end > p_end THEN
        RAISE EXCEPTION 'The selected quarterly range does not end on a complete quarter.';
      END IF;

      v_sequence := v_sequence + 1;
      sequence_no := v_sequence;
      bill_start := v_cursor;
      bill_end := v_period_end;
      bill_label :=
        'Q'
        || (((extract(month FROM v_cursor)::integer - 1) / 3) + 1)::text
        || ' '
        || extract(year FROM v_cursor)::integer::text;
      RETURN NEXT;

      v_cursor := (v_cursor + interval '3 months')::date;
    END LOOP;

    RETURN;
  END IF;

  IF v_frequency = 'yearly' THEN
    IF p_start <> make_date(extract(year FROM p_start)::integer, 1, 1)
       OR p_end <> make_date(extract(year FROM p_end)::integer, 12, 31)
    THEN
      RAISE EXCEPTION 'Yearly From/To values must cover complete calendar years.';
    END IF;

    v_cursor := p_start;

    WHILE v_cursor <= p_end LOOP
      v_period_end := make_date(extract(year FROM v_cursor)::integer, 12, 31);
      v_sequence := v_sequence + 1;

      sequence_no := v_sequence;
      bill_start := v_cursor;
      bill_end := v_period_end;
      bill_label := extract(year FROM v_cursor)::integer::text;
      RETURN NEXT;

      v_cursor := make_date(extract(year FROM v_cursor)::integer + 1, 1, 1);
    END LOOP;

    RETURN;
  END IF;

  -- One-time / legacy custom frequency = one invoice for the explicit range.
  sequence_no := 1;
  bill_start := p_start;
  bill_end := p_end;
  bill_label := to_char(p_start, 'DD/MM/YYYY') || ' - ' || to_char(p_end, 'DD/MM/YYYY');
  RETURN NEXT;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS hybrid_house_invoice_period_dates_unique
ON public.invoices (
  house_id,
  due_type_id,
  period_start,
  period_end
)
WHERE house_id IS NOT NULL
  AND resident_id IS NULL
  AND period_start IS NOT NULL
  AND period_end IS NOT NULL;

-- ============================================================
-- SINGLE HOUSEHOLD RANGE PREVIEW
-- ============================================================

CREATE OR REPLACE FUNCTION public.preview_single_house_invoices_range(
  p_house uuid,
  p_due_type uuid,
  p_start date,
  p_end date,
  p_due_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_house public.houses%rowtype;
  v_due public.due_types%rowtype;
  v_period record;
  v_periods jsonb := '[]'::jsonb;
  v_exists boolean;
  v_create_count integer := 0;
  v_duplicate_count integer := 0;
  v_total numeric := 0;
  v_contact_id uuid;
  v_contact_name text;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'Choose a due date.';
  END IF;

  SELECT *
  INTO STRICT v_house
  FROM public.houses
  WHERE id = p_house;

  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id = p_due_type;

  IF v_due.billing_scope <> 'house' THEN
    RAISE EXCEPTION 'Select a Household / Property due type.';
  END IF;

  IF v_due.amount <= 0 THEN
    RAISE EXCEPTION 'The due type amount must be greater than zero.';
  END IF;

  v_contact_id := v_house.billing_responsible_resident_id;

  IF v_contact_id IS NULL THEN
    SELECT r.id
    INTO v_contact_id
    FROM public.residents r
    WHERE r.house_id = p_house
      AND r.is_active
      AND r.relationship = 'owner'
    ORDER BY r.id
    LIMIT 1;
  END IF;

  IF v_contact_id IS NOT NULL THEN
    SELECT r.full_name
    INTO v_contact_name
    FROM public.residents r
    WHERE r.id = v_contact_id;
  END IF;

  FOR v_period IN
    SELECT *
    FROM public.billing_periods_canonical(
      v_due.frequency,
      p_start,
      p_end
    )
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.house_id = p_house
        AND i.resident_id IS NULL
        AND i.due_type_id = p_due_type
        AND (
          (
            i.period_start = v_period.bill_start
            AND i.period_end = v_period.bill_end
          )
          OR
          (
            i.period_start IS NULL
            AND i.period_end IS NULL
            AND public.normalize_label(i.period_label)
                = public.normalize_label(v_period.bill_label)
          )
        )
    )
    INTO v_exists;

    IF v_exists THEN
      v_duplicate_count := v_duplicate_count + 1;
    ELSE
      v_create_count := v_create_count + 1;
      v_total := v_total + v_due.amount;
    END IF;

    v_periods := v_periods || jsonb_build_array(
      jsonb_build_object(
        'period_start', v_period.bill_start,
        'period_end', v_period.bill_end,
        'period_label', v_period.bill_label,
        'due_date', p_due_date,
        'amount', v_due.amount,
        'already_exists', v_exists
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'house_id', v_house.id,
    'address', v_house.address,
    'due_type_id', v_due.id,
    'due_type_name', v_due.name,
    'frequency', v_due.frequency,
    'amount_per_period', v_due.amount,
    'billing_contact_id', v_contact_id,
    'billing_contact_name', v_contact_name,
    'periods', v_periods,
    'create_count', v_create_count,
    'duplicate_count', v_duplicate_count,
    'total_to_create', v_total
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.preview_single_house_invoices_range(
  uuid,
  uuid,
  date,
  date,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.preview_single_house_invoices_range(
  uuid,
  uuid,
  date,
  date,
  date
)
TO authenticated;

-- ============================================================
-- SINGLE HOUSEHOLD RANGE GENERATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_single_house_invoices_range(
  p_house uuid,
  p_due_type uuid,
  p_start date,
  p_end date,
  p_due_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_house public.houses%rowtype;
  v_due public.due_types%rowtype;
  v_period record;
  v_exists uuid;
  v_created integer := 0;
  v_skipped integer := 0;
  v_row_count integer;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'Choose a due date.';
  END IF;

  SELECT *
  INTO STRICT v_house
  FROM public.houses
  WHERE id = p_house;

  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id = p_due_type;

  IF v_due.billing_scope <> 'house' THEN
    RAISE EXCEPTION 'Select a Household / Property due type.';
  END IF;

  IF v_due.amount <= 0 THEN
    RAISE EXCEPTION 'The due type amount must be greater than zero.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'single-house-range:'
      || p_house::text
      || ':'
      || p_due_type::text
      || ':'
      || p_start::text
      || ':'
      || p_end::text,
      0
    )
  );

  FOR v_period IN
    SELECT *
    FROM public.billing_periods_canonical(
      v_due.frequency,
      p_start,
      p_end
    )
  LOOP
    v_exists := NULL;

    SELECT i.id
    INTO v_exists
    FROM public.invoices i
    WHERE i.house_id = p_house
      AND i.resident_id IS NULL
      AND i.due_type_id = p_due_type
      AND (
        (
          i.period_start = v_period.bill_start
          AND i.period_end = v_period.bill_end
        )
        OR
        (
          i.period_start IS NULL
          AND i.period_end IS NULL
          AND public.normalize_label(i.period_label)
              = public.normalize_label(v_period.bill_label)
        )
      )
    LIMIT 1;

    IF v_exists IS NOT NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.invoices (
      house_id,
      resident_id,
      due_type_id,
      period_start,
      period_end,
      period_label,
      amount,
      amount_paid,
      due_date,
      status
    )
    VALUES (
      p_house,
      NULL,
      p_due_type,
      v_period.bill_start,
      v_period.bill_end,
      v_period.bill_label,
      v_due.amount,
      0,
      p_due_date,
      'unpaid'
    )
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 1 THEN
      v_created := v_created + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'skipped', v_skipped,
    'house_id', v_house.id,
    'address', v_house.address
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.generate_single_house_invoices_range(
  uuid,
  uuid,
  date,
  date,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.generate_single_house_invoices_range(
  uuid,
  uuid,
  date,
  date,
  date
)
TO authenticated;

-- ============================================================
-- STRUCTURED SINGLE PERIOD WRAPPER (kept for compatibility)
-- ============================================================

DROP FUNCTION IF EXISTS public.generate_single_house_invoice(
  uuid,
  uuid,
  text,
  date
);

CREATE OR REPLACE FUNCTION public.generate_single_house_invoice(
  p_house uuid,
  p_due_type uuid,
  p_period_start date,
  p_period_end date,
  p_due_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due public.due_types%rowtype;
  v_label text;
BEGIN
  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id = p_due_type;

  -- This validates that the range represents exactly one canonical period.
  v_label := public.house_billing_period_label(
    v_due.frequency,
    p_period_start,
    p_period_end
  );

  RETURN public.generate_single_house_invoices_range(
    p_house,
    p_due_type,
    p_period_start,
    p_period_end,
    p_due_date
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.generate_single_house_invoice(
  uuid,
  uuid,
  date,
  date,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.generate_single_house_invoice(
  uuid,
  uuid,
  date,
  date,
  date
)
TO authenticated;

-- ============================================================
-- ALL HOUSEHOLDS: ONE STRUCTURED PERIOD AT A TIME
-- ============================================================

DROP FUNCTION IF EXISTS public.generate_house_invoices(
  uuid,
  text,
  date
);

CREATE OR REPLACE FUNCTION public.generate_house_invoices(
  p_due_type uuid,
  p_period_start date,
  p_period_end date,
  p_due_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due public.due_types%rowtype;
  v_period_label text;
  v_created integer := 0;
  v_skipped integer := 0;
  v_house record;
  v_result jsonb;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'Choose a due date.';
  END IF;

  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id = p_due_type;

  IF v_due.billing_scope <> 'house' THEN
    RAISE EXCEPTION 'Select a Household / Property due type.';
  END IF;

  IF v_due.amount <= 0 THEN
    RAISE EXCEPTION 'The due type amount must be greater than zero.';
  END IF;

  -- Deliberately validates ONE canonical period only for estate-wide billing.
  v_period_label := public.house_billing_period_label(
    v_due.frequency,
    p_period_start,
    p_period_end
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'all-house-billing:'
      || p_due_type::text
      || ':'
      || p_period_start::text
      || ':'
      || p_period_end::text,
      0
    )
  );

  FOR v_house IN
    SELECT id
    FROM public.houses
    ORDER BY id
  LOOP
    v_result := public.generate_single_house_invoice(
      v_house.id,
      p_due_type,
      p_period_start,
      p_period_end,
      p_due_date
    );

    v_created := v_created + coalesce((v_result->>'created')::integer, 0);
    v_skipped := v_skipped + coalesce((v_result->>'skipped')::integer, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'skipped', v_skipped,
    'period_label', v_period_label,
    'period_start', p_period_start,
    'period_end', p_period_end
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.generate_house_invoices(
  uuid,
  date,
  date,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.generate_house_invoices(
  uuid,
  date,
  date,
  date
)
TO authenticated;

-- ============================================================
-- RESIDENT PREVIEW WITH EXPLICIT DUE DATE
-- ============================================================

DROP FUNCTION IF EXISTS public.preview_resident_invoices(
  uuid,
  uuid,
  date,
  date
);

CREATE OR REPLACE FUNCTION public.preview_resident_invoices(
  p_resident uuid,
  p_due_type uuid,
  p_start date,
  p_end date,
  p_due_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resident public.residents%rowtype;
  v_due public.due_types%rowtype;
  v_period record;
  v_periods jsonb := '[]'::jsonb;
  v_exists boolean;
  v_total numeric := 0;
  v_create_count integer := 0;
  v_duplicate_count integer := 0;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'Choose a due date.';
  END IF;

  SELECT *
  INTO STRICT v_resident
  FROM public.residents
  WHERE id = p_resident;

  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id = p_due_type;

  IF v_due.billing_scope <> 'resident' THEN
    RAISE EXCEPTION 'Select an Individual Resident due type.';
  END IF;

  IF v_due.amount <= 0 THEN
    RAISE EXCEPTION 'The due type amount must be greater than zero.';
  END IF;

  FOR v_period IN
    SELECT *
    FROM public.resident_invoice_periods(
      v_due.frequency,
      p_start,
      p_end
    )
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.resident_id = p_resident
        AND i.due_type_id = p_due_type
        AND i.period_start = v_period.bill_start
        AND i.period_end = v_period.bill_end
    )
    INTO v_exists;

    IF v_exists THEN
      v_duplicate_count := v_duplicate_count + 1;
    ELSE
      v_create_count := v_create_count + 1;
      v_total := v_total + v_due.amount;
    END IF;

    v_periods := v_periods || jsonb_build_array(
      jsonb_build_object(
        'period_start', v_period.bill_start,
        'period_end', v_period.bill_end,
        'period_label', v_period.bill_label,
        'due_date', p_due_date,
        'amount', v_due.amount,
        'already_exists', v_exists
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'resident_id', v_resident.id,
    'resident_name', v_resident.full_name,
    'due_type_id', v_due.id,
    'due_type_name', v_due.name,
    'frequency', v_due.frequency,
    'amount_per_period', v_due.amount,
    'periods', v_periods,
    'create_count', v_create_count,
    'duplicate_count', v_duplicate_count,
    'total_to_create', v_total
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.preview_resident_invoices(
  uuid,
  uuid,
  date,
  date,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.preview_resident_invoices(
  uuid,
  uuid,
  date,
  date,
  date
)
TO authenticated;

-- ============================================================
-- RESIDENT GENERATION WITH EXPLICIT DUE DATE
-- ============================================================

DROP FUNCTION IF EXISTS public.generate_resident_invoices(
  uuid,
  uuid,
  date,
  date
);

CREATE OR REPLACE FUNCTION public.generate_resident_invoices(
  p_resident uuid,
  p_due_type uuid,
  p_start date,
  p_end date,
  p_due_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due public.due_types%rowtype;
  v_period record;
  v_created integer := 0;
  v_skipped integer := 0;
  v_row_count integer;
BEGIN
  IF NOT public.is_estate_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'Choose a due date.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.residents
    WHERE id = p_resident
  ) THEN
    RAISE EXCEPTION 'Resident not found.';
  END IF;

  SELECT *
  INTO STRICT v_due
  FROM public.due_types
  WHERE id = p_due_type;

  IF v_due.billing_scope <> 'resident' THEN
    RAISE EXCEPTION 'Select an Individual Resident due type.';
  END IF;

  IF v_due.amount <= 0 THEN
    RAISE EXCEPTION 'The due type amount must be greater than zero.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'resident-billing:'
      || p_resident::text
      || ':'
      || p_due_type::text,
      0
    )
  );

  FOR v_period IN
    SELECT *
    FROM public.resident_invoice_periods(
      v_due.frequency,
      p_start,
      p_end
    )
  LOOP
    INSERT INTO public.invoices (
      house_id,
      resident_id,
      due_type_id,
      period_start,
      period_end,
      period_label,
      amount,
      amount_paid,
      status,
      due_date
    )
    VALUES (
      NULL,
      p_resident,
      p_due_type,
      v_period.bill_start,
      v_period.bill_end,
      v_period.bill_label,
      v_due.amount,
      0,
      'unpaid',
      p_due_date
    )
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 1 THEN
      v_created := v_created + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'skipped', v_skipped
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.generate_resident_invoices(
  uuid,
  uuid,
  date,
  date,
  date
)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.generate_resident_invoices(
  uuid,
  uuid,
  date,
  date,
  date
)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;



-- ============================================================
-- SOURCE: supabase/migration_registration_decline_reason_required.sql
-- ============================================================

BEGIN;

ALTER TABLE public.registration_requests
  DROP CONSTRAINT IF EXISTS registration_decline_reason_required;

ALTER TABLE public.registration_requests
  ADD CONSTRAINT registration_decline_reason_required
  CHECK (
    status IS DISTINCT FROM 'declined'
    OR (
      decline_reason IS NOT NULL
      AND length(btrim(decline_reason)) >= 3
    )
  )
  NOT VALID;

-- NOT VALID allows any old declined records without reasons
-- to remain, while enforcing the rule on new/updated records.

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- SOURCE: supabase/migration_phase13_sms.sql
-- ============================================================

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



-- ============================================================
-- SOURCE: supabase/migration_production_alignment.sql
-- ============================================================

-- ZADANT
-- Production schema alignment.
--
-- Captures database guarantees that currently exist in production
-- but were not previously represented by a repository migration.
--
-- This migration is intentionally idempotent.
--
-- DO NOT apply manually to production yet.
-- It is first used by the clean-database reconstruction tests.

BEGIN;

-- ============================================================
-- RESIDENT AUTH IDENTITY
-- ============================================================
--
-- One Supabase Auth user must correspond to at most one
-- resident record.
--
-- Production already has this unique index.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.residents
    WHERE auth_user_id IS NOT NULL
    GROUP BY auth_user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate resident auth_user_id values exist. Reconcile them before applying this migration.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS
  residents_auth_user_id_unique
ON public.residents (
  auth_user_id
)
WHERE auth_user_id IS NOT NULL;

-- ============================================================
-- PAYMENT REFERENCE + INVOICE UNIQUENESS
-- ============================================================
--
-- A single Paystack reference may legitimately cover multiple
-- invoices, so paystack_reference itself is NOT unique.
--
-- However, the same Paystack transaction must never create
-- two allocations against the same invoice.
--
-- Production currently enforces:
--
--   UNIQUE (paystack_reference, invoice_id)
--
-- This preserves multi-invoice payments while preventing
-- duplicate application to one invoice.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1

    FROM public.payments

    WHERE paystack_reference IS NOT NULL
      AND invoice_id IS NOT NULL

    GROUP BY
      paystack_reference,
      invoice_id

    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate payment reference/invoice allocations exist. Reconcile them before applying this migration.';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1

    FROM pg_constraint

    WHERE conrelid =
      'public.payments'::regclass

      AND conname =
        'payments_reference_invoice_unique'
  ) THEN
    ALTER TABLE public.payments

    ADD CONSTRAINT
      payments_reference_invoice_unique

    UNIQUE (
      paystack_reference,
      invoice_id
    );
  END IF;
END
$$;

COMMIT;


-- ============================================================
-- SOURCE: supabase/migration_human_readable_ids.sql
-- ============================================================

-- VERDANT
-- Human-readable support IDs for residents and payments.
--
-- Internal UUID primary keys remain unchanged and continue to be used for
-- relationships, authorization and security.
--
-- Examples:
--   Resident: RES-000001
--   Payment:  PAY-202609-000001
--
-- Safe to rerun.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.resident_public_id_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.payment_public_id_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS resident_code text;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_code text;

-- Drop the guards before a possible backfill so this migration remains
-- rerunnable even if a previous attempt stopped part-way through.
DROP TRIGGER IF EXISTS residents_human_id_guard
ON public.residents;

DROP TRIGGER IF EXISTS payments_human_id_guard
ON public.payments;

-- Align the resident sequence with any IDs that may already exist.
DO $$
DECLARE
  v_max bigint;
  r record;
BEGIN
  SELECT coalesce(
    max(
      substring(
        resident_code
        FROM '^RES-([0-9]+)$'
      )::bigint
    ),
    0
  )
  INTO v_max
  FROM public.residents
  WHERE resident_code ~ '^RES-[0-9]+$';

  PERFORM setval(
    'public.resident_public_id_seq'::regclass,
    greatest(v_max + 1, 1),
    false
  );

  FOR r IN
    SELECT id
    FROM public.residents
    WHERE resident_code IS NULL
    ORDER BY created_at NULLS LAST, id
  LOOP
    UPDATE public.residents
    SET resident_code =
      'RES-' ||
      lpad(
        nextval(
          'public.resident_public_id_seq'::regclass
        )::text,
        6,
        '0'
      )
    WHERE id = r.id;
  END LOOP;
END
$$;

-- Align the payment sequence with any IDs that may already exist, then
-- backfill existing payment rows using the month in which the payment record
-- was created.
DO $$
DECLARE
  v_max bigint;
  r record;
  v_stamp text;
BEGIN
  SELECT coalesce(
    max(
      substring(
        payment_code
        FROM '^PAY-[0-9]{6}-([0-9]+)$'
      )::bigint
    ),
    0
  )
  INTO v_max
  FROM public.payments
  WHERE payment_code ~ '^PAY-[0-9]{6}-[0-9]+$';

  PERFORM setval(
    'public.payment_public_id_seq'::regclass,
    greatest(v_max + 1, 1),
    false
  );

  FOR r IN
    SELECT
      id,
      created_at,
      paid_at
    FROM public.payments
    WHERE payment_code IS NULL
    ORDER BY created_at NULLS LAST, id
  LOOP
    v_stamp :=
      to_char(
        coalesce(
          r.created_at,
          r.paid_at,
          now()
        )
        AT TIME ZONE 'Africa/Lagos',
        'YYYYMM'
      );

    UPDATE public.payments
    SET payment_code =
      'PAY-' ||
      v_stamp ||
      '-' ||
      lpad(
        nextval(
          'public.payment_public_id_seq'::regclass
        )::text,
        6,
        '0'
      )
    WHERE id = r.id;
  END LOOP;
END
$$;

ALTER TABLE public.residents
  ALTER COLUMN resident_code SET NOT NULL;

ALTER TABLE public.payments
  ALTER COLUMN payment_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS residents_resident_code_unique
ON public.residents (resident_code);

CREATE UNIQUE INDEX IF NOT EXISTS payments_payment_code_unique
ON public.payments (payment_code);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'residents_resident_code_format'
      AND conrelid = 'public.residents'::regclass
  ) THEN
    ALTER TABLE public.residents
      ADD CONSTRAINT residents_resident_code_format
      CHECK (
        resident_code ~ '^RES-[0-9]{6,}$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_payment_code_format'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_payment_code_format
      CHECK (
        payment_code ~ '^PAY-[0-9]{6}-[0-9]{6,}$'
      );
  END IF;
END
$$;

-- Generate IDs inside PostgreSQL so concurrent inserts cannot produce the same
-- number. The human-readable IDs are references only; UUIDs remain the
-- security and relational identifiers.
CREATE OR REPLACE FUNCTION public.manage_human_readable_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stamp text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'residents' THEN
      NEW.resident_code :=
        'RES-' ||
        lpad(
          nextval(
            'public.resident_public_id_seq'::regclass
          )::text,
          6,
          '0'
        );

      RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'payments' THEN
      v_stamp :=
        to_char(
          coalesce(
            NEW.created_at,
            now()
          )
          AT TIME ZONE 'Africa/Lagos',
          'YYYYMM'
        );

      NEW.payment_code :=
        'PAY-' ||
        v_stamp ||
        '-' ||
        lpad(
          nextval(
            'public.payment_public_id_seq'::regclass
          )::text,
          6,
          '0'
        );

      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'residents'
       AND NEW.resident_code
           IS DISTINCT FROM
           OLD.resident_code
    THEN
      RAISE EXCEPTION
        'Resident ID cannot be changed';
    END IF;

    IF TG_TABLE_NAME = 'payments'
       AND NEW.payment_code
           IS DISTINCT FROM
           OLD.payment_code
    THEN
      RAISE EXCEPTION
        'Payment ID cannot be changed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.manage_human_readable_id()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER residents_human_id_guard
BEFORE INSERT OR UPDATE OF resident_code
ON public.residents
FOR EACH ROW
EXECUTE FUNCTION public.manage_human_readable_id();

CREATE TRIGGER payments_human_id_guard
BEFORE INSERT OR UPDATE OF payment_code
ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.manage_human_readable_id();

NOTIFY pgrst, 'reload schema';

COMMIT;

