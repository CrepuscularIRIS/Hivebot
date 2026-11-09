// T34：默认链编排开闸 live——不设 P2SDK_PATCH 引 orchestration.yml（只叠 fake provider），
// PBOTS_DATA_DIR 与 HOME 分开（数据根必须读前者）；主 bot 戴路由帽、worker 受信封。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const ROOT = new URL('../../', import.meta.url).pathname
const home = tmkdir('bot-t34-home-')          // HOME：与数据根不同（默认路径下不得有 bots.json）
const dataDir = tmkdir('bot-t34-data-')       // PBOTS_DATA_DIR：SDK 应读这里
mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })
const overlay = join(home, 'fake.yml')
writeFileSync(overlay, `
- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: '${pathToFileURL(join(ROOT, 'tests/support/fake/plugin.mjs')).href}'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: p2fake
                contextWindow: 131072
`)
const PERSONA_MARK = 'You are a coding agent powered by'
const ROUTING_MARK = 'You are the main bot: you talk with the user and hand their hands-on work to workers.'
const AWARE_MARK = '## This app and the other bots'

let rt: Runtime
let mainId = ''
beforeAll(async () => {
  process.env.HOME = home
  rt = await launchRuntime({ env: { HOME: home, P2SDK_HOME: home, P2SDK_PATCH: overlay, PBOTS_DATA_DIR: dataDir } })
})
afterAll(async () => { await rt?.stop() })

function script(sessionId: string, n = 4): void {
  writeFileSync(join(home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls: Array.from({ length: n }, () => ({ chunks: [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: 'ok' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ] })) }))
}

async function newSession(title: string): Promise<string> {
  const { sessionId } = await rt.client.call('session/create', { request: {} }) as { sessionId: string }
  await rt.client.call('session/rename', { request: { sessionId, title } })
  script(sessionId)
  return sessionId
}

async function systemText(sessionId: string): Promise<string> {
  const { stream } = await rt.client.follow(sessionId, { awaitSnapshot: true })
  const events: Array<{ type: string, data?: unknown }> = []
  let finish!: () => void
  const ended = new Promise<void>((r) => { finish = r })
  const drain = (async () => { for await (const f of stream) { const e = (f as { event?: { type: string, data?: unknown } }).event; if (e) { events.push(e); if (e.type === 'turn/end') finish() } } })()
  await rt.client.call('session/prompt', { request: { requestId: `t34-${sessionId}-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 't34 default-chain smoke' }] } })
  await Promise.race([ended, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('turn timeout')), 60_000))])
  stream.cancel(); void drain
  return JSON.stringify(events.filter((e) => e.type === 'system/message'))
}

it('① 主 bot system 三段齐备（persona+路由+认知），路由在认知前', { timeout: 120_000 }, async () => {
  mainId = await newSession('Main-T34')
  writeFileSync(join(dataDir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: mainId, bots: {} }))
  const text = await systemText(mainId)
  expect(text).toContain(PERSONA_MARK)
  expect(text).toContain(ROUTING_MARK)
  expect(text).toContain(AWARE_MARK)
  expect(text.indexOf(ROUTING_MARK)).toBeLessThan(text.indexOf(AWARE_MARK))
})

it('② worker：persona+认知段有、路由无；名册行带 (worker created by "<主 bot 名>")', { timeout: 120_000 }, async () => {
  const w = await newSession('Worker-T34')
  const meta = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(join(dataDir, 'bots.json'), 'utf8'))) as { version: number, mainBotId: string, bots: Record<string, { createdBy?: string }> }
  meta.bots[w] = { createdBy: mainId }
  writeFileSync(join(dataDir, 'bots.json'), JSON.stringify(meta))
  const text = await systemText(w)
  expect(text).toContain(PERSONA_MARK)
  expect(text).toContain(AWARE_MARK)
  expect(text, 'worker 不戴路由帽').not.toContain(ROUTING_MARK)
  // W 自己视角恒 (you)（selfId 分支优先）——worker 标注在 Main 视角断言（工单意图=证
  // 认知段读到自定义数据根的 createdBy）：Main 再发一轮，名册 W 行带创建者名
  await new Promise((r) => setTimeout(r, 400))
  const mainView = await systemText(mainId)
  expect(mainView, 'JSON 串内引号转义形').toContain('Worker-T34\\\" (worker created by \\\"Main-T34')
})

it('③ 数据根：SDK 读 PBOTS_DATA_DIR（①②已证）；默认路径无 bots.json', async () => {
  const { existsSync } = await import('node:fs')
  expect(existsSync(join(home, '.config', 'pbots-ui', 'bots.json')), '默认路径不得出现 bots.json（SDK 必须读 PBOTS_DATA_DIR）').toBe(false)
})

it('④ 信封 fail closed：worker 调 subagent 被拒、无新会话', { timeout: 120_000 }, async () => {
  const before = ((await rt.client.call('session/list', { _request: {} }) as { items?: unknown[] }).items ?? []).length
  const w = ((await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string, projections?: { values?: { title?: string } } }> }).items ?? []).find((x) => x.projections?.values?.title === 'Worker-T34')?.sessionId
  expect(w, '②格先跑').toBeTruthy()
  const args = JSON.stringify({ description: 'T34 envelope probe', prompt: 'x' })
  // routing-live 模式：预写 N 个相同轮（游标账免疫）——每轮 subagent（被拒后下一 attempt 同样）
  const subTurn = () => ({ chunks: [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: 't34-env', name: 'subagent', argumentsDelta: args.slice(0, 5) },
    { type: 'tool-call-delta', index: 0, id: 't34-env', name: 'subagent', argumentsDelta: args.slice(5) },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: 't34-env', name: 'subagent', arguments: args } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ] })
  writeFileSync(join(home, 'fake', 'scripts', `${w}.json`), JSON.stringify({ calls: Array.from({ length: 6 }, subTurn) }))
  const { stream } = await rt.client.follow(w, { awaitSnapshot: true })
  const events: Array<{ type: string, data?: unknown }> = []
  let finish!: () => void
  const ended = new Promise<void>((r) => { finish = r })
  const drain = (async () => { for await (const f of stream) { const e = (f as { event?: { type: string, data?: unknown } }).event; if (e) { events.push(e); if (e.type === 'turn/end') finish() } } })()
  await rt.client.call('session/prompt', { request: { requestId: `t34env-${Date.now()}`, sessionId: w, mode: 'queue', content: [{ type: 'text', text: 'try subagent' }] } })
  await Promise.race([ended, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('turn timeout')), 60_000))])
  // envelope-live 同款：turn/end 先落、tool/result 随后——补等 results>=calls
  const calls1 = events.filter((e) => e.type === 'tool/call').length
  for (let i = 0; i < 60 && events.filter((e) => e.type === 'tool/result').length < calls1; i += 1) await new Promise((r) => setTimeout(r, 500))
  stream.cancel(); void drain
  const toolResults = events.filter((e) => e.type === 'tool/result').map((e) => JSON.stringify((e.data as { message?: { isError?: boolean, content?: Array<{ text?: string }> } }).message ?? {}))
  expect(toolResults.join('\n'), 'subagent 调用被拒（信封）').toMatch(/isError.{0,20}true|refus|denied|forbidden|worker/i)
  const after = ((await rt.client.call('session/list', { _request: {} }) as { items?: unknown[] }).items ?? []).length
  expect(after, '无新增子会话').toBe(before)
})

describe('T34 orchDataDir 四分支（mock 直测——identity 覆盖补）', () => {
  it('P2SDK_ORCH_DATA_DIR > DSH_PBOTS_DATA_DIR > PBOTS_DATA_DIR > HOME 默认', async () => {
    const { orchDataDir } = await import('../../src/orchestration/identity.mjs')
    expect(orchDataDir({ P2SDK_ORCH_DATA_DIR: '/a', DSH_PBOTS_DATA_DIR: '/b', PBOTS_DATA_DIR: '/c', HOME: '/h' })).toBe('/a')
    expect(orchDataDir({ DSH_PBOTS_DATA_DIR: '/b', PBOTS_DATA_DIR: '/c', HOME: '/h' })).toBe('/b')
    expect(orchDataDir({ PBOTS_DATA_DIR: '/c', HOME: '/h' })).toBe('/c')
    expect(orchDataDir({ HOME: '/h' })).toContain('/h/.config/pbots-ui')
    expect(orchDataDir({ P2SDK_ORCH_DATA_DIR: '', DSH_PBOTS_DATA_DIR: '/b' })).toBe('/b') // 空串跳过
  })
})
