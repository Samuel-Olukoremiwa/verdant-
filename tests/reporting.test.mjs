import {
  test,
} from 'node:test'

import assert from 'node:assert/strict'

import fs from 'node:fs'

import vm from 'node:vm'

import ts from 'typescript'

import {
  createRequire,
} from 'node:module'

const nodeRequire =
  createRequire(
    import.meta.url
  )

const moduleCache =
  new Map()

function load(
  name
) {
  if (
    moduleCache.has(
      name
    )
  ) {
    return moduleCache.get(
      name
    )
  }

  const source =
    fs.readFileSync(
      new URL(
        `../src/lib/${name}.ts`,
        import.meta.url
      ),
      'utf8'
    )

  const loaded = {
    exports: {},
  }

  moduleCache.set(
    name,
    loaded.exports
  )

  const output =
    ts.transpileModule(
      source,
      {
        compilerOptions: {
          module:
            ts.ModuleKind
              .CommonJS,

          target:
            ts.ScriptTarget
              .ES2022,
        },
      }
    )
      .outputText

  const localRequire = (
    request
  ) => {
    const alias =
      /^@\/lib\/(.+)$/.exec(
        request
      )

    if (
      alias
    ) {
      return load(
        alias[1]
      )
    }

    return nodeRequire(
      request
    )
  }

  vm.runInNewContext(
    output,
    {
      module:
        loaded,

      exports:
        loaded.exports,

      require:
        localRequire,

      Date,

      Intl,

      Map,

      Set,

      Error,

      Number,

      String,

      Math,
    }
  )

  moduleCache.set(
    name,
    loaded.exports
  )

  return loaded.exports
}

const {
  summarize,
  estateDate,
  houseBalances,
} =
  load(
    'dashboard'
  )

const {
  periodRange,
  reportCsv,
  reportCsvHeader,
  reportCsvRows,
} =
  load(
    'report-format'
  )


const {
  readAll,
} =
  load(
    'read-all'
  )

test(
  'dashboard counts advance payments by receipt date, expenses by date, and invoiced debt separately',
  () => {
    const invoices = [
      {
        id:
          'i',

        house_id:
          'h',

        resident_id:
          null,

        amount:
          5000,

        amount_paid:
          2000,

        due_date:
          '2026-10-31',

        due_types: {
          name:
            'Service Charge',
        },

        houses: {
          address:
            'House A',

          street_id:
            's',

          streets: {
            name:
              'Street A',
          },
        },
      },
    ]

    const payments = [
      {
        amount:
          2000,

        paid_at:
          '2026-09-30T22:59:59.999Z',

        invoices: {
          due_types: {
            name:
              'Service Charge',
          },
        },
      },

      {
        amount:
          500,

        paid_at:
          '2026-09-30T23:00:00Z',

        invoices: {
          due_types: {
            name:
              'Service Charge',
          },
        },
      },
    ]

    const expenses = [
      {
        amount:
          700,

        expense_date:
          '2026-09-01',
      },

      {
        amount:
          50,

        expense_date:
          '2026-10-01',
      },
    ]

    const sept =
      summarize(
        invoices,
        payments,
        expenses,
        '2026-09'
      )

    assert.equal(
      sept.billed,
      0
    )

    assert.equal(
      sept.collected,
      2000
    )

    assert.equal(
      sept.spent,
      700
    )

    assert.equal(
      sept.balance,
      1300
    )

    const oct =
      summarize(
        invoices,
        payments,
        expenses,
        '2026-10'
      )

    assert.equal(
      oct.billed,
      5000
    )

    assert.equal(
      oct.collected,
      500
    )

    assert.equal(
      oct.outstanding,
      3000
    )

    assert.equal(
      oct.homes,
      1
    )

    assert.equal(
      summarize(
        invoices,
        payments,
        expenses
      ).balance,
      1750
    )

    assert.equal(
      estateDate(
        new Date(
          '2026-09-30T23:00:00Z'
        )
      ),
      '2026-10-01'
    )

    assert.equal(
      houseBalances(
        invoices
      )[0].paid,
      2000
    )
  }
)

test(
  'dashboard fallback does not seed hard-coded recurring charge names',
  () => {
    const empty =
      summarize(
        [],
        [],
        []
      )

    assert.equal(
      empty
        .charges
        .length,
      0
    )

    const renamed =
      summarize(
        [
          {
            id:
              'renamed-charge-invoice',

            house_id:
              'house-1',

            resident_id:
              null,

            amount:
              5000,

            amount_paid:
              0,

            due_date:
              '2026-10-31',

            due_types: {
              name:
                'Estate Operations Charge',
            },

            houses:
              null,
          },
        ],
        [],
        []
      )

    assert.equal(
      renamed
        .charges
        .length,
      1
    )

    assert.equal(
      renamed
        .charges[0]
        .name,
      'Estate Operations Charge'
    )

    assert.equal(
      renamed
        .charges[0]
        .billed,
      5000
    )

    assert.equal(
      renamed
        .charges[0]
        .outstanding,
      5000
    )

    assert.equal(
      renamed
        .charges
        .some(
          (
            row
          ) =>
            row.name ===
              'Service Charge'
        ),
      false
    )

    assert.equal(
      renamed
        .charges
        .some(
          (
            row
          ) =>
            row.name ===
              'CDA Levy'
        ),
      false
    )
  }
)

test(
  'period presets handle year boundaries, leap February and estate timezone',
  () => {
    assert.equal(
      periodRange(
        'last-month',
        new Date(
          '2026-01-03'
        )
      ).from,
      '2025-12-01'
    )

    assert.equal(
      periodRange(
        'next-month',
        new Date(
          '2026-12-10'
        )
      ).to,
      '2027-01-31'
    )

    assert.equal(
      periodRange(
        'month',
        new Date(
          '2024-02-10'
        )
      ).to,
      '2024-02-29'
    )

    assert.equal(
      periodRange(
        'month',
        new Date(
          '2026-09-30T23:30:00Z'
        )
      ).from,
      '2026-10-01'
    )

    assert.equal(
      periodRange(
        'quarter',
        new Date(
          '2026-05-10'
        )
      ).to,
      '2026-06-30'
    )
  }
)

test(
  'CSV uses report labels, DD/MM/YYYY dates, quotes text and neutralizes spreadsheet formulas',
  () => {
    const csv =
      reportCsv(
        'expenses',
        [
          {
            house:
              'Maintenance',

            charge:
              '=HYPERLINK("bad")\nnext',

            amount:
              500,

            date:
              '2026-09-20',
          },
        ]
      )

    assert.ok(
      csv.includes(
        '"Category","Description","Date","Amount (NGN)"'
      )
    )

    assert.ok(
      csv.includes(
        '"\'=HYPERLINK(""bad"")\nnext"'
      )
    )

    assert.ok(
      csv.includes(
        '"20/09/2026"'
      )
    )

    assert.ok(
      !csv.includes(
        'Reference'
      )
    )
  }
)

test(
  'pagination includes more than 1000 records and rejects partial results on failure',
  async () => {
    const calls =
      []

    const rows =
      await readAll(
        async (
          from,
          to
        ) => {
          calls.push(
            [
              from,
              to,
            ]
          )

          return {
            data:
              Array.from(
                {
                  length:
                    from <
                    1000
                      ? 500
                      : 7,
                },

                (
                  _,
                  i
                ) =>
                  from +
                  i
              ),

            error:
              null,
          }
        }
      )

    assert.equal(
      rows.length,
      1007
    )

    assert.equal(
      rows[1006],
      1006
    )

    assert.equal(
      calls.length,
      3
    )

    await assert.rejects(
      readAll(
        async () => ({
          data:
            null,

          error: {
            message:
              'unavailable',
          },
        })
      ),
      /unavailable/
    )
  }
)

const {
  incomeStatementRows,
} =
  load(
    'income-statement'
  )

const payment = (
  amount,
  charge,
  street
) => ({
  amount,

  invoices: {
    due_type_id:
      charge,

    due_types: {
      name:
        charge,
    },

    houses: {
      street_id:
        street,

      streets: {
        name:
          street,
      },
    },
  },
})

test(
  'income statement matches supplied 270000 income, 110000 expenses, 160000 surplus example',
  () => {
    const payments =
      []

    for (
      const [
        charge,
        amounts,
      ] of [
        [
          'Service Charge',
          [
            25000,
            15000,
            10000,
          ],
        ],

        [
          'CDA Levy',
          [
            30000,
            20000,
            10000,
          ],
        ],

        [
          'LAWMA',
          [
            18000,
            12000,
            10000,
          ],
        ],

        [
          'Recreation Centre',
          [
            40000,
            30000,
            50000,
          ],
        ],
      ]
    ) {
      amounts.forEach(
        (
          amount,
          i
        ) =>
          payments.push(
            payment(
              amount,
              charge,
              [
                'Jasper',
                'Citrine',
                'Gold',
              ][i]
            )
          )
      )
    }

    const rows =
      incomeStatementRows(
        payments,
        [
          50000,
          10000,
          30000,
          20000,
        ].map(
          (
            amount,
            i
          ) => ({
            amount,

            description:
              'Expense ' +
              i,

            category:
              'Operations',

            expense_date:
              '2026-09-21',
          })
        )
      )

    assert.equal(
      rows.find(
        (
          row
        ) =>
          row.label ===
          'TOTAL INCOME'
      ).total,
      270000
    )

    assert.equal(
      rows.find(
        (
          row
        ) =>
          row.label ===
          'TOTAL EXPENSES'
      ).total,
      110000
    )

    assert.equal(
      rows.at(
        -1
      ).label,
      'SURPLUS'
    )

    assert.equal(
      rows.at(
        -1
      ).total,
      160000
    )

    assert.equal(
      rows.filter(
        (
          row
        ) =>
          row.kind ===
          'street'
      ).length,
      12
    )

    const csv =
      reportCsv(
        'income-statement',
        rows,
        '2026-09-01',
        '2026-09-21'
      )

    assert.match(
      csv,
      /Income Statement: 01\/09\/2026 to 21\/09\/2026/
    )

    assert.match(
      csv,
      /"SURPLUS","","160000"/
    )
  }
)

test(
  'statement sums repeated street receipts without double counting, preserves cents and reports deficit magnitude',
  () => {
    const rows =
      incomeStatementRows(
        [
          payment(
            '0.10',
            'Dues',
            'Jasper'
          ),

          payment(
            '0.20',
            'Dues',
            'Jasper'
          ),
        ],

        [
          {
            amount:
              '0.40',

            description:
              'Supplies',

            category:
              'Other',

            expense_date:
              '2026-09-01',
          },
        ]
      )

    assert.equal(
      rows.find(
        (
          row
        ) =>
          row.kind ===
          'street'
      ).detail,
      0.3
    )

    assert.equal(
      rows.filter(
        (
          row
        ) =>
          row.kind ===
          'street'
      ).length,
      1
    )

    assert.equal(
      rows.at(
        -1
      ).kind,
      'deficit'
    )

    assert.equal(
      rows.at(
        -1
      ).total,
      0.1
    )
  }
)

test(
  'statement retains unallocated receipts and handles zero activity without NaN',
  () => {
    assert.equal(
      incomeStatementRows(
        [],
        []
      ).at(
        -1
      ).total,
      0
    )

    const rows =
      incomeStatementRows(
        [
          {
            amount:
              50,

            invoices:
              null,
          },
        ],
        []
      )

    assert.equal(
      rows.find(
        (
          row
        ) =>
          row.kind ===
          'street'
      ).label,
      'Unassigned street'
    )

    assert.equal(
      rows.at(
        -1
      ).total,
      50
    )

    assert.throws(
      () =>
        incomeStatementRows(
          [
            {
              amount:
                'invalid',

              invoices:
                null,
            },
          ],
          []
        ),
      /Invalid/
    )
  }
)


test(
  'streamed CSV batches compose to the same complete export',
  () => {
    const rows = [
      {
        house:
          'House 1',

        charge:
          'Service Charge',

        period:
          'January 2027',

        dueDate:
          '2027-01-15',

        status:
          'unpaid',

        outstanding:
          5000,
      },

      {
        house:
          'House 2',

        charge:
          '=FORMULA',

        period:
          'January 2027',

        dueDate:
          '2027-01-15',

        status:
          'unpaid',

        outstanding:
          5000,
      },

      {
        house:
          'House 3',

        charge:
          'CDA Levy',

        period:
          'January 2027',

        dueDate:
          '2027-01-15',

        status:
          'partial',

        outstanding:
          2500,
      },
    ]

    const complete =
      reportCsv(
        'due',
        rows,
        '2027-01-01',
        '2027-01-31'
      )

    const streamed =
      [
        reportCsvHeader(
          'due',
          '2027-01-01',
          '2027-01-31'
        ),

        reportCsvRows(
          'due',
          rows.slice(
            0,
            2
          )
        ),

        reportCsvRows(
          'due',
          rows.slice(
            2
          )
        ),
      ]
        .filter(
          Boolean
        )
        .join(
          '\r\n'
        )

    assert.equal(
      streamed,
      complete
    )

    assert.equal(
      streamed
        .split(
          '\uFEFF'
        )
        .length -
        1,
      1
    )

    assert.match(
      streamed,
      /"'=FORMULA"/
    )
  }
)