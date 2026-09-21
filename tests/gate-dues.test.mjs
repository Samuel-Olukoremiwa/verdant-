import fs from 'node:fs'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {PGlite}=require(process.env.PGLITE_TEST_MODULE||'@electric-sql/pglite')
const admin='00000000-0000-4000-8000-000000000001',gate='00000000-0000-4000-8000-000000000002',resident='00000000-0000-4000-8000-000000000003',superAdmin='00000000-0000-4000-8000-000000000004'
const query=async(db,sql,args=[])=> (await db.query(sql,args)).rows
const first=async(db,sql,args=[])=>(await query(db,sql,args))[0]
test('gate entry queues resident and all admin notices atomically with date validation and role isolation',async t=>{
 const db=new PGlite()
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;`)
 for(const name of ['schema.sql','auth.sql','migration_phase1_6_repairs.sql'])await db.exec(fs.readFileSync(new URL('../supabase/'+name,import.meta.url),'utf8'))
 await db.exec('create table registration_requests(id uuid default gen_random_uuid());')
 await db.query('insert into auth.users values($1,$2),($3,$4),($5,$6),($7,$8)',[admin,'admin@example.test',gate,'gate@example.test',resident,'resident@example.test',superAdmin,'super@example.test'])
 await db.query("insert into admins(auth_user_id,role,full_name) values($1,'admin','Admin'),($2,'gate_staff','Gate'),($3,'super_admin','Super')",[admin,gate,superAdmin])
 const house=(await first(db,"insert into houses(address) values('Sample house') returning id")).id
 const r=(await first(db,"insert into residents(house_id,auth_user_id,full_name,email,qr_code_value) values($1,$2,'Resident','resident@example.test','RES-test') returning id",[house,resident])).id
 const migration=fs.readFileSync(new URL('../supabase/migration_gate_dues_dates.sql',import.meta.url),'utf8')
 await db.exec(migration);await db.exec(migration)
 const due=(await first(db,"select id from due_types limit 1")).id
 const invoice=(await first(db,"insert into invoices(house_id,due_type_id,amount,amount_paid,status,due_date) values($1,$2,5000,1000,'partial','2026-09-01') returning id",[house,due])).id
 const scan=async(direction='entry')=>(await first(db,'select record_resident_scan($1,$2) as result',['RES-test',direction])).result
 await t.test('legacy unknown dates remain; new and edited dates are mandatory',async()=>{
  assert.equal((await first(db,'select move_in_date from residents where id=$1',[r])).move_in_date,null)
  await assert.rejects(db.query("insert into residents(full_name) values('Missing')"),/required/)
  await assert.rejects(db.query('update residents set move_in_date=null where id=$1',[r]),/required/)
  await db.query("update residents set move_in_date='2026-09-01',property_allocation_date='2026-08-01' where id=$1",[r])
  await assert.rejects(db.query('insert into registration_requests default values'),/required/)
 })
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[gate]);await db.exec('set role authenticated')
 let log
 await t.test('one scan queues exactly the resident and both administrator roles',async()=>{
  log=await scan();assert.equal(log.name,'Resident')
  // Gate staff must not read financial notifications or write bypass logs.
  assert.equal((await query(db,'select * from gate_due_alerts')).length,0)
  await assert.rejects(db.query("insert into access_logs(resident_id,direction) values($1,'entry')",[r]),/permission denied/)
  await db.exec('reset role')
  const alert=await first(db,'select details from gate_due_alerts where id=$1',[log.id]);assert.equal(alert.details.balance,4000)
  const recipients=await query(db,'select recipient from gate_due_emails order by recipient');assert.deepEqual(recipients.map(x=>x.recipient),['admin@example.test','resident@example.test','super@example.test'])
  await db.exec('set role authenticated')
 })
 await t.test('duplicate scanner reads and exits do not send duplicate alerts',async()=>{
  assert.equal((await scan()).id,log.id);await scan('exit')
  await db.exec('reset role');assert.equal((await first(db,'select count(*)::int n from gate_due_alerts')).n,1);await db.exec('set role authenticated')
 })
 await t.test('resident role cannot scan or read alerts; admins can read alerts',async()=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[resident]);await assert.rejects(scan(),/Not authorized/);assert.equal((await query(db,'select * from gate_due_alerts')).length,0)
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);assert.equal((await query(db,'select * from gate_due_alerts')).length,1)
  await assert.rejects(db.query('select * from claim_gate_due_emails(null)'),/permission denied/)
  await db.exec('reset role')
 })
 await t.test('claimed jobs are leased once and cannot be reclaimed concurrently',async()=>{
  await db.exec('set role service_role')
  const jobs=await Promise.all(Array.from({length:4},()=>query(db,'select * from claim_gate_due_emails(null)')))
  assert.equal(jobs.flat().length,3);assert.equal(new Set(jobs.flat().map(x=>x.id)).size,3)
  await db.exec('reset role');await db.exec("update gate_due_emails set first_attempt_at=now()-interval '24 hours',available_at=now()-interval '1 minute'")
  await query(db,'select * from claim_gate_due_emails(null)');assert.equal((await first(db,"select count(*)::int n from gate_due_emails where status='failed'")).n,3)
 })
 await t.test('cleared balances and inactive passes produce no dues alerts',async()=>{
  await db.query('update invoices set amount_paid=amount,status=\'paid\' where id=$1',[invoice]);await db.exec("update access_logs set scanned_at=now()-interval '1 minute'")
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[gate]);await db.exec('set role authenticated');await scan();await db.exec('reset role');assert.equal((await first(db,'select count(*)::int n from gate_due_alerts')).n,1)
  await db.query('update residents set is_active=false where id=$1',[r]);await db.exec('set role authenticated');await assert.rejects(scan(),/inactive/)
 })
 }finally{await db.close()}
})
