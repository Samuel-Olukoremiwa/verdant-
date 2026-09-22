export function isoToDdMmYyyy(
  value?: string | null
) {
  if (!value) return ''

  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      value.slice(0, 10)
    )

  if (!match) return ''

  return `${match[3]}/${match[2]}/${match[1]}`
}

export function ddMmYyyyToIso(
  value: string
): string | null {
  const match =
    /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(
      value.trim()
    )

  if (!match) return null

  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])

  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  )

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

export function formatDateTimeGb(
  value: string
) {
  return new Date(value).toLocaleString(
    'en-GB',
    {
      timeZone: 'Africa/Lagos',
    }
  )
}