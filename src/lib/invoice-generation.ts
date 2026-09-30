export type BillingMode =
  | 'all-households'
  | 'household'
  | 'resident'
  | null

export type DueType = {
  id: string
  name: string
  amount: number
  frequency: string
  billing_scope:
    | 'house'
    | 'resident'
}

export type HouseResident = {
  id: string
  full_name: string
  relationship:
    | string
    | null
  is_active: boolean
}

export type House = {
  id: string
  address: string
  house_type:
    | string
    | null
  street_id:
    | string
    | null
  billing_responsible_resident_id:
    | string
    | null

  streets:
    | {
        name: string
      }
    | null

  residents:
    | HouseResident[]
    | null
}

export type Resident = {
  id: string
  house_id:
    | string
    | null
  full_name: string
  move_in_date:
    | string
    | null
  property_allocation_date:
    | string
    | null

  houses:
    | {
        address: string
      }
    | null
}

export type PreviewPeriod = {
  period_start: string
  period_end: string
  period_label: string
  due_date: string
  amount: number
  already_exists: boolean
}

export type ResidentPreview = {
  resident_id: string
  resident_name: string
  due_type_id: string
  due_type_name: string
  frequency: string
  amount_per_period: number
  periods: PreviewPeriod[]
  create_count: number
  duplicate_count: number
  total_to_create: number
}

export type HousePreview = {
  house_id: string
  address: string
  due_type_id: string
  due_type_name: string
  frequency: string
  amount_per_period: number
  billing_contact_id:
    | string
    | null
  billing_contact_name:
    | string
    | null
  periods: PreviewPeriod[]
  create_count: number
  duplicate_count: number
  total_to_create: number
}

export type Summary = {
  created: number
  skipped: number
}

export type HousePeriod = {
  start: string
  end: string
  label: string
}

export type HouseRange = {
  start: string
  end: string
  label: string
}

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export const QUARTERS = [
  {
    value:
      '1',
    label:
      'Q1 — January to March',
    startMonth:
      1,
  },
  {
    value:
      '2',
    label:
      'Q2 — April to June',
    startMonth:
      4,
  },
  {
    value:
      '3',
    label:
      'Q3 — July to September',
    startMonth:
      7,
  },
  {
    value:
      '4',
    label:
      'Q4 — October to December',
    startMonth:
      10,
  },
] as const

const NOW =
  new Date()

export const CURRENT_YEAR =
  NOW.getFullYear()

export const DEFAULT_MONTH =
  String(
    NOW.getMonth() +
      1
  )

export const DEFAULT_QUARTER =
  String(
    Math.floor(
      NOW.getMonth() /
        3
    ) +
      1
  )

export const YEARS =
  Array.from(
    {
      length:
        CURRENT_YEAR +
        15 -
        1990 +
        1,
    },
    (
      _,
      index
    ) =>
      String(
        CURRENT_YEAR +
          15 -
          index
      )
  )

export const naira = (
  value: number
) =>
  `₦${value.toLocaleString(
    'en-NG'
  )}`

function pad(
  value: number
) {
  return String(
    value
  ).padStart(
    2,
    '0'
  )
}

export function isoDate(
  year: number,
  month: number,
  day: number
) {
  return `${year}-${pad(
    month
  )}-${pad(
    day
  )}`
}

export function lastDayOfMonth(
  year: number,
  month: number
) {
  return new Date(
    Date.UTC(
      year,
      month,
      0
    )
  ).getUTCDate()
}

export function displayDate(
  value:
    | string
    | null
) {
  if (!value) {
    return '—'
  }

  const parts =
    value
      .slice(
        0,
        10
      )
      .split(
        '-'
      )

  if (
    parts.length !==
    3
  ) {
    return value
  }

  return [
    parts[2],
    parts[1],
    parts[0],
  ].join(
    '/'
  )
}

export function canonicalFrequency(
  value:
    | string
    | null
    | undefined
) {
  const frequency =
    (
      value ??
      ''
    )
      .trim()
      .toLowerCase()

  if (
    frequency ===
    'monthly'
  ) {
    return 'monthly'
  }

  if (
    frequency ===
    'quarterly'
  ) {
    return 'quarterly'
  }

  if (
    frequency ===
      'yearly' ||
    frequency ===
      'annual' ||
    frequency ===
      'annually'
  ) {
    return 'yearly'
  }

  if (
    [
      'one-time',
      'one_time',
      'one time',
      'one-off',
      'oneoff',
      'once',
    ].includes(
      frequency
    )
  ) {
    return 'one-time'
  }

  return 'custom'
}

export function modeFromQuery(
  value:
    | string
    | null
): BillingMode {
  if (
    value ===
    'all-households'
  ) {
    return 'all-households'
  }

  if (
    value ===
    'household'
  ) {
    return 'household'
  }

  if (
    value ===
    'resident'
  ) {
    return 'resident'
  }

  return null
}

export function makeSingleHousePeriod(
  frequency:
    string,

  values: {
    period_year:
      string

    period_month:
      string

    period_quarter:
      string

    one_time_start:
      string

    one_time_end:
      string
  }
): HousePeriod | null {
  const kind =
    canonicalFrequency(
      frequency
    )

  const year =
    Number(
      values.period_year
    )

  if (
    kind ===
    'monthly'
  ) {
    const month =
      Number(
        values.period_month
      )

    if (
      !Number.isInteger(
        year
      ) ||
      !Number.isInteger(
        month
      ) ||
      month <
        1 ||
      month >
        12
    ) {
      return null
    }

    return {
      start:
        isoDate(
          year,
          month,
          1
        ),

      end:
        isoDate(
          year,
          month,
          lastDayOfMonth(
            year,
            month
          )
        ),

      label:
        `${MONTHS[
          month -
            1
        ]} ${year}`,
    }
  }

  if (
    kind ===
    'quarterly'
  ) {
    const quarter =
      QUARTERS.find(
        (
          item
        ) =>
          item.value ===
          values.period_quarter
      )

    if (
      !quarter ||
      !Number.isInteger(
        year
      )
    ) {
      return null
    }

    const endMonth =
      quarter.startMonth +
      2

    return {
      start:
        isoDate(
          year,
          quarter.startMonth,
          1
        ),

      end:
        isoDate(
          year,
          endMonth,
          lastDayOfMonth(
            year,
            endMonth
          )
        ),

      label:
        `Q${values.period_quarter} ${year}`,
    }
  }

  if (
    kind ===
    'yearly'
  ) {
    if (
      !Number.isInteger(
        year
      )
    ) {
      return null
    }

    return {
      start:
        isoDate(
          year,
          1,
          1
        ),

      end:
        isoDate(
          year,
          12,
          31
        ),

      label:
        String(
          year
        ),
    }
  }

  if (
    !values.one_time_start ||
    !values.one_time_end ||
    values.one_time_start >
      values.one_time_end
  ) {
    return null
  }

  return {
    start:
      values
        .one_time_start,

    end:
      values
        .one_time_end,

    label:
      `${displayDate(
        values
          .one_time_start
      )} - ${displayDate(
        values
          .one_time_end
      )}`,
  }
}

export function makeHouseRange(
  frequency:
    string,

  values: {
    range_from_year:
      string

    range_from_month:
      string

    range_from_quarter:
      string

    range_to_year:
      string

    range_to_month:
      string

    range_to_quarter:
      string

    one_time_start:
      string

    one_time_end:
      string
  }
): HouseRange | null {
  const kind =
    canonicalFrequency(
      frequency
    )

  if (
    kind ===
    'monthly'
  ) {
    const fromYear =
      Number(
        values
          .range_from_year
      )

    const fromMonth =
      Number(
        values
          .range_from_month
      )

    const toYear =
      Number(
        values
          .range_to_year
      )

    const toMonth =
      Number(
        values
          .range_to_month
      )

    if (
      !Number.isInteger(
        fromYear
      ) ||
      !Number.isInteger(
        fromMonth
      ) ||
      !Number.isInteger(
        toYear
      ) ||
      !Number.isInteger(
        toMonth
      ) ||
      fromMonth <
        1 ||
      fromMonth >
        12 ||
      toMonth <
        1 ||
      toMonth >
        12
    ) {
      return null
    }

    const start =
      isoDate(
        fromYear,
        fromMonth,
        1
      )

    const end =
      isoDate(
        toYear,
        toMonth,
        lastDayOfMonth(
          toYear,
          toMonth
        )
      )

    if (
      start >
      end
    ) {
      return null
    }

    return {
      start,

      end,

      label:
        start ===
        isoDate(
          toYear,
          toMonth,
          1
        )
          ? `${MONTHS[
              fromMonth -
                1
            ]} ${fromYear}`
          : `${MONTHS[
              fromMonth -
                1
            ]} ${fromYear} → ${MONTHS[
              toMonth -
                1
            ]} ${toYear}`,
    }
  }

  if (
    kind ===
    'quarterly'
  ) {
    const fromYear =
      Number(
        values
          .range_from_year
      )

    const toYear =
      Number(
        values
          .range_to_year
      )

    const fromQuarter =
      QUARTERS.find(
        (
          quarter
        ) =>
          quarter.value ===
          values
            .range_from_quarter
      )

    const toQuarter =
      QUARTERS.find(
        (
          quarter
        ) =>
          quarter.value ===
          values
            .range_to_quarter
      )

    if (
      !Number.isInteger(
        fromYear
      ) ||
      !Number.isInteger(
        toYear
      ) ||
      !fromQuarter ||
      !toQuarter
    ) {
      return null
    }

    const start =
      isoDate(
        fromYear,
        fromQuarter
          .startMonth,
        1
      )

    const toEndMonth =
      toQuarter.startMonth +
      2

    const end =
      isoDate(
        toYear,
        toEndMonth,
        lastDayOfMonth(
          toYear,
          toEndMonth
        )
      )

    if (
      start >
      end
    ) {
      return null
    }

    return {
      start,

      end,

      label:
        fromYear ===
          toYear &&
        fromQuarter
          .value ===
          toQuarter
            .value
          ? `Q${fromQuarter.value} ${fromYear}`
          : `Q${fromQuarter.value} ${fromYear} → Q${toQuarter.value} ${toYear}`,
    }
  }

  if (
    kind ===
    'yearly'
  ) {
    const fromYear =
      Number(
        values
          .range_from_year
      )

    const toYear =
      Number(
        values
          .range_to_year
      )

    if (
      !Number.isInteger(
        fromYear
      ) ||
      !Number.isInteger(
        toYear
      ) ||
      fromYear >
        toYear
    ) {
      return null
    }

    return {
      start:
        isoDate(
          fromYear,
          1,
          1
        ),

      end:
        isoDate(
          toYear,
          12,
          31
        ),

      label:
        fromYear ===
        toYear
          ? String(
              fromYear
            )
          : `${fromYear} → ${toYear}`,
    }
  }

  if (
    !values.one_time_start ||
    !values.one_time_end ||
    values.one_time_start >
      values.one_time_end
  ) {
    return null
  }

  return {
    start:
      values
        .one_time_start,

    end:
      values
        .one_time_end,

    label:
      `${displayDate(
        values
          .one_time_start
      )} → ${displayDate(
        values
          .one_time_end
      )}`,
  }
}

export function freshForm() {
  return {
    due_type_id:
      '',

    due_date:
      '',

    resident_id:
      '',

    billing_start:
      '',

    end_date:
      '',

    period_year:
      String(
        CURRENT_YEAR
      ),

    period_month:
      DEFAULT_MONTH,

    period_quarter:
      DEFAULT_QUARTER,

    range_from_year:
      String(
        CURRENT_YEAR
      ),

    range_from_month:
      DEFAULT_MONTH,

    range_from_quarter:
      DEFAULT_QUARTER,

    range_to_year:
      String(
        CURRENT_YEAR
      ),

    range_to_month:
      DEFAULT_MONTH,

    range_to_quarter:
      DEFAULT_QUARTER,

    one_time_start:
      '',

    one_time_end:
      '',
  }
}

export type InvoiceGenerationForm =
  ReturnType<
    typeof freshForm
  >