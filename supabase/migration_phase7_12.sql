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
