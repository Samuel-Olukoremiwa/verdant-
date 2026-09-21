// Runs against an isolated in-memory PostgreSQL instance; never uses .env or Supabase.
// Install @electric-sql/pglite in a separate test directory and set PGLITE_TEST_MODULE.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { PGlite } = require(process.env.PGLITE_TEST_MODULE || '@electric-sql/pglite')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const setup = async () => {
  const db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth, public to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`)
  await db.exec(fs.readFileSync(root + '/supabase/schema.sql', 'utf8'))
  await db.exec(fs.readFileSync(root + '/supabase/auth.sql', 'utf8'))
  await db.exec(fs.readFileSync(root + '/supabase/migration_phase1_6_repairs.sql', 'utf8'))
  await db.exec(fs.readFileSync(root + '/supabase/migration_phase7_12.sql', 'utf8'))
  await db.exec('grant select,insert,update,delete on all tables in schema public to authenticated;')
  return db
}
const first = async (db, sql, args=[]) => (await db.query(sql,args)).rows[0]
const uuid = randomUUID
const fixtures = async db => {
 const ownerAuth=uuid(),tenantAuth=uuid(),adminAuth=uuid(),familyAuth=uuid(),house=uuid(),owner=uuid(),tenant=uuid(),family=uuid()
 await db.query('insert into auth.users values($1),($2),($3),($4)',[ownerAuth,tenantAuth,adminAuth,familyAuth])
 await db.query("insert into admins(auth_user_id,role) values($1,'super_admin')",[adminAuth])
 await db.query("insert into houses(id,address) values($1,'Test house')",[house])
 await db.query("insert into residents(id,auth_user_id,house_id,full_name,relationship,email) values($1,$2,$3,'Owner','owner','owner@example.test'),($4,$5,$3,'Tenant','tenant','tenant@example.test'),($6,$7,$3,'Family','family_member','family@example.test')",[owner,ownerAuth,house,tenant,tenantAuth,family,familyAuth])
 const due=(await first(db,"select id from due_types where name='Service Charge'")).id
 return {ownerAuth,tenantAuth,adminAuth,familyAuth,house,owner,tenant,family,due}
}
const quote = (db,f,items,extra={}) => first(db,'select prepare_estate_payment($1,$2::jsonb,$3,$4,$5) as result',[f.ownerAuth,JSON.stringify(items),extra.reference || 'INV-test-reference',extra.expected ?? null,extra.quoteOnly ?? true]).then(x=>x.result)
const confirm = (db,ref,amount,currency='NGN') => first(db,'select confirm_estate_payment($1,$2,$3,now()) as result',[ref,amount,currency]).then(x=>x.result)
const month = async db => (await first(db,"select to_char(date_trunc('month',now() at time zone 'Africa/Lagos'),'YYYY-MM') as m")).m

test('migration, quotes, household access and atomic accounting', async t => {
 const db=await setup(); const f=await fixtures(db); const m=await month(db)
 const items=[{due_type_id:f.due,month:m}]
 await t.test('migration is repeatable and fills missing QR codes without replacing existing ones',async()=>{
  await db.exec(fs.readFileSync(root+'/supabase/migration_phase1_6_repairs.sql','utf8'))
  const before=(await first(db,'select qr_code_value from residents where id=$1',[f.owner])).qr_code_value
  assert.ok(before?.startsWith('RES-'))
  await db.exec(fs.readFileSync(root+'/supabase/migration_phase1_6_repairs.sql','utf8'))
  assert.equal((await first(db,'select qr_code_value from residents where id=$1',[f.owner])).qr_code_value,before)
 })
 await t.test('quote does not create invoices or payment records',async()=>{
  assert.equal((await quote(db,f,items)).total_kobo,500000)
  assert.equal((await first(db,'select count(*)::int as n from invoices')).n,0)
  assert.equal((await first(db,'select count(*)::int as n from payments')).n,0)
 })
 await t.test('stale quote and duplicate item rejection roll back newly created invoices',async()=>{
  await assert.rejects(quote(db,f,items,{quoteOnly:false,expected:1}),/balance changed/)
  await assert.rejects(quote(db,f,[...items,...items],{quoteOnly:false,expected:1000000}),/more than once/)
  assert.equal((await first(db,'select count(*)::int as n from invoices')).n,0)
 })
 await quote(db,f,items,{quoteOnly:false,expected:500000})
 await t.test('wrong amount and currency never mark a payment successful',async()=>{
  await assert.rejects(confirm(db,'INV-test-reference',1),/does not match/)
  await assert.rejects(confirm(db,'INV-test-reference',500000,'USD'),/does not match/)
  assert.equal((await first(db,'select status from payments')).status,'pending')
 })
 await t.test('invoice write failure rolls back payment status; retry succeeds',async()=>{
  await db.exec("create function test_fail_invoice() returns trigger language plpgsql as $$ begin raise exception 'simulated invoice failure'; end $$; create trigger test_failure before update on invoices for each row execute function test_fail_invoice();")
  await assert.rejects(confirm(db,'INV-test-reference',500000),/simulated invoice failure/)
  assert.equal((await first(db,'select status from payments')).status,'pending')
  assert.equal(Number((await first(db,'select amount_paid from invoices')).amount_paid),0)
  await db.exec('drop trigger test_failure on invoices;')
  assert.equal((await confirm(db,'INV-test-reference',500000)).applied,1)
  assert.equal((await confirm(db,'INV-test-reference',500000)).alreadyProcessed,1)
  assert.equal(Number((await first(db,'select amount_paid from invoices')).amount_paid),5000)
 })
 await t.test('paid months are priced as zero',async()=>assert.equal((await quote(db,f,items)).total_kobo,0))
 await t.test('owner and assigned tenant may pay; unassigned family cannot',async()=>{
  await db.query('update houses set billing_responsible_resident_id=$1 where id=$2',[f.tenant,f.house])
  assert.equal((await quote(db,f,items)).total_kobo,0)
  assert.equal((await quote(db,{...f,ownerAuth:f.tenantAuth},items)).total_kobo,0)
  await assert.rejects(quote(db,{...f,ownerAuth:f.familyAuth},items),/not responsible/)
 })
 await t.test('monthly billing reuses advance invoices and reruns do not duplicate',async()=>{
  const one=(await first(db,'select generate_estate_fixed_charges() as r')).r
  assert.equal(one.created,1); assert.equal(one.skipped,1)
  assert.equal((await first(db,'select generate_estate_fixed_charges() as r')).r.created,0)
 })
 await t.test('monthly insert failure rolls back the whole batch',async()=>{
  await db.query("insert into houses(address) values('Another home')")
  await db.exec("create function test_fail_insert() returns trigger language plpgsql as $$ begin raise exception 'simulated insert failure'; end $$; create trigger test_insert_failure before insert on invoices for each row execute function test_fail_insert();")
  const before=(await first(db,'select count(*)::int n from invoices')).n
  await assert.rejects(first(db,'select generate_estate_fixed_charges()'),/simulated insert failure/)
  assert.equal((await first(db,'select count(*)::int n from invoices')).n,before)
  await db.exec('drop trigger test_insert_failure on invoices;')
 })
 await t.test('RLS hides bills from unassigned family and stops privilege changes',async()=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[f.familyAuth])
  await db.exec('set role authenticated')
  assert.equal((await first(db,'select count(*)::int n from invoices')).n,0)
  assert.equal((await db.query("update residents set relationship='owner' where id=$1 returning id",[f.family])).rows.length,0)
  await assert.rejects(first(db,"select confirm_estate_payment('INV-test-reference',500000,'NGN',now())"),/permission denied/)
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[f.ownerAuth])
  await db.exec('set role authenticated')
  assert.equal((await first(db,'select count(*)::int n from invoices')).n,2)
  await db.exec('reset role')
 })
 await t.test('admin can add a family member to the existing house with separate dates',async()=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[f.adminAuth])
  await db.exec('set role authenticated')
  const r=(await first(db,'select add_estate_resident($1,$2,$3) as id',[f.house,{}, {full_name:'New Family',phone:'08012345678',email:'new@example.test',relationship:'family_member',move_in_date:'2026-09-01',property_allocation_date:'2026-08-01'}])).id
  await db.exec('reset role')
  const row=await first(db,'select house_id,move_in_date::text,property_allocation_date::text,qr_code_value from residents where id=$1',[r])
  assert.equal(row.house_id,f.house);assert.equal(row.move_in_date,'2026-09-01');assert.equal(row.property_allocation_date,'2026-08-01');assert.ok(row.qr_code_value)
 })
 await t.test('partial/manual payment is atomic, repeatable, and quote deducts it',async()=>{
  const cda=(await first(db,"select id from due_types where name='CDA Levy'")).id
  const inv=(await first(db,'select id from invoices where due_type_id=$1',[cda])).id
  await first(db,'select record_estate_manual_payment($1,$2,200,$3)',[inv,f.owner,'MANUAL-test-partial'])
  await first(db,'select record_estate_manual_payment($1,$2,200,$3)',[inv,f.owner,'MANUAL-test-partial'])
  assert.equal((await quote(db,f,[{due_type_id:cda,month:m}])).total_kobo,80000)
  await assert.rejects(first(db,'select record_estate_manual_payment($1,$2,1000,$3)',[inv,f.owner,'MANUAL-too-much']),/Invalid payment/)
 })
 await t.test('multiple months share a reference and confirmation applies every line exactly once',async()=>{
  const next=(await first(db,"select to_char(date_trunc('month',now() at time zone 'Africa/Lagos')+interval '1 month','YYYY-MM') m")).m
  const next2=(await first(db,"select to_char(date_trunc('month',now() at time zone 'Africa/Lagos')+interval '2 months','YYYY-MM') m")).m
  const selection=[{due_type_id:f.due,month:next},{due_type_id:f.due,month:next2}]
  const q=await quote(db,f,selection,{quoteOnly:false,expected:1000000,reference:'INV-multiple-months'})
  assert.equal(q.lines.length,2)
  assert.equal((await confirm(db,'INV-multiple-months',1000000)).applied,2)
  assert.equal((await confirm(db,'INV-multiple-months',1000000)).alreadyProcessed,2)
  assert.equal((await quote(db,f,selection)).total_kobo,0)
 })
 await t.test('partial online payments add to existing balance without overwriting it',async()=>{
  const cda=(await first(db,"select id from due_types where name='CDA Levy'")).id
  const inv=(await first(db,'select id from invoices where due_type_id=$1 and house_id=$2',[cda,f.house])).id
  await quote(db,f,[{invoice_id:inv,amount:100}],{quoteOnly:false,expected:10000,reference:'INV-partial-one'})
  await quote(db,f,[{invoice_id:inv,amount:150}],{quoteOnly:false,expected:15000,reference:'INV-partial-two'})
  await Promise.all([confirm(db,'INV-partial-one',10000),confirm(db,'INV-partial-two',15000)])
  assert.equal(Number((await first(db,'select amount_paid from invoices where id=$1',[inv])).amount_paid),450)
 })
 await t.test('expenses are writable by admins, not residents, and reject nonpositive amounts',async()=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[f.adminAuth])
  await db.exec('set role authenticated')
  await db.exec("insert into expenses(category,description,amount,expense_date) values('Maintenance','Test repair',100,current_date)")
  await assert.rejects(db.exec("insert into expenses(category,description,amount,expense_date) values('Maintenance','Bad expense',0,current_date)"))
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[f.familyAuth])
  await db.exec('set role authenticated')
  assert.equal((await first(db,'select count(*)::int n from expenses')).n,0)
  await assert.rejects(db.exec("insert into expenses(category,description,amount,expense_date) values('Maintenance','Not permitted',100,current_date)"))
  await db.exec('reset role')
 })
 await db.close()
})

test('visitor invitation permissions and single-use entry', async t => {
 const db=await setup(), f=await fixtures(db)
 const login=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
 const redeem=async code=>(await first(db,'select redeem_visitor_pass($1) as result',[code])).result
 // Calling a composite-returning volatile function with .* evaluates it per field in PostgreSQL.
 const createOnce=async()=> (await first(db,"select * from create_visitor_pass('Guest',now()+interval '1 day')"))
 await t.test('repeatable migration',async()=>{await db.exec(fs.readFileSync(root+'/supabase/migration_phase7_12.sql','utf8'))})
 await login(f.familyAuth)
 let pass=await createOnce()
 await t.test('family residents can invite; address and host are assigned by database',async()=>{
  assert.equal(pass.resident_id,f.family);assert.equal(pass.house_id,f.house);assert.equal(pass.address,'Test house');assert.match(pass.code,/^[0-9A-F]{10}$/)
 })
 await t.test('resident cannot consume a visitor code or write a pass directly',async()=>{
  await assert.rejects(redeem(pass.code),/Only estate staff/)
  await assert.rejects(db.query("insert into visitor_passes(resident_id,house_id,code,address,expires_at) values($1,$2,'SPOOF','Wrong house',now()+interval '1 day')",[f.family,f.house]),/permission denied|row-level security/)
 })
 await t.test('other residents cannot view or cancel the invitation',async()=>{
  await login(f.ownerAuth)
  assert.equal((await first(db,'select count(*)::int n from visitor_passes')).n,0)
  await assert.rejects(first(db,'select cancel_visitor_pass($1)',[pass.id]),/cannot be cancelled/)
 })
 await t.test('entry records once even when redemption requests race',async()=>{
  await login(f.adminAuth)
  const outcomes=await Promise.allSettled([redeem(pass.code.toLowerCase()),redeem(pass.code)])
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1)
  assert.match(outcomes.find(o=>o.status==='rejected').reason.message,/already been used/)
  const result=outcomes.find(o=>o.status==='fulfilled').value
  assert.equal(result.address,'Test house');assert.equal(result.host,'Family')
  const row=await first(db,'select redeemed_at,redeemed_by from visitor_passes where id=$1',[pass.id]);assert.ok(row.redeemed_at);assert.ok(row.redeemed_by)
 })
 await t.test('cancelled and expired passes cannot be used',async()=>{
  await login(f.familyAuth);const cancelled=await createOnce();await first(db,'select cancel_visitor_pass($1)',[cancelled.id])
  const expired=await createOnce();await db.exec('reset role');await db.query("update visitor_passes set starts_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=$1",[expired.id]);await login(f.adminAuth)
  await assert.rejects(redeem(cancelled.code),/cancelled/);await assert.rejects(redeem(expired.code),/expired/)
 })
 await t.test('host deactivation and a house move invalidate outstanding passes',async()=>{
  await login(f.familyAuth);const pending=await createOnce();await db.exec('reset role');await db.query('update residents set is_active=false where id=$1',[f.family]);await login(f.adminAuth)
  await assert.rejects(redeem(pending.code),/no longer has access/)
  await db.exec('reset role');await db.query('update residents set is_active=true,house_id=null where id=$1',[f.family]);await login(f.adminAuth)
  await assert.rejects(redeem(pending.code),/no longer has access/)
 })
 await t.test('past expiry and inactive/missing-house profiles cannot generate codes',async()=>{
  await login(f.ownerAuth);await assert.rejects(first(db,"select * from create_visitor_pass('Bad',now()-interval '1 second')"),/future/)
  await login(f.familyAuth);await assert.rejects(createOnce(),/house is required/)
 })
 await t.test('gate-only staff can redeem, but cannot create passes without a resident profile',async()=>{
  await login(f.ownerAuth);const gatePass=await createOnce();await db.exec('reset role')
  const gate=uuid();await db.query('insert into auth.users values($1)',[gate]);await db.query("insert into admins(auth_user_id,role,full_name) values($1,'gate_staff','Gate test')",[gate]);await login(gate)
  assert.equal((await redeem(gatePass.code)).visitor,'Guest');await assert.rejects(createOnce(),/resident with a house/)
 })
 await db.close()
})

test('SMS dispatch migration protects audit records and prevents duplicate claims',async t=>{
 const db=await setup()
 const sql=fs.readFileSync(root+'/supabase/migration_phase13_sms.sql','utf8')
 await db.exec(sql);await db.exec(sql)
 await t.test('only service role can claim and update a notification',async()=>{
  await db.exec('set role authenticated')
  await assert.rejects(db.exec("insert into sms_dispatches(event_key,kind) values('visitor:test','visitor')"),/permission denied/)
  await assert.rejects(db.exec('select * from sms_dispatches'),/permission denied/)
  await db.exec('reset role; set role service_role')
  await db.exec("insert into sms_dispatches(event_key,kind) values('visitor:test','visitor')")
  await db.exec("update sms_dispatches set status='accepted',provider_code='000' where event_key='visitor:test'")
 })
 await t.test('concurrent/repeated event claims fail instead of creating another send',async()=>{
  await assert.rejects(db.exec("insert into sms_dispatches(event_key,kind) values('visitor:test','visitor')"),/duplicate key/)
  assert.equal((await first(db,"select status from sms_dispatches where event_key='visitor:test'")).status,'accepted')
 })
 await db.close()
})
