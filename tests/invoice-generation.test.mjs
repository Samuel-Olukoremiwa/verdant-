import {
  test,
} from 'node:test'

import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load() {
  const loaded = {
    exports: {},
  }

  const source =
    fs.readFileSync(
      new URL(
        '../src/lib/invoice-generation.ts',
        import.meta.url
      ),
      'utf8'
    )

  const compiled =
    ts.transpileModule(
      source,
      {
        compilerOptions: {
          module:
            ts.ModuleKind.CommonJS,

          target:
            ts.ScriptTarget.ES2022,
        },
      }
    ).outputText

  vm.runInNewContext(
    compiled,
    {
      module:
        loaded,

      exports:
        loaded.exports,

      Date,
      Intl,
    }
  )

  return loaded.exports
}

test(
  'canonicalizes supported billing frequencies',
  () => {
    const {
      canonicalFrequency,
    } =
      load()

    assert.equal(
      canonicalFrequency(
        'Monthly'
      ),
      'monthly'
    )

    assert.equal(
      canonicalFrequency(
        'quarterly'
      ),
      'quarterly'
    )

    assert.equal(
      canonicalFrequency(
        'Annual'
      ),
      'yearly'
    )

    assert.equal(
      canonicalFrequency(
        'one-off'
      ),
      'one-time'
    )

    assert.equal(
      canonicalFrequency(
        'something else'
      ),
      'custom'
    )
  }
)

test(
  'monthly period handles leap years correctly',
  () => {
    const {
      makeSingleHousePeriod,
    } =
      load()

    const period =
      makeSingleHousePeriod(
        'monthly',
        {
          period_year:
            '2028',

          period_month:
            '2',

          period_quarter:
            '1',

          one_time_start:
            '',

          one_time_end:
            '',
        }
      )

    assert.equal(
      period.start,
      '2028-02-01'
    )

    assert.equal(
      period.end,
      '2028-02-29'
    )

    assert.equal(
      period.label,
      'February 2028'
    )
  }
)

test(
  'quarterly period creates correct calendar boundaries',
  () => {
    const {
      makeSingleHousePeriod,
    } =
      load()

    const period =
      makeSingleHousePeriod(
        'quarterly',
        {
          period_year:
            '2026',

          period_month:
            '1',

          period_quarter:
            '3',

          one_time_start:
            '',

          one_time_end:
            '',
        }
      )

    assert.equal(
      period.start,
      '2026-07-01'
    )

    assert.equal(
      period.end,
      '2026-09-30'
    )

    assert.equal(
      period.label,
      'Q3 2026'
    )
  }
)

test(
  'monthly household range rejects reversed periods',
  () => {
    const {
      makeHouseRange,
    } =
      load()

    const range =
      makeHouseRange(
        'monthly',
        {
          range_from_year:
            '2026',

          range_from_month:
            '10',

          range_from_quarter:
            '1',

          range_to_year:
            '2026',

          range_to_month:
            '9',

          range_to_quarter:
            '1',

          one_time_start:
            '',

          one_time_end:
            '',
        }
      )

    assert.equal(
      range,
      null
    )
  }
)

test(
  'yearly household range creates full-year boundaries',
  () => {
    const {
      makeHouseRange,
    } =
      load()

    const range =
      makeHouseRange(
        'yearly',
        {
          range_from_year:
            '2024',

          range_from_month:
            '1',

          range_from_quarter:
            '1',

          range_to_year:
            '2026',

          range_to_month:
            '1',

          range_to_quarter:
            '1',

          one_time_start:
            '',

          one_time_end:
            '',
        }
      )

    assert.equal(
      range.start,
      '2024-01-01'
    )

    assert.equal(
      range.end,
      '2026-12-31'
    )

    assert.equal(
      range.label,
      '2024 → 2026'
    )
  }
)

test(
  'one-time billing preserves custom boundaries',
  () => {
    const {
      makeHouseRange,
    } =
      load()

    const range =
      makeHouseRange(
        'one-time',
        {
          range_from_year:
            '2026',

          range_from_month:
            '1',

          range_from_quarter:
            '1',

          range_to_year:
            '2026',

          range_to_month:
            '1',

          range_to_quarter:
            '1',

          one_time_start:
            '2026-03-15',

          one_time_end:
            '2026-04-20',
        }
      )

    assert.equal(
      range.start,
      '2026-03-15'
    )

    assert.equal(
      range.end,
      '2026-04-20'
    )

    assert.equal(
      range.label,
      '15/03/2026 → 20/04/2026'
    )
  }
)

test(
  'billing mode query accepts only known modes',
  () => {
    const {
      modeFromQuery,
    } =
      load()

    assert.equal(
      modeFromQuery(
        'all-households'
      ),
      'all-households'
    )

    assert.equal(
      modeFromQuery(
        'household'
      ),
      'household'
    )

    assert.equal(
      modeFromQuery(
        'resident'
      ),
      'resident'
    )

    assert.equal(
      modeFromQuery(
        'invalid'
      ),
      null
    )
  }
)

test(
  'invoice generator displays ISO dates as DD/MM/YYYY',
  () => {
    const {
      displayDate,
    } =
      load()

    assert.equal(
      displayDate(
        '2026-09-30'
      ),
      '30/09/2026'
    )

    assert.equal(
      displayDate(
        null
      ),
      '—'
    )
  }
)