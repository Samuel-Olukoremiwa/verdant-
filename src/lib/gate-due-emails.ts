import 'server-only'

export type GateDueDetails = {
  source_type?:
    | 'resident'
    | 'visitor'

  name:
    string

  visitor_phone?:
    | string
    | null

  host?:
    | string
    | null

  host_email?:
    | string
    | null

  host_phone?:
    | string
    | null

  billing_contact_name?:
    | string
    | null

  email:
    | string
    | null

  phone:
    | string
    | null

  address:
    string

  entered_at:
    string

  balance:
    number

  bills: {
    label:
      string

    amount:
      number

    due_date:
      | string
      | null
  }[]
}

export function gateDueMessage(
  details:
    GateDueDetails,

  audience:
    string
) {
  const balance =
    Number(
      details.balance
    ).toLocaleString(
      'en-NG',
      {
        minimumFractionDigits:
          2,

        maximumFractionDigits:
          2,
      }
    )

  const when =
    new Date(
      details.entered_at
    ).toLocaleString(
      'en-GB',
      {
        timeZone:
          'Africa/Lagos',

        hour12:
          false,
      }
    ) +
    ' WAT'

  const isVisitor =
    details.source_type ===
    'visitor'

  let intro:
    string

  if (
    audience ===
    'admin'
  ) {
    if (
      isVisitor
    ) {
      intro =
        `Visitor ${details.name} entered the estate at ${when}.\n` +
        `Visitor phone: ${details.visitor_phone || 'Not provided'}\n` +
        `Host: ${details.host || 'Unknown'}\n` +
        `Host email: ${details.host_email || 'Not provided'}\n` +
        `Host phone: ${details.host_phone || 'Not provided'}\n` +
        `Address: ${details.address}\n` +
        `Designated billing contact: ${
          details.billing_contact_name ||
          'Not assigned'
        }\n` +
        `Billing contact email: ${
          details.email ||
          'Not provided'
        }\n` +
        `Billing contact phone: ${
          details.phone ||
          'Not provided'
        }`
    } else {
      intro =
        `${details.name} entered the estate at ${when}.\n` +
        `Resident email: ${details.email || 'Not provided'}\n` +
        `Resident phone: ${details.phone || 'Not provided'}\n` +
        `Address: ${details.address}\n` +
        `Designated billing contact: ${
          details.billing_contact_name ||
          'Not assigned'
        }`
    }
  } else if (
    isVisitor
  ) {
    intro =
      `A visitor named ${details.name} for ${
        details.host ||
        'your household'
      } was admitted to ${details.address} at ${when}.`
  } else {
    intro =
      `${details.name} entered the estate for the household at ` +
      `${details.address} at ${when}.`
  }

  const billLines =
    details.bills
      .map(
        (
          bill
        ) =>
          `${bill.label}: NGN ${Number(
            bill.amount
          ).toFixed(
            2
          )}${
            bill.due_date
              ? ` (due ${bill.due_date})`
              : ''
          }`
      )
      .join(
        '\n'
      )

  const action =
    audience ===
    'admin'
      ? 'Please review the household account in Zadant.'
      : details
          .billing_contact_name
        ? `The designated payee for this household is ${details.billing_contact_name}. Please review or coordinate settlement of the household dues in Zadant.`
        : 'Please review the household dues in Zadant.'

  return (
    `${intro}\n\n` +
    `The household had NGN ${balance} in unpaid dues at entry. ` +
    `This is a household balance and does not mean the visitor was denied access.\n\n` +
    `${billLines}\n\n` +
    `${action} Payments made since entry may have changed the balance.`
  )
}

export function gateDueSubject(
  details:
    GateDueDetails,

  audience:
    string
) {
  const isVisitor =
    details.source_type ===
    'visitor'

  if (
    audience ===
    'admin'
  ) {
    return isVisitor
      ? 'Visitor entry: household with unpaid dues'
      : 'Gate entry: household with unpaid dues'
  }

  return isVisitor
    ? 'Visitor entry and household dues alert'
    : 'Your household dues reminder'
}