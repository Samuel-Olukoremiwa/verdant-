import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

import {
  test,
} from 'node:test'

import assert from 'node:assert/strict'

const details = {
  name:
    'Sample Resident',

  email:
    'resident@example.test',

  phone:
    '08000000000',

  address:
    'Sample home',

  entered_at:
    '2026-09-21T10:00:00Z',

  balance:
    4000,

  bills: [
    {
      label:
        'Service charge',

      amount:
        4000,

      due_date:
        '2026-09-01',
    },
  ],
}

function setup({
  duplicate = false,
  insertFails = false,
} = {}) {
  const jobs = [
    {
      id:
        'email-job',

      alert_id:
        'scan-1',

      recipient:
        'resident@example.test',

      audience:
        'resident',

      attempts:
        1,
    },
  ]

  const inserted = []
  const updates = []

  const db = {
    async rpc() {
      return {
        data:
          jobs.splice(
            0,
            1
          ),

        error:
          null,
      }
    },

    from(
      table
    ) {
      if (
        table ===
        'gate_due_alerts'
      ) {
        return {
          select() {
            return {
              eq() {
                return {
                  async single() {
                    return {
                      data: {
                        details,
                      },

                      error:
                        null,
                    }
                  },
                }
              },
            }
          },
        }
      }

      if (
        table ===
        'notification_outbox'
      ) {
        return {
          async insert(
            value
          ) {
            inserted.push(
              value
            )

            if (
              duplicate
            ) {
              return {
                error: {
                  code:
                    '23505',
                },
              }
            }

            if (
              insertFails
            ) {
              return {
                error: {
                  code:
                    '50000',
                },
              }
            }

            return {
              error:
                null,
            }
          },
        }
      }

      if (
        table ===
        'gate_due_emails'
      ) {
        return {
          update(
            value
          ) {
            updates.push(
              value
            )

            return {
              eq() {
                return {
                  async eq() {
                    return {
                      error:
                        null,
                    }
                  },
                }
              },
            }
          },
        }
      }

      throw new Error(
        `Unexpected table: ${table}`
      )
    },
  }

  const compiled = {
    exports: {},
  }

  const js =
    ts.transpileModule(
      fs.readFileSync(
        new URL(
          '../src/lib/gate-due-emails.ts',
          import.meta.url
        ),
        'utf8'
      ),
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
    js,
    {
      module:
        compiled,

      exports:
        compiled.exports,

      Date,
      Intl,

      require(
        name
      ) {
        if (
          name ===
          'server-only'
        ) {
          return {}
        }

        return {
          createServiceClient:
            () =>
              db,
        }
      },
    }
  )

  return {
    ...compiled.exports,
    inserted,
    updates,
  }
}

test(
  'gate email is moved into the shared notification outbox',
  async () => {
    const env =
      setup()

    const result =
      await env
        .queueGateDueEmails()

    assert.equal(
      result.migrated,
      1
    )

    assert.equal(
      env.inserted.length,
      1
    )

    assert.equal(
      env.inserted[0]
        .event_key,
      'gate:email-job'
    )

    assert.equal(
      env.inserted[0]
        .kind,
      'gate'
    )

    assert.equal(
      env.inserted[0]
        .channel,
      'email'
    )

    assert.equal(
      env.updates.at(-1)
        .status,
      'migrated'
    )
  }
)

test(
  'duplicate outbox event safely marks legacy job as migrated',
  async () => {
    const env =
      setup({
        duplicate:
          true,
      })

    const result =
      await env
        .queueGateDueEmails()

    assert.equal(
      result.duplicates,
      1
    )

    assert.equal(
      env.updates.at(-1)
        .status,
      'migrated'
    )
  }
)

test(
  'failed outbox insert returns legacy email to pending',
  async () => {
    const env =
      setup({
        insertFails:
          true,
      })

    const result =
      await env
        .queueGateDueEmails()

    assert.equal(
      result.failed,
      1
    )

    assert.equal(
      env.updates.at(-1)
        .status,
      'pending'
    )
  }
)

test(
  'administrator notification contains entrant and household balance',
  () => {
    const env =
      setup()

    const text =
      env.gateDueMessage(
        details,
        'admin'
      )

    assert.match(
      text,
      /Sample Resident entered/
    )

    assert.match(
      text,
      /resident@example.test/
    )

    assert.match(
      text,
      /08000000000/
    )

    assert.match(
      text,
      /4,000.00/
    )
  }
)