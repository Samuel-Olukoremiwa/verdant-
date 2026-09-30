import {
  test,
} from 'node:test'

import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function loadQueue({
  insertError = null,
} = {}) {
  let inserted = null

  const loaded = {
    exports: {},
  }

  const source =
    fs.readFileSync(
      new URL(
        '../src/lib/notification-queue.ts',
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

  const db = {
    from() {
      return {
        async insert(
          value
        ) {
          inserted =
            value

          return {
            error:
              insertError,
          }
        },
      }
    },
  }

  const require = (
    name
  ) => {
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
        normalizeNigerianPhone(
          phone
        ) {
          if (
            phone ===
            '09130548110'
          ) {
            return '2349130548110'
          }

          return null
        },
      }
    }

    throw new Error(
      `Unexpected module: ${name}`
    )
  }

  vm.runInNewContext(
    compiled,
    {
      module:
        loaded,

      exports:
        loaded.exports,

      require,
    }
  )

  return {
    ...loaded.exports,

    getInserted:
      () =>
        inserted,
  }
}

test(
  'SMS notification is queued without contacting the provider',
  async () => {
    const queue =
      loadQueue()

    const result =
      await queue
        .queueSmsNotification({
          eventKey:
            'visitor:test',

          kind:
            'visitor',

          phone:
            '09130548110',

          message:
            'Visitor code test',
        })

    assert.equal(
      result.status,
      'queued'
    )

    const inserted =
      queue.getInserted()

    assert.ok(
      inserted
    )

    assert.equal(
      inserted.event_key,
      'visitor:test'
    )

    assert.equal(
      inserted.kind,
      'visitor'
    )

    assert.equal(
      inserted.channel,
      'sms'
    )

    assert.equal(
      inserted.recipient,
      '2349130548110'
    )

    assert.equal(
      inserted.body,
      'Visitor code test'
    )
  }
)

test(
  'duplicate notification is skipped instead of queued twice',
  async () => {
    const queue =
      loadQueue({
        insertError: {
          code:
            '23505',
        },
      })

    const result =
      await queue
        .queueSmsNotification({
          eventKey:
            'registration:test',

          kind:
            'registration',

          phone:
            '09130548110',

          message:
            'Approved',
        })

    assert.equal(
      result.status,
      'skipped'
    )
  }
)

test(
  'invalid phone never reaches the outbox',
  async () => {
    const queue =
      loadQueue()

    const result =
      await queue
        .queueSmsNotification({
          eventKey:
            'visitor:test',

          kind:
            'visitor',

          phone:
            'bad-number',

          message:
            'Test',
        })

    assert.equal(
      result.status,
      'failed'
    )

    assert.equal(
      queue.getInserted(),
      null
    )
  }
)