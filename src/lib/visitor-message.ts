export type VisitorPass = { id: string; code: string; visitor_name: string; address: string; starts_at: string; expires_at: string; redeemed_at: string | null; cancelled_at: string | null }
export const visitorTime = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' }) + ' WAT'
export function visitorMessage(pass: VisitorPass) {
  return `Verdant: You are invited to ${pass.address}, your estate.\nVisitor: ${pass.visitor_name}\nEntry code: ${pass.code}\nValid from: ${visitorTime(pass.starts_at)}\nExpires: ${visitorTime(pass.expires_at)}\nShow this code to gate staff. One entry only.`
}
