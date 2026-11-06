import assert from 'node:assert/strict'
import { AdminChannel } from './A-runtime/project/app/sdk/src/admin/channel.mjs'
import { wireAdminChannel } from './A-runtime/project/app/ui/main/admin/channel.ts'
import { createAdminConsumer } from './A-runtime/project/app/ui/main/admin/consumer.ts'
import { reverifyAdminRequest } from './A-runtime/project/app/ui/main/admin/policy.ts'
const ch = new AdminChannel({ timeoutMs: 1000 }), peer = {}, queue = [], rpcFrames = []
ch.attach({ peer, generation: 3, queue })
let sink
const record = { originRef: 'host-origin', sessionId: 's', turnId: 't', generation: 3, originClass: 'user' }
const consumer = createAdminConsumer({ actions: { list: async () => ({ error: { code: 'mock-upstream-error', message: 'failed', details: { token: 'SYNTHETIC-BRIDGE-MARKER', pid: 4242 } } }) } })
const main = wireAdminChannel({
  dsh: {
    onConnected() {},
    async ready() { return { openStream(endpoint, args, callback) { sink = callback; return { cancel() { sink = undefined } } } } },
    async rpc(method, args) { rpcFrames.push({ method, args }); const { requestId, ...outcome } = args.request; ch.respond(requestId, outcome, peer); return { ok: true } },
  },
  verify: (req) => reverifyAdminRequest(req, record, 3),
  dispatch: consumer.dispatch,
  currentGeneration: () => 3,
  log: (message) => console.log(JSON.stringify({ log: message })),
})
await new Promise(r => setTimeout(r, 0))
const input = { sessionId: 's', turnId: 't', originRef: 'host-origin', action: 'list', params: {} }
const pending = ch.request(input).then(value => ({ value }), error => ({ error: { code: error.code, message: error.message, details: error.details } }))
sink({ type: 'item', value: queue.shift() })
const actual = await pending
console.log(JSON.stringify({ input, path: 'AdminChannel.request -> wireAdminChannel.verify -> registered consumer -> main rpc -> same-peer AdminChannel.respond -> SDK rejection', rpcFrames, actual }))
main.close(); ch.detach()
assert.ok(!JSON.stringify(actual).includes('SYNTHETIC-BRIDGE-MARKER'), 'error details reached SDK without redaction')
