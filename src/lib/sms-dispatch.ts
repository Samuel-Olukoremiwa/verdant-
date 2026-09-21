import { createServiceClient } from '@/lib/supabase/service'
import { normalizeNigerianPhone, sendSms, type SmsResult } from '@/lib/sms'
export async function dispatchSms(eventKey: string, kind: 'billing' | 'registration' | 'visitor', phone: string, message: string): Promise<SmsResult> {
  if (!normalizeNigerianPhone(phone)) return { status: 'failed', message: 'No valid Nigerian mobile number is available for SMS.' }
  try {
    const db = createServiceClient()
    const { error } = await db.from('sms_dispatches').insert({ event_key: eventKey, kind })
    if (error?.code === '23505') return { status: 'skipped', message: 'An SMS attempt already exists for this notification; no duplicate was sent.' }
    if (error) return { status: 'failed', message: 'SMS could not be queued. Check that the Phase 13 migration has been applied.' }
    const result = await sendSms(phone, message)
    const { error: updateError } = await db.from('sms_dispatches').update({ status: result.status, provider_code: result.code ?? null, updated_at: new Date().toISOString() }).eq('event_key', eventKey)
    if (updateError) return { ...result, message: result.message + ' Its audit status could not be saved; do not resend automatically.' }
    return result
  } catch { return { status: 'unknown', message: 'SMS could not be confirmed. Check KudiSMS before trying again.' } }
}
