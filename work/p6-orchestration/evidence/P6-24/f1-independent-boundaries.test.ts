import { it, expect } from '/tmp/bot-wt/P6-24/app/sdk/node_modules/vitest/dist/index.js'
import { mkdirSync, symlinkSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '/tmp/bot-wt/P6-24/app/sdk/tests/support/tmp-sweep.ts'
import { BotsMetaStore } from '/tmp/bot-wt/P6-24/app/ui/main/m3-meta/store.ts'
import { createWorkerBot } from '/tmp/bot-wt/P6-24/app/ui/main/m3-meta/orchestrate.ts'
import { registerCreateBot } from '/tmp/bot-wt/P6-24/app/sdk/src/orchestration/create.mjs'
import { Slots } from '/tmp/bot-wt/P6-24/app/sdk/src/orchestration/slots.mjs'

it('independent: subdir prefix sibling + loop reject before create; same initiator subtree canonical success', async () => {
  const root = tmkdir('bot-p624-f1-independent-boundary-')
  const cwd = join(root, 'workspaces', 'main', 'inner')
  mkdirSync(join(cwd, 'target'), { recursive: true })
  mkdirSync(cwd + '-evil')
  symlinkSync(cwd + '-evil', join(cwd, 'out'))
  symlinkSync('loop', join(cwd, 'loop'))
  symlinkSync('target', join(cwd, 'safe'))
  const store = new BotsMetaStore(root)
  const creates: any[] = []
  const dsh: any = { rpc: async (method: string, args: any) => {
    if (method === 'session/list') return { ok: true, value: { items: [{ sessionId: 'main', cwd }] } }
    if (method === 'session/create') { creates.push(args); return { ok: true, value: { sessionId: args.request.sessionId } } }
    return { ok: true, value: {} }
  } }
  try {
    await store.init(); await store.patchMainBotId('main')
    const invoke = (subdir: string) => createWorkerBot(dsh, store, { name: 'w', prompt: 'p', mainBotId: 'main', subdir }, { dataDir: root })
    const outside = await invoke('out')
    const loop = await invoke('loop')
    expect(outside).toMatchObject({ ok: false, error: { code: 'pbots/orchestration-failed' } })
    expect(loop).toMatchObject({ ok: false, error: { code: 'pbots/storage' } })
    expect(creates).toHaveLength(0)
    expect(store.read().bots).toBeUndefined()
    const normal = await invoke('safe')
    expect(normal.ok).toBe(true)
    expect(creates).toHaveLength(1)
    expect(creates[0].request.cwd).toBe(realpathSync(join(cwd, 'target')))
    console.log('INDEPENDENT_SUBDIR', JSON.stringify({ outside, loop, normal, canonical: creates[0].request.cwd }))
  } finally { store.close() }
})

it('independent: persistence flush fails after main response; claims and capacity release; same-artifact retry succeeds', async () => {
  const dir = tmkdir('bot-p624-f1-independent-claim-')
  writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'main', recipes: {} }))
  let definition: any
  let flushFails = true
  let requests = 0
  const handlers: any = {}
  const ctx: any = {
    tools: { register: (d: any) => { definition = d; return () => {} } },
    on: (name: string, fn: any) => { (handlers[name] ??= []).push(fn); return () => {} },
    sessionPersistence: { flush: async () => { if (flushFails) throw new Error('independent-flush-failure') } },
  }
  const orch: any = {
    config: { dataDir: dir }, slots: new Slots(3),
    channel: { request: async () => ({ sessionId: `w${++requests}` }) },
    agentOf: async (id: string) => ({ id }), delivery: { send: async () => {} },
  }
  registerCreateBot(ctx, orch)
  const invoke = () => definition.execute({ name: 'w', prompt: 'p', artifacts: ['shared.txt'] }, { agent: { id: 'main' } })
  await expect(invoke()).rejects.toThrow('independent-flush-failure')
  expect(orch.claims.size).toBe(0); expect(orch.slots.used).toBe(0); expect(orch.slotHolds.size).toBe(0)
  flushFails = false
  expect(await invoke()).toMatchObject({ sessionId: 'w2' })
  expect(orch.claims.size).toBe(1); expect(orch.slots.used).toBe(1)
  for (const fn of handlers['session/event'] ?? []) fn({ id: 'w2' }, { type: 'turn/end' })
  expect(orch.claims.size).toBe(0); expect(orch.slots.used).toBe(0)
  console.log('INDEPENDENT_FLUSH_RETRY', JSON.stringify({ requests, claims: orch.claims.size, slots: orch.slots.used }))
})
