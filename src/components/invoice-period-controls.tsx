import { DateField } from '@/components/date-field'

import {
  MONTHS,
  QUARTERS,
  YEARS,
  displayDate,
  type HousePeriod,
  type HouseRange,
  type InvoiceGenerationForm,
} from '@/lib/invoice-generation'

type Props = {
  mode:
    | 'all-households'
    | 'household'

  frequency:
    | string
    | null

  form:
    InvoiceGenerationForm

  onChange:
    (
      next: Partial<InvoiceGenerationForm>
    ) => void

  singlePeriod:
    | HousePeriod
    | null

  range:
    | HouseRange
    | null
}

export function InvoicePeriodControls({
  mode,
  frequency,
  form,
  onChange,
  singlePeriod,
  range,
}: Props) {
  if (!frequency) {
    return null
  }

  if (
    mode ===
    'all-households'
  ) {
    return (
      <div className="space-y-4">
        <div>
          <span className="block text-sm font-medium mb-1">
            Billing Period *
          </span>

          <p className="text-xs text-gray-500">
            This estate-wide action creates one
            period at a time. Period labels are
            generated automatically.
          </p>
        </div>

        {frequency ===
          'monthly' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                Month
              </label>

              <select
                className="w-full border rounded-lg px-3 py-2"
                value={
                  form.period_month
                }
                onChange={(
                  event
                ) =>
                  onChange({
                    period_month:
                      event.target.value,
                  })
                }
              >
                {MONTHS.map(
                  (
                    month,
                    index
                  ) => (
                    <option
                      key={
                        month
                      }
                      value={String(
                        index +
                          1
                      )}
                    >
                      {
                        month
                      }
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Year
              </label>

              <select
                className="w-full border rounded-lg px-3 py-2"
                value={
                  form.period_year
                }
                onChange={(
                  event
                ) =>
                  onChange({
                    period_year:
                      event.target.value,
                  })
                }
              >
                {YEARS.map(
                  (
                    year
                  ) => (
                    <option
                      key={
                        year
                      }
                      value={
                        year
                      }
                    >
                      {
                        year
                      }
                    </option>
                  )
                )}
              </select>
            </div>
          </div>
        )}

        {frequency ===
          'quarterly' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                Quarter
              </label>

              <select
                className="w-full border rounded-lg px-3 py-2"
                value={
                  form.period_quarter
                }
                onChange={(
                  event
                ) =>
                  onChange({
                    period_quarter:
                      event.target.value,
                  })
                }
              >
                {QUARTERS.map(
                  (
                    quarter
                  ) => (
                    <option
                      key={
                        quarter.value
                      }
                      value={
                        quarter.value
                      }
                    >
                      {
                        quarter.label
                      }
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Year
              </label>

              <select
                className="w-full border rounded-lg px-3 py-2"
                value={
                  form.period_year
                }
                onChange={(
                  event
                ) =>
                  onChange({
                    period_year:
                      event.target.value,
                  })
                }
              >
                {YEARS.map(
                  (
                    year
                  ) => (
                    <option
                      key={
                        year
                      }
                      value={
                        year
                      }
                    >
                      {
                        year
                      }
                    </option>
                  )
                )}
              </select>
            </div>
          </div>
        )}

        {frequency ===
          'yearly' && (
          <div>
            <label className="block text-sm font-medium mb-1">
              Billing Year
            </label>

            <select
              className="w-full border rounded-lg px-3 py-2"
              value={
                form.period_year
              }
              onChange={(
                event
              ) =>
                onChange({
                  period_year:
                    event.target.value,
                })
              }
            >
              {YEARS.map(
                (
                  year
                ) => (
                  <option
                    key={
                      year
                    }
                    value={
                      year
                    }
                  >
                    {
                      year
                    }
                  </option>
                )
              )}
            </select>
          </div>
        )}

        {(frequency ===
          'one-time' ||
          frequency ===
            'custom') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                Period Start *
              </label>

              <DateField
                required
                className="w-full border rounded-lg px-3 py-2"
                value={
                  form.one_time_start
                }
                onChange={(
                  event
                ) =>
                  onChange({
                    one_time_start:
                      event.target.value,
                  })
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Period End *
              </label>

              <DateField
                required
                className="w-full border rounded-lg px-3 py-2"
                value={
                  form.one_time_end
                }
                onChange={(
                  event
                ) =>
                  onChange({
                    one_time_end:
                      event.target.value,
                  })
                }
              />
            </div>
          </div>
        )}

        {singlePeriod && (
          <div className="rounded-lg border bg-gray-50 p-4 text-sm">
            <span className="text-gray-500">
              Generated period
            </span>

            <strong className="block mt-1 text-base">
              {
                singlePeriod.label
              }
            </strong>

            <p className="text-xs text-gray-500 mt-1">
              {displayDate(
                singlePeriod.start
              )}
              {' → '}
              {displayDate(
                singlePeriod.end
              )}
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <span className="block text-sm font-medium mb-1">
          Billing Period: From and To *
        </span>

        <p className="text-xs text-gray-500">
          Zadant generates every period between
          From and To according to this due type&apos;s
          frequency. For example, January 2026 to
          September 2026 creates nine monthly invoices.
        </p>
      </div>

      {frequency ===
        'monthly' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MonthYearBox
            title="From"
            month={
              form.range_from_month
            }
            year={
              form.range_from_year
            }
            onMonth={(
              value
            ) =>
              onChange({
                range_from_month:
                  value,
              })
            }
            onYear={(
              value
            ) =>
              onChange({
                range_from_year:
                  value,
              })
            }
          />

          <MonthYearBox
            title="To"
            month={
              form.range_to_month
            }
            year={
              form.range_to_year
            }
            onMonth={(
              value
            ) =>
              onChange({
                range_to_month:
                  value,
              })
            }
            onYear={(
              value
            ) =>
              onChange({
                range_to_year:
                  value,
              })
            }
          />
        </div>
      )}

      {frequency ===
        'quarterly' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <QuarterYearBox
            title="From"
            quarter={
              form.range_from_quarter
            }
            year={
              form.range_from_year
            }
            onQuarter={(
              value
            ) =>
              onChange({
                range_from_quarter:
                  value,
              })
            }
            onYear={(
              value
            ) =>
              onChange({
                range_from_year:
                  value,
              })
            }
          />

          <QuarterYearBox
            title="To"
            quarter={
              form.range_to_quarter
            }
            year={
              form.range_to_year
            }
            onQuarter={(
              value
            ) =>
              onChange({
                range_to_quarter:
                  value,
              })
            }
            onYear={(
              value
            ) =>
              onChange({
                range_to_year:
                  value,
              })
            }
          />
        </div>
      )}

      {frequency ===
        'yearly' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <YearField
            label="From Year"
            value={
              form.range_from_year
            }
            onChange={(
              value
            ) =>
              onChange({
                range_from_year:
                  value,
              })
            }
          />

          <YearField
            label="To Year"
            value={
              form.range_to_year
            }
            onChange={(
              value
            ) =>
              onChange({
                range_to_year:
                  value,
              })
            }
          />
        </div>
      )}

      {(frequency ===
        'one-time' ||
        frequency ===
          'custom') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              Period Start *
            </label>

            <DateField
              required
              className="w-full border rounded-lg px-3 py-2"
              value={
                form.one_time_start
              }
              onChange={(
                event
              ) =>
                onChange({
                  one_time_start:
                    event.target.value,
                })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Period End *
            </label>

            <DateField
              required
              className="w-full border rounded-lg px-3 py-2"
              value={
                form.one_time_end
              }
              onChange={(
                event
              ) =>
                onChange({
                  one_time_end:
                    event.target.value,
                })
              }
            />
          </div>
        </div>
      )}

      {range && (
        <div className="rounded-lg border bg-gray-50 p-4 text-sm">
          <span className="text-gray-500">
            Selected range
          </span>

          <strong className="block mt-1 text-base">
            {
              range.label
            }
          </strong>

          <p className="text-xs text-gray-500 mt-1">
            {displayDate(
              range.start
            )}
            {' → '}
            {displayDate(
              range.end
            )}
          </p>
        </div>
      )}
    </div>
  )
}

function MonthYearBox({
  title,
  month,
  year,
  onMonth,
  onYear,
}: {
  title:
    string

  month:
    string

  year:
    string

  onMonth:
    (
      value: string
    ) => void

  onYear:
    (
      value: string
    ) => void
}) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <strong className="text-sm">
        {title}
      </strong>

      <div>
        <label className="block text-xs font-medium mb-1">
          Month
        </label>

        <select
          className="w-full border rounded-lg px-3 py-2"
          value={
            month
          }
          onChange={(
            event
          ) =>
            onMonth(
              event.target.value
            )
          }
        >
          {MONTHS.map(
            (
              item,
              index
            ) => (
              <option
                key={
                  item
                }
                value={String(
                  index +
                    1
                )}
              >
                {
                  item
                }
              </option>
            )
          )}
        </select>
      </div>

      <YearField
        label="Year"
        value={
          year
        }
        onChange={
          onYear
        }
        small
      />
    </div>
  )
}

function QuarterYearBox({
  title,
  quarter,
  year,
  onQuarter,
  onYear,
}: {
  title:
    string

  quarter:
    string

  year:
    string

  onQuarter:
    (
      value: string
    ) => void

  onYear:
    (
      value: string
    ) => void
}) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <strong className="text-sm">
        {title}
      </strong>

      <select
        className="w-full border rounded-lg px-3 py-2"
        value={
          quarter
        }
        onChange={(
          event
        ) =>
          onQuarter(
            event.target.value
          )
        }
      >
        {QUARTERS.map(
          (
            item
          ) => (
            <option
              key={
                item.value
              }
              value={
                item.value
              }
            >
              {
                item.label
              }
            </option>
          )
        )}
      </select>

      <YearField
        label="Year"
        value={
          year
        }
        onChange={
          onYear
        }
        small
      />
    </div>
  )
}

function YearField({
  label,
  value,
  onChange,
  small = false,
}: {
  label:
    string

  value:
    string

  onChange:
    (
      value: string
    ) => void

  small?:
    boolean
}) {
  return (
    <div>
      <label
        className={
          small
            ? 'block text-xs font-medium mb-1'
            : 'block text-sm font-medium mb-1'
        }
      >
        {label}
      </label>

      <select
        className="w-full border rounded-lg px-3 py-2"
        value={
          value
        }
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
      >
        {YEARS.map(
          (
            year
          ) => (
            <option
              key={
                year
              }
              value={
                year
              }
            >
              {
                year
              }
            </option>
          )
        )}
      </select>
    </div>
  )
}