import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../src/lib/payment-processing.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const verified = { reference: 'INV-test', amount: 500000, currency: 'NGN', paid_at: '2026-09-20T10:00:00Z' }
function load(rpc) {
  const context = { exports: {}, require: () => ({ createServiceClient: () => ({ rpc }) }) }
  vm.runInNewContext(compiled, context)
  return context.exports.applyConfirmedPayment
}
test('passes verified amount, currency and paid time to the atomic RPC', async () => {
  let args
  const apply = load(async (name, input) => { args = { name, input }; return { data: { ok: true, applied: 2, alreadyProcessed: 0 }, error: null } })
  assert.equal((await apply(verified)).applied, 2)
  assert.equal(args.name, 'confirm_estate_payment')
  assert.deepEqual(JSON.parse(JSON.stringify(args.input)), { p_reference: verified.reference, p_amount_kobo: 500000, p_currency: 'NGN', p_paid_at: verified.paid_at })
})
test('database failure cannot be reported as payment success', async () => {
  const apply = load(async () => ({ data: null, error: { message: 'failed write' } }))
  await assert.rejects(apply(verified), /could not be recorded/)
})
test('missing confirmation result cannot be reported as success', async () => {
  const apply = load(async () => ({ data: null, error: null }))
  await assert.rejects(apply(verified), /did not complete/)
})
