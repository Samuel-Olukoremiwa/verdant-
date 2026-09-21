import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {test} from 'node:test'
import assert from 'node:assert/strict'
const details={name:'Sample Resident',email:'resident@example.test',phone:'08000000000',address:'Sample home',entered_at:'2026-09-21T10:00:00Z',balance:4000,bills:[{label:'Service charge',amount:4000,due_date:'2026-09-01'}]}
function setup({configured=true,accepted=true,throws=false}={}){
 const jobs=[{id:'email-job',alert_id:'scan-1',recipient:'resident@example.test',audience:'resident',attempts:1}],requests=[],updates=[]
 const db={rpc:async()=>({data:jobs.splice(0,1),error:null}),from:table=>table==='gate_due_alerts'?{select:()=>({eq:()=>({single:async()=>({data:{details},error:null})})})}:{update:values=>{updates.push(values);return {eq:()=>({eq:async()=>({error:null})})}}}}
 const compiled={exports:{}}
 const js=ts.transpileModule(fs.readFileSync(new URL('../src/lib/gate-due-emails.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 vm.runInNewContext(js,{module:compiled,exports:compiled.exports,process:{env:configured?{RESEND_API_KEY:'mock-only',RESEND_FROM_EMAIL:'sender@example.test'}:{}},Date,Intl,AbortSignal,setTimeout:fn=>fn(),require:name=>name==='server-only'?{}:{createServiceClient:()=>db},fetch:async(url,options)=>{requests.push({url,options});if(throws)throw new Error('Timeout');return {ok:accepted,json:async()=>accepted?{id:'provider-id'}:{message:'Rejected'}}}})
 return {...compiled.exports,requests,updates}
}
test('gate email sends individual recipients and marks only provider acceptance as sent',async()=>{
 const env=setup();const result=await env.sendGateDueEmails();assert.equal(result.sent,1);assert.equal(env.updates[0].status,'sent')
 assert.equal(env.requests[0].options.headers['Idempotency-Key'],'gate-dues-email-job')
 const body=JSON.parse(env.requests[0].options.body);assert.deepEqual(body.to,['resident@example.test']);assert.equal(body.cc,undefined);assert.match(body.text,/household balance/);assert.match(body.text,/11:00:00 WAT/)
})
for(const scenario of [{accepted:false},{throws:true}])test('rejected or uncertain email remains queued without claiming success '+JSON.stringify(scenario),async()=>{
 const env=setup(scenario),result=await env.sendGateDueEmails();assert.equal(result.sent,0);assert.equal(result.failed,1);assert.equal(env.updates[0].status,'pending');assert.equal(env.updates[0].sent_at,undefined)
})
test('missing sender configuration does not contact a provider or consume queued mail',async()=>{
 const env=setup({configured:false}),result=await env.sendGateDueEmails();assert.equal(result.configured,false);assert.equal(env.requests.length,0);assert.equal(env.updates.length,0)
})
test('administrator notification identifies the entrant and the outstanding household balance',()=>{
 const env=setup();const text=env.gateDueMessage(details,'admin');assert.match(text,/Sample Resident entered/);assert.match(text,/resident@example.test/);assert.match(text,/08000000000/);assert.match(text,/4,000.00/)
})
