import assert from 'node:assert/strict'
import { authorize } from './A-runtime/project/app/sdk/src/admin/authority.mjs'
import { AdminTurnOrigin } from './A-runtime/project/app/sdk/src/admin/origin.mjs'
import { resolveAdminAction } from './A-runtime/project/app/sdk/src/admin/tools.mjs'
import { validateAdminRequest, AdminChannel } from './A-runtime/project/app/sdk/src/admin/channel.mjs'
import { createAdminConsumer, sanitizeAdminValue } from './A-runtime/project/app/ui/main/admin/consumer.ts'
import { reverifyAdminRequest } from './A-runtime/project/app/ui/main/admin/policy.ts'
let safetyFailures = 0
function check(name, input, actual, safe) {
  console.log(JSON.stringify({ name, input, actual, expected: safe ? 'safe control holds' : 'must not allow / expose unauthorized payload', result: safe ? 'REFUTED/control PASS' : 'CONFIRMED safety failure' }))
  if (!safe) safetyFailures++
}
const human = { turnClass: 'user', action: 'modify', target: 'bot-22', humanUtteranceOfGrant: 'rename bot-22 to Alice', params: { name: 'Alice' } }
check('H1-positive', human, authorize(human), authorize(human).decision === 'allow')
const forged = { ...human, params: { name: 'Mallory', model: 'other-model', prompt: 'unrequested instructions', cwd: '/unrequested' } }
check('A1-parameter-substitution', forged, authorize(forged), authorize(forged).decision !== 'allow')
const prohibited = { ...human, params: { profile: { apiKey: 'SYNTHETIC-KEY-NOT-A-CREDENTIAL' } } }
check('prohibited-key-control', prohibited, authorize(prohibited), authorize(prohibited).code === 'prohibited-param')
const grant = { id: 'grant-1', actions: ['install', 'disable'], scopes: { plugins: ['gh-x', 'gh-y'] }, grantUtterance: 'install gh-x; disable gh-y' }
const delegated = { turnClass: 'delegated', mandate: grant, action: 'disable', target: 'gh-x' }
check('A2-cross-action-target-cartesian-expansion', delegated, authorize(delegated), authorize(delegated).decision !== 'allow')
const exactGrant = { ...delegated, target: 'gh-y' }
check('grant-positive-control', exactGrant, authorize(exactGrant), authorize(exactGrant).decision === 'allow')
const conflict = { ...human, humanUtteranceOfGrant: 'rename bot-22 to Alice; do not rename bot-22', mandate: { actions: ['modify'], scopes: { bots: ['bot-22'] }, grantUtterance: 'modify bot-22' } }
check('negation-conflict-refutation', conflict, authorize(conflict), authorize(conflict).code === 'negated')
const raw = { ...human, humanUtteranceOfGrant: 'install gh-x', action: 'install', target: 'gh-xy' }
check('substring-refutation', raw, authorize(raw), authorize(raw).decision !== 'allow')
const worker = { ...human, turnClass: 'tainted', mandate: grant }
check('worker-cannot-expand', worker, authorize(worker), authorize(worker).code === 'tainted-turn')
const origin = new AdminTurnOrigin(); origin.record('a', 1, 'user'); origin.record('a', 2, 'agent-message')
check('cross-turn-classification', { oldTurn: 1, newTurn: 2 }, origin.classify('a', 2), origin.classify('a', 2).originClass === 'delegated')
origin.record('a', 2, 'pbots-worker'); origin.record('a', 2, 'user')
check('worker-user-conflict', {}, origin.classify('a', 2), origin.classify('a', 2).originClass === 'tainted')
const req = { sessionId: 's', turnId: 't', originRef: 'o', action: 'list', params: {} }
for (const [name, input] of [['null', null], ['oversize', { ...req, params: { blob: 'x'.repeat(9000) } }], ['spoof-generation', { ...req, generation: 999 }]]) {
  let actual; try { validateAdminRequest(input); actual = 'accepted' } catch (e) { actual = e.code }
  check('SDK-input-' + name, name, actual, actual !== 'accepted')
}
const ch = new AdminChannel({ timeoutMs: 200 }); const queue = []; const main = {}; const other = {}; ch.attach({ peer: main, generation: 3, queue })
const pending = ch.request(req); let peerError; try { ch.respond(queue[0].requestId, { value: { ok: true } }, other) } catch (e) { peerError = e.code }
check('non-main-peer', {}, { peerError, pending: ch.pendingCount() }, peerError === 'pbots/forbidden' && ch.pendingCount() === 1)
ch.respond(queue[0].requestId, { value: { ok: true } }, main); await pending; ch.detach()
for (const action of ['__proto__', 'constructor', 'toString']) {
 const out = await createAdminConsumer().dispatch({ ...req, action })
 check('prototype-action-' + action, action, { sdk: resolveAdminAction(action), ui: out }, !resolveAdminAction(action).known && out.error.code === 'pbots/admin-unavailable')
}
const identity = { ...req, requestId: 'r', generation: 3 }
const record = { originRef: 'o', sessionId: 's', turnId: 't', generation: 3, originClass: 'user' }
for (const [name, request, rec] of [['old-request', { ...identity, generation: 2 }, record], ['old-record', identity, { ...record, generation: 2 }], ['other-turn', { ...identity, turnId: 't2' }, record], ['made-up-origin', { ...identity, originRef: 'fake' }, record]]) {
 const out = reverifyAdminRequest(request, rec, 3)
 check('identity-' + name, request, out, out.ok === false)
}
const marker = 'SYNTHETIC-LEAK-MARKER'
const errorConsumer = createAdminConsumer({ actions: { list: async () => ({ error: { code: 'upstream', message: 'failed', details: { token: marker, process: { pid: 4242 } } } }) } })
const leaked = await errorConsumer.dispatch(req)
check('A3-error-details-unsanitized', { action: 'list', injectedError: { details: { token: marker, process: { pid: 4242 } } } }, leaked, !JSON.stringify(leaked).includes(marker) && !JSON.stringify(leaked).includes('4242'))
const valueConsumer = createAdminConsumer({ actions: { list: async () => ({ value: { token: marker, process: { pid: 4242 }, keep: 1 } }) } })
const cleaned = await valueConsumer.dispatch(req)
check('value-sanitization-control', {}, cleaned, JSON.stringify(cleaned) === '{"value":{"process":{},"keep":1}}')
const protoPayload = JSON.parse('{"__proto__":{"token":"SYNTHETIC"},"keep":1}')
const protoOut = sanitizeAdminValue(protoPayload)
check('prototype-global-pollution-refuted', protoPayload, { output: protoOut, globalToken: ({}).token }, ({}).token === undefined)
console.log(JSON.stringify({ safetyFailures, note: 'Failures are reproducible module-level findings; empty production action table limits present exposure. No live RPC/model/desktop invoked.' }))
assert.equal(safetyFailures, 0, 'Safety contract failures reproduced; see CONFIRMED rows')
