// P6-10.f2a C-1 修复后探针：复用 verifier vfy-extra.mjs 的 c（details）/d（warn）
// 两段 rig，断言反转——两处均不得再含绝对路径，且保留 <path>/尾段 相对提示。
// 修复前（红基线）：vfy-extra.mjs:51/58 断言泄漏存在并通过；本探针与
// orchestration-create.test.ts C-1 describe +2 用例先红后绿。
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
const WT = '/tmp/bot-wt/P6-10f2', TMP = '/tmp/bot-p610f2a'
const { registerCreateBot } = await import(WT + '/app/sdk/src/orchestration/create.mjs')
const { CreateChannel } = await import(WT + '/app/sdk/src/orchestration/main-channel.mjs')
const { Slots } = await import(WT + '/app/sdk/src/orchestration/slots.mjs')
const require = createRequire(WT + '/app/ui/package.json')
const esbuild = require(WT + '/app/ui/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild')
await esbuild.build({ stdin: { contents: `export {createWorkerBot} from '${WT}/app/ui/main/m3-meta/orchestrate.ts'; export {BotsMetaStore} from '${WT}/app/ui/main/m3-meta/store.ts'`, resolveDir: WT }, bundle: true, platform: 'node', format: 'cjs', outfile: TMP + '/main.cjs' })
const { createWorkerBot, BotsMetaStore } = require(TMP + '/main.cjs')
const wait = async fn => { const end = Date.now() + 5000; while (!fn()) { if (Date.now() > end) throw Error('barrier timeout'); await new Promise(r => setTimeout(r, 1)) } }
await mkdir(TMP + '/home', { recursive: true })
let n = 0
async function rig() {
  const dir = join(TMP, 'f2a-' + n++); await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'main', recipes: {}, bots: { w: { createdBy: 'main' } } }))
  let tool; const ctx = { tools: { register(d) { tool = d } }, sessionPersistence: { flush: async () => {} }, on() { return () => {} } }
  const channel = new CreateChannel({ timeoutMs: 5000 }), sub = { peer: 'p', queue: [], wake: null }; channel.attach(sub)
  const slots = new Slots(3), orch = { config: { dataDir: dir }, slots, channel, agentOf: async () => ({ id: 'w' }), delivery: { send: async () => {} } }
  registerCreateBot(ctx, orch)
  return { tool, channel, sub, orch, dir, start: () => tool.execute({ name: 'worker', prompt: 'task' }, { agent: { id: 'main' } }) }
}
// c：session/create 失败带结构化 details（path / nested.cause / 数组）
const c = await rig(), store = new BotsMetaStore(c.dir); await store.init(); await store.patchMainBotId('main')
const cp = c.start().catch(e => e); await wait(() => c.sub.queue.length === 1)
const secretPath = join(c.dir, 'private-data', 'sessions', 'worker.json')
const failed = await createWorkerBot({ rpc: async () => ({ ok: false, error: { code: 'storage', message: 'read failed ' + secretPath, details: { path: secretPath, nested: { cause: 'ENOTDIR ' + secretPath }, peers: [secretPath] } } }) }, store, c.sub.queue[0], { dataDir: c.dir })
c.channel.respond(c.sub.queue[0].requestId, { error: failed.error }, 'p'); const ce = await cp
assert.ok(!ce.message.includes(TMP), 'message leak')
assert.ok(!JSON.stringify(ce.details).includes(secretPath), 'DETAILS LEAK: ' + JSON.stringify(ce.details))
assert.ok(JSON.stringify(ce.details).includes('<path>/sessions/worker.json'), 'details hint missing: ' + JSON.stringify(ce.details))
console.log('PASS f2a details redacted: ' + JSON.stringify(ce.details))
store.close()
// d：成功 + rename 失败 → warn 进 output.render（模型可见面）
const d = await rig(), ds = new BotsMetaStore(d.dir); await ds.init(); await ds.patchMainBotId('main')
const dp = d.start(); await wait(() => d.sub.queue.length === 1)
const renamePath = join(d.dir, 'private-data', 'sessions', 'worker.json')
const success = await createWorkerBot({ rpc: async (method, args) => method === 'session/create' ? { ok: true, value: { sessionId: args.request.sessionId } } : { ok: false, error: { code: 'storage', message: 'ENOTDIR rename ' + renamePath } } }, ds, d.sub.queue[0], { dataDir: d.dir })
d.channel.respond(d.sub.queue[0].requestId, { value: success.value }, 'p'); const dv = await dp
const rendered = d.tool.output.render({}, dv)
assert.ok(!JSON.stringify(rendered).includes(renamePath), 'WARN LEAK: ' + JSON.stringify(rendered))
assert.ok(JSON.stringify(rendered).includes('<path>/sessions/worker.json'), 'warn hint missing: ' + JSON.stringify(rendered))
console.log('PASS f2a warn redacted: ' + JSON.stringify(rendered))
ds.close()
console.log('F2A REDACT PROBES COMPLETE (details/warn clean)')
