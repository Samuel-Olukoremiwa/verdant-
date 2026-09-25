const LAGOS_TIME_ZONE =
  'Africa/Lagos'

function dateOnlyParts(
  value: string
) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})/.exec(
      value.trim()
    )

  if (!match) {
    return null
  }

  return {
    year: match[1],
    month: match[2],
    day: match[3],
  }
}

export function isoToDdMmYyyy(
  value?: string | null
) {
  if (!value) return ''

  const parts =
    dateOnlyParts(value)

  if (!parts) return ''

  return `${parts.day}/${parts.month}/${parts.year}`
}

export function formatDateGb(
  value?: string | null,
  fallback = '—'
) {
  if (!value) {
    return fallback
  }

  const dateOnly =
    dateOnlyParts(value)

  if (
    dateOnly &&
    !value.includes('T')
  ) {
    return `${dateOnly.day}/${dateOnly.month}/${dateOnly.year}`
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return fallback
  }

  return new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone:
        LAGOS_TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }
  ).format(date)
}

export function ddMmYyyyToIso(
  value: string
): string | null {
  const match =
    /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(
      value.trim()
    )

  if (!match) return null

  const day =
    Number(match[1])

  const month =
    Number(match[2])

  const year =
    Number(match[3])

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    )

  if (
    date.getUTCFullYear() !==
      year ||
    date.getUTCMonth() !==
      month - 1 ||
    date.getUTCDate() !==
      day
  ) {
    return null
  }

  return [
    String(year).padStart(
      4,
      '0'
    ),
    String(month).padStart(
      2,
      '0'
    ),
    String(day).padStart(
      2,
      '0'
    ),
  ].join('-')
}

export function formatDateTimeGb(
  value?: string | null,
  fallback = '—'
) {
  if (!value) {
    return fallback
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return fallback
  }

  const parts =
    new Intl.DateTimeFormat(
      'en-GB',
      {
        timeZone:
          LAGOS_TIME_ZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }
    ).formatToParts(date)

  const get = (
    type: Intl.DateTimeFormatPartTypes
  ) =>
    parts.find(
      (part) =>
        part.type === type
    )?.value ?? ''

  return (
    `${get('day')}/${get('month')}/${get('year')}, ` +
    `${get('hour')}:${get('minute')}:${get('second')} ` +
    `${get('dayPeriod')}`
  ).trim()
}
