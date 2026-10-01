import {
  formatDateGb,
  formatDateTimeGb,
} from '@/lib/date-format'

export type ReportType =
  | 'due'
  | 'collected'
  | 'overdue'
  | 'future'
  | 'expenses'
  | 'income-statement'

export type ReportRow =
  Record<
    string,
    string | number | null
  >

export const REPORT_LABELS:
  Record<
    ReportType,
    string
  > = {
  due: 'Due Bills',
  collected: 'Collected',
  overdue: 'Overdue',
  future:
    'Bills Expected in Future',
  expenses: 'Expenses',
  'income-statement':
    'Income Statement',
}

export type PeriodPreset =
  | 'month'
  | 'last-month'
  | 'quarter'
  | 'year'
  | 'next-month'
  | 'next-quarter'
  | 'custom'

export function periodRange(
  preset:
    Exclude<
      PeriodPreset,
      'custom'
    >,
  today = new Date()
) {
  const local =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'Africa/Lagos',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',
      }
    ).format(
      today
    )

  const year =
    Number(
      local.slice(
        0,
        4
      )
    )

  const month =
    Number(
      local.slice(
        5,
        7
      )
    ) -
    1

  let startMonth =
    month

  let endMonth =
    month +
    1

  if (
    preset ===
    'last-month'
  ) {
    startMonth--

    endMonth--
  }

  if (
    preset ===
    'quarter'
  ) {
    startMonth =
      Math.floor(
        month /
          3
      ) *
      3

    endMonth =
      startMonth +
      3
  }

  if (
    preset ===
    'year'
  ) {
    startMonth =
      0

    endMonth =
      12
  }

  if (
    preset ===
    'next-month'
  ) {
    startMonth++

    endMonth++
  }

  if (
    preset ===
    'next-quarter'
  ) {
    startMonth++

    endMonth +=
      3
  }

  return {
    from:
      new Date(
        Date.UTC(
          year,
          startMonth,
          1
        )
      )
        .toISOString()
        .slice(
          0,
          10
        ),

    to:
      new Date(
        Date.UTC(
          year,
          endMonth,
          0
        )
      )
        .toISOString()
        .slice(
          0,
          10
        ),
  }
}

export function reportColumns(
  type:
    ReportType
) {
  if (
    type ===
    'income-statement'
  ) {
    return [
      {
        key:
          'label',

        label:
          'Income / Expense',
      },

      {
        key:
          'detail',

        label:
          'Amount (NGN)',
      },

      {
        key:
          'total',

        label:
          'Total (NGN)',
      },
    ]
  }

  if (
    type ===
    'expenses'
  ) {
    return [
      {
        key:
          'house',

        label:
          'Category',
      },

      {
        key:
          'charge',

        label:
          'Description',
      },

      {
        key:
          'date',

        label:
          'Date',
      },

      {
        key:
          'amount',

        label:
          'Amount (NGN)',
      },
    ]
  }

  return [
    {
      key:
        'house',

      label:
        'Target',
    },

    {
      key:
        'charge',

      label:
        'Charge',
    },

    {
      key:
        'period',

      label:
        'Period',
    },

    ...(type ===
    'collected'
      ? [
          {
            key:
              'date',

            label:
              'Paid date (WAT)',
          },

          {
            key:
              'reference',

            label:
              'Payment ID',
          },

          {
            key:
              'amount',

            label:
              'Amount (NGN)',
          },
        ]
      : [
          {
            key:
              'dueDate',

            label:
              'Due date',
          },

          {
            key:
              'status',

            label:
              'Status',
          },

          {
            key:
              'outstanding',

            label:
              'Outstanding (NGN)',
          },
        ]),
  ]
}

export function reportCell(
  row:
    ReportRow,

  key:
    string
) {
  const value =
    row[
      key
    ]

  if (
    value ==
    null
  ) {
    return ''
  }

  if (
    key ===
    'date'
  ) {
    const text =
      String(
        value
      )

    return text.includes(
      'T'
    )
      ? formatDateTimeGb(
          text,
          ''
        )
      : formatDateGb(
          text,
          ''
        )
  }

  if (
    key ===
    'dueDate'
  ) {
    return formatDateGb(
      String(
        value
      ),
      ''
    )
  }

  return String(
    value
  )
}

function escapeCsv(
  value:
    string
) {
  const safe =
    /^[=+@\-\t\r]/.test(
      value
    )
      ? "'" +
        value
      : value

  return (
    '"' +
    safe.replace(
      /"/g,
      '""'
    ) +
    '"'
  )
}

/*
 * Returns the CSV metadata/header section only.
 *
 * The UTF-8 BOM belongs here so streaming exports emit it
 * exactly once, regardless of the number of row batches.
 */
export function reportCsvHeader(
  type:
    ReportType,

  from?:
    string,

  to?:
    string
) {
  const columns =
    reportColumns(
      type
    )

  const displayFrom =
    from
      ? formatDateGb(
          from,
          ''
        )
      : ''

  const displayTo =
    to
      ? formatDateGb(
          to,
          ''
        )
      : ''

  const lines = [
    ...(type ===
    'income-statement'
      ? [
          [
            `Income Statement: ${displayFrom} to ${displayTo}`,

            'Cash basis; payment dates in WAT',

            '',
          ]
            .map(
              escapeCsv
            )
            .join(
              ','
            ),
        ]
      : []),

    columns
      .map(
        (
          column
        ) =>
          escapeCsv(
            column.label
          )
      )
      .join(
        ','
      ),
  ]

  return (
    '\uFEFF' +
    lines.join(
      '\r\n'
    )
  )
}

/*
 * Returns only CSV data rows.
 *
 * There is deliberately no BOM and no header here so this can
 * safely be called for every streamed 500-row batch.
 */
export function reportCsvRows(
  type:
    ReportType,

  rows:
    ReportRow[]
) {
  const columns =
    reportColumns(
      type
    )

  return rows
    .map(
      (
        row
      ) =>
        columns
          .map(
            (
              column
            ) =>
              escapeCsv(
                reportCell(
                  row,
                  column.key
                )
              )
          )
          .join(
            ','
          )
    )
    .join(
      '\r\n'
    )
}

/*
 * Backward-compatible complete CSV generator used by tests and
 * anywhere a small report is intentionally built in memory.
 */
export function reportCsv(
  type:
    ReportType,

  rows:
    ReportRow[],

  from?:
    string,

  to?:
    string
) {
  const header =
    reportCsvHeader(
      type,
      from,
      to
    )

  const body =
    reportCsvRows(
      type,
      rows
    )

  return body
    ? `${header}\r\n${body}`
    : header
}