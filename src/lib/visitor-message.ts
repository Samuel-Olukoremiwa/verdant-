export type VisitorPass = {
  id: string
  code: string
  visitor_name: string
  visitor_phone:
    | string
    | null
  address: string
  starts_at: string
  expires_at: string
  redeemed_at:
    | string
    | null
  cancelled_at:
    | string
    | null
}

export const visitorTime = (
  value: string
) =>
  new Date(value)
    .toLocaleString(
      'en-GB',
      {
        timeZone:
          'Africa/Lagos',

        dateStyle:
          'medium',

        timeStyle:
          'short',
      }
    ) + ' WAT'

export function visitorMessage(
  pass: VisitorPass
) {
  return (
    `Verdant: You are invited to ${pass.address}.\n` +
    `Visitor: ${pass.visitor_name}\n` +
    `Entry code: ${pass.code}\n` +
    `Valid from: ${visitorTime(pass.starts_at)}\n` +
    `Expires: ${visitorTime(pass.expires_at)}\n` +
    `Show this code to gate staff. One entry only.`
  )
}