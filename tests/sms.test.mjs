import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
function load(name, extras={}) {
 const loaded={exports:{}}
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:loaded,exports:loaded.exports,process:{env:{KUDISMS_API_KEY:'test-secret',KUDISMS_SENDER_ID:'Verdant'}},AbortSignal,Date,...extras})
 return loaded.exports
}
test('normalizes Nigerian mobile formats without accepting multiple recipients',()=>{
 const {normalizeNigerianPhone:n}=load('sms')
 assert.equal(n('09130548110'),'2349130548110');assert.equal(n('+234 913 054 8110'),'2349130548110')
 for(const phone of ['abc','080123','09130548110,08012345678','+12345678901','23409130548110'])assert.equal(n(phone),null)
})
test('sends token in POST body and recognizes acceptance, not handset delivery',async()=>{
 let request
 const {sendSms}=load('sms',{fetch:async(url,options)=>{request={url,...options};return {ok:true,json:async()=>({status:'success',error_code:'000'})}}})
 const r=await sendSms('09130548110','Test');assert.equal(r.status,'accepted');assert.match(r.message,/not yet confirmed/)
 assert.equal(request.url,'https://my.kudisms.net/api/sms');assert.equal(request.method,'POST');assert.ok(!request.url.includes('test-secret'))
 const body=JSON.parse(request.body);assert.equal(body.recipients,'2349130548110');assert.equal(body.gateway,'2');assert.equal(request.redirect,'error')
})
test('HTTP success with provider error is a failure and raw provider text is not exposed',async()=>{
 const {sendSms}=load('sms',{fetch:async()=>({ok:true,json:async()=>({status:'error',error_code:'109',msg:'test-secret'})})})
 const result=await sendSms('09130548110','Test');assert.equal(result.status,'failed');assert.match(result.message,/credit/);assert.ok(!JSON.stringify(result).includes('test-secret'))
})
test('timeouts and malformed replies remain unknown and never retry',async()=>{
 let calls=0
 const {sendSms}=load('sms',{fetch:async()=>{calls++;throw new Error('test-secret')}})
 assert.equal((await sendSms('09130548110','Test')).status,'unknown');assert.equal(calls,1)
 const malformed=load('sms',{fetch:async()=>({ok:true,json:async()=>({})})})
 assert.equal((await malformed.sendSms('09130548110','Test')).status,'unknown')
})
test('duplicate and failed audit claims never send a paid SMS',async()=>{
 for(const code of ['23505','42P01']){
 let sent=0
 const {dispatchSms}=load('sms-dispatch',{require:name=>name.endsWith('/sms')?{normalizeNigerianPhone:()=>true,sendSms:async()=>{sent++;return {status:'accepted'}}}:{createServiceClient:()=>({from:()=>({insert:async()=>({error:{code}})})})}})
 assert.equal((await dispatchSms('test','visitor','09130548110','Hi')).status,code==='23505'?'skipped':'failed');assert.equal(sent,0)
 }
})
test('accepted notification is recorded after a successful claim',async()=>{
 let saved
 const {dispatchSms}=load('sms-dispatch',{require:name=>name.endsWith('/sms')?{normalizeNigerianPhone:()=>true,sendSms:async()=>({status:'accepted',code:'000',message:'Accepted'})}:{createServiceClient:()=>({from:()=>({insert:async()=>({error:null}),update:value=>{saved=value;return {eq:async()=>({error:null})}}})})}})
 assert.equal((await dispatchSms('test','registration','09130548110','Hi')).status,'accepted');assert.equal(saved.provider_code,'000')
})
