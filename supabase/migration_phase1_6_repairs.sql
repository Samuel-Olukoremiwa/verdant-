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
