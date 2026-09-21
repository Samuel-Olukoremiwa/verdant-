import {after,NextRequest,NextResponse} from 'next/server'
import {z} from 'zod'
import {createClient} from '@/lib/supabase/server'
import {sendGateDueEmails} from '@/lib/gate-due-emails'
export const maxDuration=60
export async function POST(req:NextRequest){
 const db=await createClient()
 const {data:{user}}=await db.auth.getUser()
 if(!user)return NextResponse.json({error:'Not signed in'},{status:401})
 const {data:staff}=await db.from('admins').select('role').eq('auth_user_id',user.id).maybeSingle()
 if(!staff||!['admin','super_admin','gate_staff'].includes(staff.role))return NextResponse.json({error:'Not authorized'},{status:403})
 const parsed=z.object({code:z.string().min(1).max(200),direction:z.enum(['entry','exit'])}).strict().safeParse(await req.json().catch(()=>null))
 if(!parsed.success)return NextResponse.json({error:'Invalid scan'},{status:400})
 const {data,error}=await db.rpc('record_resident_scan',{p_code:parsed.data.code,p_direction:parsed.data.direction})
 if(error){const message=error.message.includes('inactive')?'Resident access is inactive. Entry denied.':error.message.includes('not recognized')?'QR code not recognized.':'Unable to record scan. Please try again.';return NextResponse.json({error:message},{status:400})}
 after(async()=>{try{await sendGateDueEmails()}catch{console.error('Gate reminder queue could not be processed')}})
 return NextResponse.json({name:data.name,direction:data.direction})
}
