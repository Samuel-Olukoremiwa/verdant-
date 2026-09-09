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
