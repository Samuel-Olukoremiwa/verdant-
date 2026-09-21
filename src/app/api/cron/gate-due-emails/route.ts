import {NextRequest,NextResponse} from 'next/server'
import {sendGateDueEmails} from '@/lib/gate-due-emails'
export const maxDuration=60
export async function GET(req:NextRequest){const secret=process.env.CRON_SECRET;if(!secret||req.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});try{return NextResponse.json(await sendGateDueEmails())}catch{return NextResponse.json({error:'Unable to process queued gate emails'},{status:500})}}
