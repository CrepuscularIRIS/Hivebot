// T-17 语义矩阵探针：import 真实 shell-ask.mjs，逐格核对
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const plugin = require('/tmp/bot-wt/T-17/app/sdk/src/policy/shell-ask.mjs')

const NEXT = Symbol('next')
const next = () => NEXT
const agent = { session: {} }

function listenerFor(approval) {
  const listeners = []
  const ctx = {
    on: (event, l) => listeners.push(l),
    get: (name) => (name === 'approval' ? approval : name === 'sandboxPolicy' ? { resolve: () => ({ mode: 'workspace-write' }) } : undefined),
  }
  plugin.apply(ctx)
  return listeners[0]
}
const svc = (overrideOf, policy) => ({ overrideOf, config: policy === undefined ? {} : { policy: policy } })
const bash = (withAgent = true) => ({ name: 'bash', ...(withAgent ? { agent } : {}), arguments: { command: 'ls', description: 'x' } })

const cells = [
  ['1 正常 never（override 可读）', listenerFor(svc(() => 'never', undefined)), bash(), 'NEXT'],
  ['2 config 未设 + overrideOf 抛错', listenerFor(svc(() => { throw new Error('projection unavailable') }, undefined)), bash(), 'ASK'],
  ['3 无 session + config=never', listenerFor(svc(() => { throw new Error('never called') }, 'never')), bash(false), 'NEXT'],
  ['4 默认 preset pin 的 ask', listenerFor(svc(() => 'ask', undefined)), bash(), 'ASK'],
  ['5 抛错 + config=never（新用例场景，真 override=ask）', listenerFor(svc(() => { throw new Error('projection unavailable') }, 'never')), bash(), 'ASK'],
]

let fail = 0
for (const [name, l, exec, expect] of cells) {
  const got = l(exec, next)
  const gotName = got === NEXT ? 'NEXT' : got && got.kind === 'ask' ? 'ASK' : `?? ${JSON.stringify(got)}`
  const ok = gotName === expect
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name} → ${gotName}（期望 ${expect}）`)
}
process.exit(fail ? 1 : 0)
