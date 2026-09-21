import 'server-only'
import {createServiceClient} from '@/lib/supabase/service'
export type GateDueDetails={name:string;email:string|null;phone:string|null;address:string;entered_at:string;balance:number;bills:{label:string;amount:number;due_date:string|null}[]}
export function gateDueMessage(details:GateDueDetails,audience:string){
 const balance=Number(details.balance).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})
 const when=new Date(details.entered_at).toLocaleString('en-GB',{timeZone:'Africa/Lagos',hour12:false})+' WAT'
 const intro=audience==='admin'?`${details.name} entered the estate at ${when}.\nAddress: ${details.address}\nEmail: ${details.email||'Not provided'}\nPhone: ${details.phone||'Not provided'}`:`Hello ${details.name}, your gate entry was recorded at ${when}.`
 return `${intro}\n\nThe household at ${details.address} had NGN ${balance} in unpaid dues at entry. This is a household balance, not a statement of personal liability.\n\n${details.bills.map(b=>`${b.label}: NGN ${Number(b.amount).toFixed(2)}${b.due_date?` (due ${b.due_date})`:''}`).join('\n')}\n\n${audience==='admin'?'Please review the household account in Verdant.':'Please ask the household billing contact to review and settle the dues in Verdant. If you manage these bills, sign in to your resident portal.'} Payments made since entry may have changed the balance. Gate entry has not been restricted because of these dues.`
}
export async function sendGateDueEmails(){
 const apiKey=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL
 // Leave jobs pending when configuration is missing. Do not claim delivery.
 if(!apiKey||!from)return {sent:0,failed:0,configured:false}
 const db=createServiceClient(),deadline=Date.now()+40000
 let sent=0,failed=0
 while(Date.now()<deadline){
  const {data:jobs,error}=await db.rpc('claim_gate_due_emails',{p_alert:null})
  if(error)throw new Error('Unable to claim gate reminder')
  if(!jobs?.length)break
  const job=jobs[0]
  const {data:alert,error:readError}=await db.from('gate_due_alerts').select('details').eq('id',job.alert_id).single()
  if(readError||!alert)throw new Error('Unable to load gate reminder')
  let accepted=false
  try{
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`gate-dues-${job.id}`},body:JSON.stringify({from,to:[job.recipient],subject:job.audience==='admin'?'Gate entry: household with unpaid dues':'Your household dues reminder',text:gateDueMessage(alert.details as GateDueDetails,job.audience)}),signal:AbortSignal.timeout(8000)})
   const body=await response.json();accepted=response.ok&&typeof body.id==='string'
  }catch{ /* Retry the same provider idempotency key within the bounded window. */ }
  const {error:updateError}=await db.from('gate_due_emails').update(accepted?{status:'sent',sent_at:new Date().toISOString()}:{status:'pending',available_at:new Date(Date.now()+60000).toISOString()}).eq('id',job.id).eq('attempts',job.attempts)
  if(updateError)throw new Error('Unable to record gate reminder status')
  if(accepted)sent++;else failed++
  // Pace this worker. Provider 429 responses remain queued for a later attempt.
  await new Promise(resolve=>setTimeout(resolve,550))
 }
 return {sent,failed,configured:true}
}
