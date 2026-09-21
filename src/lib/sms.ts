// Server-side only: never import this module from client components.
export type SmsResult = { status: 'accepted' | 'failed' | 'unknown' | 'skipped'; message: string; code?: string }
export function normalizeNigerianPhone(input: string): string | null {
  const cleaned = input.trim().replace(/[\s()-]/g, '')
  const phone = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned
  if (/^0[789]\d{9}$/.test(phone)) return '234' + phone.slice(1)
  return /^234[789]\d{9}$/.test(phone) ? phone : null
}
const errors: Record<string,string> = {
  '009': 'SMS exceeds the provider message-length limit.', '100': 'SMS API key is invalid.',
  '101': 'SMS account is inactive.', '104': 'SMS content was rejected by the provider.',
  '105': 'SMS sender ID is blocked.', '106': 'SMS sender ID does not exist.',
  '107': 'SMS phone number is invalid.', '109': 'SMS account has insufficient credit.',
  '111': 'SMS requires an approved promotional sender ID.', '188': 'SMS sender ID is not approved.',
}
export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  const recipient = normalizeNigerianPhone(phone)
  if (!recipient) return { status: 'failed', message: 'Enter a valid Nigerian mobile number.' }
  const token = process.env.KUDISMS_API_KEY, senderID = process.env.KUDISMS_SENDER_ID
  if (!token || !senderID || senderID.length > 11) return { status: 'failed', message: 'SMS credentials or sender ID are not configured.' }
  if (!message.trim()) return { status: 'failed', message: 'SMS message is empty.' }
  try {
    const response = await fetch('https://my.kudisms.net/api/sms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, senderID, recipients: recipient, message, gateway: '2' }),
      signal: AbortSignal.timeout(15000), cache: 'no-store', redirect: 'error',
    })
    const data = await response.json().catch(() => null)
    const code = typeof data?.error_code === 'string' ? data.error_code : ''
    if (response.ok && data?.status === 'success' && code === '000') return { status: 'accepted', code, message: 'SMS accepted by KudiSMS. Delivery is not yet confirmed.' }
    if (code && code !== '000') return { status: 'failed', code, message: errors[code] ?? 'KudiSMS rejected the SMS. Check the provider dashboard.' }
    return { status: 'unknown', message: 'SMS outcome is unknown. Check KudiSMS before trying again.' }
  } catch {
    // No automatic retry: a timeout can occur after the provider accepted a paid message.
    return { status: 'unknown', message: 'SMS outcome is unknown. Check KudiSMS before trying again.' }
  }
}
