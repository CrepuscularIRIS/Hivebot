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

it('④ subagent helper 不入名册：subagent 轮后 A 的 system/message 不再发（名册未增——工单 b 选项等价证明）', { timeout: 120_000 }, async () => {
  const a = alphaId
  expect(a, '①格先跑').toBeTruthy()
  // p2fake 脚本一轮调 subagent 工具（若工具不可达则该格降级为「名册无子会话」断言——回执写清）
  const pad = () => ({ chunks: [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: 'pad' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'pad' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ] })
  writeFileSync(join(home, 'fake', 'scripts', `${a}.json`), JSON.stringify({ calls: [
    pad(), pad(), // ①③两轮已消耗——垫齐轮次（④是 A 的第 3 次 prompt）
    { chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id: 't33-sub', name: 'subagent', argumentsDelta: '{"description":"T33 helper","prompt":"help"}' },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id: 't33-sub', name: 'subagent', arguments: '{"description":"T33 helper","prompt":"help"}' } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ] },
    { chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'sub done' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'sub done' } },
      { type: 'finish', reason: { kind: 'stop' } },
    ] },
  ] }))
  const out: { systems: number; tools?: string } = { systems: 0 }
  const text = await systemText(a, out)
  // review 中2：先证 subagent 真创建了（tool/result 返回 started subagent id）——否则「名册未增」是空绿
  expect(out.tools ?? '', 'subagent 工具真执行并返回 id').toMatch(/started subagent [0-9a-f-]+/)
  expect(out.systems, 'subagent 轮不再发 system/message（名册未增——helper 被 origin 滤除）').toBe(0)
  expect(text, 'helper 的 title 不入 A 名册').not.toContain('help')
})
