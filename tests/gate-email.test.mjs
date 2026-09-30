import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

import {
  test,
} from 'node:test'

import assert from 'node:assert/strict'

const details = {
  source_type:
    'resident',

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

function loadGateFormatting() {
  const loaded = {
    exports: {},
  }

  const source =
    fs.readFileSync(
      new URL(
        '../src/lib/gate-due-emails.ts',
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

      require(
        name
      ) {
        if (
          name ===
          'server-only'
        ) {
          return {}
        }

        throw new Error(
          `Unexpected module: ${name}`
        )
      },
    }
  )

  return loaded.exports
}

test(
  'administrator gate notification identifies entrant and household balance',
  () => {
    const {
      gateDueMessage,
    } =
      loadGateFormatting()

    const text =
      gateDueMessage(
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

test(
  'visitor gate notification uses visitor-specific subject',
  () => {
    const {
      gateDueSubject,
    } =
      loadGateFormatting()

    assert.equal(
      gateDueSubject(
        {
          ...details,

          source_type:
            'visitor',
        },
        'admin'
      ),
      'Visitor entry: household with unpaid dues'
    )
  }
)

test(
  'shared notification worker resolves gate alert before sending email',
  async () => {
    const jobs = [
      {
        id:
          'outbox-job',

        event_key:
          'gate:test',

        kind:
          'gate',

        channel:
          'email',

        recipient:
          'admin@example.test',

        subject:
          null,

        body:
          JSON.stringify({
            alert_id:
              '11111111-1111-1111-1111-111111111111',

            audience:
              'admin',
          }),

        status:
          'sending',

        attempts:
          1,
      },
    ]

    const requests = []
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
            update(
              values
            ) {
              updates.push(
                values
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

    const loaded = {
      exports: {},
    }

    const source =
      fs.readFileSync(
        new URL(
          '../src/lib/notification-worker.ts',
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

        process: {
          env: {
            RESEND_API_KEY:
              'test-key',

            RESEND_FROM_EMAIL:
              'Zadant <sender@example.test>',
          },
        },

        Date,
        JSON,
        Promise,
        AbortSignal,

        fetch:
          async (
            url,
            options
          ) => {
            requests.push({
              url,
              options,
            })

            return {
              ok:
                true,

              status:
                200,

              async json() {
                return {
                  id:
                    'provider-id',
                }
              },
            }
          },

        require(
          name
        ) {
          if (
            name ===
            'server-only'
          ) {
            return {}
          }

          if (
            name.endsWith(
              '/supabase/service'
            )
          ) {
            return {
              createServiceClient:
                () =>
                  db,
            }
          }

          if (
            name.endsWith(
              '/sms'
            )
          ) {
            return {
              sendSms:
                async () => ({
                  status:
                    'accepted',

                  message:
                    'accepted',
                }),
            }
          }

          if (
            name.endsWith(
              '/gate-due-emails'
            )
          ) {
            return {
              gateDueSubject:
                (
                  _details,
                  audience
                ) =>
                  `SUBJECT:${audience}`,

              gateDueMessage:
                (
                  gateDetails,
                  audience
                ) =>
                  `BODY:${gateDetails.name}:${audience}`,
            }
          }

          throw new Error(
            `Unexpected module: ${name}`
          )
        },
      }
    )

    const result =
      await loaded
        .exports
        .processNotificationQueue({
          kind:
            'gate',

          maxJobs:
            1,

          deadlineMs:
            1000,
        })

    assert.equal(
      result.emailsSent,
      1
    )

    assert.equal(
      requests.length,
      1
    )

    const requestBody =
      JSON.parse(
        requests[0]
          .options
          .body
      )

    assert.equal(
      requestBody.subject,
      'SUBJECT:admin'
    )

    assert.equal(
      requestBody.text,
      'BODY:Sample Resident:admin'
    )

    assert.equal(
      updates.at(-1)
        .status,
      'sent'
    )
  }
)