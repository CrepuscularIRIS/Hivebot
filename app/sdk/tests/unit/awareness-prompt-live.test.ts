// T33 live：真实 Loader + 默认链（不设 P2SDK_PATCH 引 awareness.yml——工单：靠默认链，
// M1 证明删挂载就红）。p2fake scripted，never a real model。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const home = tmkdir('bot-t33-live-')
const dataDir = join(home, 'data')
mkdirSync(dataDir)
mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })

let rt: Runtime
let alphaId = '' // ①格创建的 A（③④复用，避免 session/list 信封形状猜测）
beforeAll(async () => {
  process.env.HOME = tmkdir('bot-t33-live-home-')
  writeFileSync(join(dataDir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: '', bots: {} }))
  // review 中2：真 p2fake（默认 runtime 的 mock provider 不消费 tool-call chunk——
  // subagent 从未创建，④格空绿）。overlay 只叠 fake provider；awareness 仍走默认链
  // （不引 awareness.yml）——M1 的「默认链」语义不变。
  const overlay = join(home, 'fake-provider.yml')
  writeFileSync(overlay, `
- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: '${pathToFileURL(join(new URL('../../', import.meta.url).pathname, 'tests/support/fake/plugin.mjs')).href}'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: p2fake
                contextWindow: 131072
`)
  rt = await launchRuntime({ env: { P2SDK_HOME: home, P2SDK_ORCH_DATA_DIR: dataDir, P2SDK_PATCH: overlay } })
})
afterAll(async () => { await rt?.stop() })

function script(sessionId: string, text = 'ok'): void {
  writeFileSync(join(home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls: Array.from({ length: 4 }, () => ({ chunks: [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ] })) }))
}

async function newSession(title: string | null): Promise<string> {
  const { sessionId } = await rt.client.call('session/create', { request: {} }) as { sessionId: string }
  if (title !== null) await rt.client.call('session/rename', { request: { sessionId, title } })
  script(sessionId)
  return sessionId
}

/** 跑一轮并返回全部 system/message 的拼接文本（记录条数到 out 参数——④格用）。 */
async function systemText(sessionId: string, out?: { systems: number; tools?: string }): Promise<string> {
  const { stream } = await rt.client.follow(sessionId, { awaitSnapshot: true })
  const events: Array<{ type: string, data?: unknown }> = []
  let finish!: () => void
  const ended = new Promise<void>((resolve) => { finish = resolve })
  const drain = (async () => {
    for await (const frame of stream) {
      const event = (frame as { event?: { type: string, data?: unknown } }).event
      if (!event) continue
      events.push(event)
      if (event.type === 'turn/end') finish()
    }
  })()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await rt.client.call('session/prompt', { request: {
      requestId: `t33-${sessionId}-${Date.now()}`,
      sessionId, mode: 'queue', content: [{ type: 'text', text: 't33 roster smoke' }],
    } })
    await Promise.race([ended, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('fake turn did not end')), 60_000)
    })])
    const systems = events.filter((event) => event.type === 'system/message')
    if (out !== undefined) {
      out.systems = systems.length
      out.tools = JSON.stringify(events.filter((e) => e.type === 'tool/result').map((e) => (e.data as { message?: { content?: Array<{ text?: string }> } }).message?.content?.map((c) => c.text ?? '').join('') ?? ''))
      return JSON.stringify(systems)
    }
    expect(systems.length, 'at least one system/message').toBeGreaterThan(0)
    return JSON.stringify(systems)
  } finally {
    clearTimeout(timer)
    stream.cancel()
    void drain
  }
}

const SECTION_MARK = 'This app and the other bots'

it('① 探针格（已由 t33-probe 实测：sessionController.list().items[].projections.values.title 可达）；② A 的 system 含 B 名与 (you)', { timeout: 120_000 }, async () => {
  alphaId = await newSession('Alpha-T33')
  await newSession('Bravo-T33')
  await new Promise((r) => setTimeout(r, 400)) // 缓存刷新竞态余量（session/title 事件 → refresh → cache）
  const text = await systemText(alphaId)
  expect(text, 'A 的 system 含产品认知段').toContain(SECTION_MARK)
  expect(text, 'A 的 system 含同伴名 Bravo-T33').toContain('Bravo-T33')
  expect(text, 'A 的 system 含 (you) 标注').toContain('Alpha-T33\\" (you)')
  expect(text, '指路句在').toContain('Create New Bot')
})

it('③ 新建 C 后 A 再发一条 → 新 system 含 C（现取名册非快照）', { timeout: 120_000 }, async () => {
  expect(alphaId, '①格先跑（vitest 顺序执行）').toBeTruthy()
  await newSession('Charlie-T33')
  await new Promise((r) => setTimeout(r, 400))
  const text = await systemText(alphaId)
  expect(text, 'A 的新一轮 system 含 Charlie-T33').toContain('Charlie-T33')
})

it('④ A1p 确定性化：subagent 真建 → 等 helper 进 list → A 新一轮名册不含 helper（件1+件2）', { timeout: 180_000 }, async () => {
    const a = alphaId
    expect(a, '①格先跑').toBeTruthy()
    const pad = () => ({ chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'pad' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'pad' } },
      { type: 'finish', reason: { kind: 'stop' } },
    ] })
    const subArgs = JSON.stringify({ description: 'T33 helper', prompt: 'help' })
    writeFileSync(join(home, 'fake', 'scripts', `${a}.json`), JSON.stringify({ calls: [
      pad(), pad(),
      { chunks: [
        { type: 'block-start', index: 0, blockType: 'tool-call' },
        { type: 'tool-call-delta', index: 0, id: 't33-sub', name: 'subagent', argumentsDelta: subArgs.slice(0, 5) },
        { type: 'tool-call-delta', index: 0, id: 't33-sub', name: 'subagent', argumentsDelta: subArgs.slice(5) },
        { type: 'block-end', index: 0, block: { type: 'tool-call', id: 't33-sub', name: 'subagent', arguments: subArgs } },
        { type: 'finish', reason: { kind: 'tool-calls' } },
      ] },
      pad(), // 第 4 轮：helper 已进 list 后的名册组装轮
    ] }))
    // 第 3 轮：subagent 真建（断言 id）
    const out: { systems: number; tools?: string } = { systems: 0 }
    await systemText(a, out)
    expect(out.tools ?? '', 'subagent 工具真执行并返回 id').toMatch(/started subagent [0-9a-f-]+/)
    // 等 helper 进 session/list（确定性：不猜竞态）——helper title 来自 prompt（'help …'）
    const deadline = Date.now() + 15_000
    let helperSid = ''
    for (;;) {
      const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string, origin?: string, parentSessionId?: string, projections?: { values?: { title?: string } } }> }
      const helper = (list.items ?? []).find((x) => x.origin === 'subagent' || x.parentSessionId)
      if (helper) { helperSid = helper.sessionId; break }
      if (Date.now() > deadline) break
      await new Promise((r) => setTimeout(r, 200))
    }
    expect(helperSid, 'helper 已进 session/list（带 origin/parentSessionId）').toBeTruthy()
    // 第 4 轮：rename 触发名册变化 → system/message 必重发 → 该 system 不含 helper sid（M4 删滤后 helper 会进名册→红）
    const bravoSid = ((await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string, projections?: { values?: { title?: string } } }> }).items ?? []).find((x) => x.projections?.values?.title === 'Bravo-T33')?.sessionId
    await rt.client.call('session/rename', { request: { sessionId: bravoSid!, title: 'Bravo2-T33' } })
    await new Promise((r) => setTimeout(r, 400))
    const out2: { systems: number } = { systems: 0 }
    const text2 = await systemText(a, out2)
    expect(out2.systems, 'rename 后 A 的新一轮重发 system/message（名册变化）').toBeGreaterThanOrEqual(1)
    expect(text2).toContain('Bravo2-T33') // 新名入册（名册健康+现取）
    expect(text2).not.toContain(helperSid.slice(0, 12)) // helper 的 sessionId 不入名册（滤守卫）
  })
