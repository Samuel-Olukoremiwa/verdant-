// Translates raw Postgres constraint-violation errors into messages a person
// filling out a form can actually understand. This is a backstop — the forms
// already require/validate these fields before submitting — but if that's
// ever bypassed, the database constraint still catches it, and this makes
// sure what the person sees isn't a raw Postgres error.
export function friendlyDbError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)

  if (message.includes('residents_phone_format') || message.includes('registration_phone_format')) {
    return 'Please enter a valid phone number (7-15 digits).'
  }
  if (message.includes('residents_email_format') || message.includes('registration_email_format')) {
    return 'Please enter a valid email address.'
  }
  if (message.includes('null value in column "phone"')) {
    return 'Phone number is required.'
  }
  if (message.includes('null value in column "email"')) {
    return 'Email address is required.'
  }
  return message
}
