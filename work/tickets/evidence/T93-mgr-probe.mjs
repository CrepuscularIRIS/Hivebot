// 经理 T93 验收探针：Sol /tmp/t93-review-probe.mjs 的两 HIGH + M1/M3 在修后形态上反向断言（应全部「已修」）。
import assert from 'node:assert/strict'
import { rollBackLastTurn } from '/tmp/bot-wt/T93/app/ui/renderer-grok/shim/src/rollback.ts'
const u1 = { id: 'u1', role: 'user', source: { kind: 'user', rpcId: 'r1' }, content: [{ type: 'text', text: '问一' }] }
const u2 = { id: 'u2', role: 'user', source: { kind: 'user', rpcId: 'r2' }, content: [{ type: 'text', text: '问二' }] }
const w = { id: 'w', role: 'user', source: { kind: 'pbots-worker' }, content: [{ type: 'text', text: '工人回报' }] }
const real = [
  { event: { seq: 5, type: 'user/message', data: u1 } },
  { event: { seq: 12, type: 'turn/end', data: {} } },
  { event: { seq: 21, type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, inserted: [u2] } } },
  { event: { seq: 23, type: 'user/message', data: u2 } },
  { event: { seq: 30, type: 'turn/end', data: {} } },
  { event: { seq: 31, type: 'user/message', data: w } },
]
function rig({ records = real, bots = {}, patchFail = false, renameFail = false } = {}) {
  const store = new Map(); const calls = []; const meta = { mainBotId: 'parent', bots, recipes: {}, version: 1 }
  const api = {
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    async call(m, a) {
      calls.push([m, a])
      if (m === 'session/events') return { ok: true, value: { records } }
      if (m === 'session/fork') return { ok: true, value: { sessionId: 'child' } }
      if (m === 'session/list') return { ok: true, value: { items: [{ sessionId: 'parent', title: 'Parent' }] } }
      if (m === 'session/rename' && renameFail) return { ok: false, error: { code: 'x', message: 'rename failed' } }
      return { ok: true }
    },
    async botsMeta(op) { calls.push(['botsMeta', op]); if (op === 'get') return { ok: true, value: structuredClone(meta) }; if (patchFail) return { ok: false }; meta.mainBotId = op.mainBotId; return { ok: true } },
  }
  return { api, calls, store, meta }
}
let x = rig({ bots: { worker: { createdBy: 'parent' } } }); let r = await rollBackLastTurn(x.api, 'parent')
assert.equal(r.ok, true); const fork = x.calls.find(([m]) => m === 'session/fork')
assert.equal(fork[1].request.atSeq, 12); console.log('H1 FIXED real shape → fork atSeq', fork[1].request.atSeq, '(worker 源消息不算用户)')
assert.equal(x.meta.mainBotId, 'child'); assert.equal(x.calls.filter(([m, o]) => m === 'botsMeta' && o !== 'get').length, 1); console.log('H2 FIXED mainBotId=child，单次 patch')
assert.equal(r.lastUserText, '问二'); console.log('M1 FIXED lastUserText =', r.lastUserText)
x = rig({ patchFail: true }); r = await rollBackLastTurn(x.api, 'parent'); assert.equal(r.ok, false); assert.equal(x.store.get('pbots.shim.superseded') ?? null, null); console.log('M3 FIXED patch 失败 → ok:false，父未 superseded')
x = rig({ renameFail: true }); r = await rollBackLastTurn(x.api, 'parent'); assert.equal(r.ok, false); assert.equal(x.store.get('pbots.shim.superseded') ?? null, null); console.log('M3 FIXED rename 失败 → ok:false')
console.log('MGR_PROBE_OK')
