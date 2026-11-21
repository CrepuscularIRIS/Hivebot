// T73b e2e：①② bot 写不进授权文件（工具真实到达+硬拒/出卡挂起+文件不存在）；
// ③ 无活卡 remember refused；④ 审高①完整链——真出卡→答卡收尾→remember→
// 同 bot 同连接器下一轮 standing grant 直放（真实 config 接线，createWithConnectors
// 的 bot 路径）。PBOTS_DATA_DIR 必须隔离（缺省=~/.config/pbots-ui 会写真实用户目录）。
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const PKG_ROOT = join(__dirname, '..', '..')
const MEM_SPEC = '@modelcontextprotocol/server-memory@2.1.1'
const WRAPPER = '@p2sdk-market/modelcontextprotocol__server-memory'
const SERVER = 'server-memory-30e6e77d'
const TOOL = `mcp__${SERVER}__create_entities`

const toolCall = (name: string, args: object): object => {
  const id = `t73b-${Math.random().toString(16).slice(2, 8)}`
  const a = JSON.stringify(args)
  return { chunks: [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: a.slice(0, 5) },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: a.slice(5) },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: a } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ], paceMs: 10 }
}
const textCall = (text: string): object => ({ chunks: [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text },
  { type: 'block-end', index: 0, block: { type: 'text', text } },
  { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
  { type: 'finish', reason: { kind: 'stop' } },
], paceMs: 10 })

let rt: Runtime
let dataDir: string
const grantsFile = (): string => join(dataDir, 'p', 'standing-grants.json')

beforeAll(async () => {
  const dir = tmkdir('t73b-e2e-patch-')
  dataDir = tmkdir('t73b-data-')
  const overlay = join(dir, 'fake-llm.yml')
  writeFileSync(overlay, `\
- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: '${pathToFileURL(join(PKG_ROOT, 'tests', 'support', 'fake', 'plugin.mjs')).href}'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: p2fake
                contextWindow: 131072
`)
  rt = await launchRuntime({ env: { P2SDK_PATCH: overlay, PBOTS_DATA_DIR: join(dataDir, 'p') } })
}, 240_000)

afterAll(async () => { await rt?.stop() }, 60_000)

let turnSeq = 0
/** 每轮独立 plain session + 断言工具真实到达与终结形态（写 NEVER 根：deny 或出卡挂起都是「写不进」）。 */
const runTurn = async (toolName: string, args: object): Promise<{ sid: string; frames: unknown[]; toolReached: boolean; deniedOrAsked: boolean }> => {
  const sid = (await rt.client.call('session/create', { request: { cwd: join(rt.home, 'workspace') } }) as { sessionId: string }).sessionId
  mkdirSync(join(rt.home, 'fake', 'scripts'), { recursive: true })
  writeFileSync(join(rt.home, 'fake', 'scripts', `${sid}.json`), JSON.stringify({ calls: [toolCall(toolName, args)] }))
  const stream = await rt.client.follow(sid, { assistantStream: true })
  const frames: unknown[] = []
  void (async () => { for await (const f of stream) frames.push(f) })()
  await rt.client.call('session/prompt', { request: { requestId: `t73b-${++turnSeq}-${Math.random().toString(16).slice(2, 8)}`, sessionId: sid, mode: 'queue', content: [{ type: 'text', text: 'go' }] } })
  await new Promise((r) => setTimeout(r, 20_000))
  stream.cancel()
  const raw = JSON.stringify(frames)
  return { sid, frames, toolReached: raw.includes(toolName), deniedOrAsked: /approval|denied|reject|not permitted|error/i.test(raw) }
}

it('① bash 写 standing-grants.json：批准普通审批后真跑仍写不进（数据根对 bash 遮蔽）', async () => {
  // Sol 复审中③：批准 bash 审批（allowed-once）让命令真执行——「批准后仍写不进」才是硬证
  const { connect } = await import('../../examples/lib/client.mjs')
  const feed = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const evStream = await feed.socket.open('$events', {})
  const evFrames: Array<{ type?: string; event?: string; eventId?: string; agentId?: string; clientId?: string }> = []
  void (async () => { for await (const f of evStream) evFrames.push(f as typeof evFrames[number]) })().catch(() => {})
  const readyDl = Date.now() + 5_000
  while (!evFrames.some((f) => f.type === 'ready') && Date.now() < readyDl) await new Promise((r) => setTimeout(r, 50))

  const sid = (await rt.client.call('session/create', { request: { cwd: join(rt.home, 'workspace') } }) as { sessionId: string }).sessionId
  mkdirSync(join(rt.home, 'fake', 'scripts'), { recursive: true })
  writeFileSync(join(rt.home, 'fake', 'scripts', `${sid}.json`), JSON.stringify({ calls: [
    toolCall('bash', { command: `echo '{"version":1}' > ${grantsFile()}` }),
    textCall('done'),
  ] }))
  const stream = await rt.client.follow(sid, { assistantStream: true })
  const frames: unknown[] = []
  void (async () => { for await (const f of stream) frames.push(f) })()
  await rt.client.call('session/prompt', { request: { requestId: `t73b-b1-${Math.random().toString(16).slice(2, 8)}`, sessionId: sid, mode: 'queue', content: [{ type: 'text', text: 'go' }] } })
  const deadline = Date.now() + 90_000
  for (;;) {
    const req = evFrames.find((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sid)
    if (req?.eventId !== undefined) {
      const clientId = evFrames.find((f) => f.type === 'ready')?.clientId ?? ''
      await feed.call('$events/result', { clientId, eventId: req.eventId, outcome: { kind: 'result', value: 'allowed-once' } })
      break
    }
    if (Date.now() >= deadline) throw new Error('bash 审批请求未到')
    await new Promise((r) => setTimeout(r, 100))
  }
  for (;;) {
    if (frames.some((f) => (f as { event?: { type?: string } }).event?.type === 'turn/end')) break
    if (Date.now() >= deadline) throw new Error('批准后 turn/end 未到——bash 没真跑？')
    await new Promise((r) => setTimeout(r, 50))
  }
  stream.cancel(); feed.close()
  const raw = JSON.stringify(frames)
  expect(raw, 'bash 调用真实执行（有结果帧）').toContain('tool/call')
  expect(existsSync(grantsFile()), '批准后 bash 仍写不出 standing-grants.json（数据根对 bash 遮蔽）').toBe(false)
}, 240_000)

it('② write 工具写 standing-grants.json：guard 硬 NEVER 结构化拒绝', async () => {
  const r = await runTurn('write', { path: grantsFile(), content: '{"version":1}' })
  expect(r.toolReached, 'write 调用真实到达管线').toBe(true)
  const raw = JSON.stringify(r.frames)
  // 硬拒证据：工具结果帧里有结构化错误（拒绝原因串），而非泛泛 error——guard NEVER 的
  // 拒绝走工具结果（writeOut/NEVER 类文案），模型收到后才收尾
  expect(raw).toMatch(/denied|not permitted|outside|never|reject/i)
  expect(existsSync(grantsFile()), 'write 没能写出 standing-grants.json').toBe(false)
}, 120_000)

it('③ 无活卡 remember → refused + 文件未创建；clear 空表回 0', async () => {
  expect(existsSync(grantsFile()), '此前用例没写过').toBe(false)
  let refused = false
  try {
    await rt.client.call('p2sdk/connector_grants_remember', { request: { botId: 'session-fake-bot', serverName: SERVER } })
  } catch { refused = true }
  expect(refused, '无活卡 remember 被拒').toBe(true)
  expect(existsSync(grantsFile()), '文件未创建').toBe(false)
  const cleared = await rt.client.call('p2sdk/connector_grants_clear', {}) as { clearedCount?: number }
  expect(cleared?.clearedCount).toBe(0)
}, 120_000)

it('④ 审高①完整链：真出卡→答卡收尾→remember→同 bot 同连接器下一轮直放', async () => {
  // 先订 $events 再 prompt（waterfall 不回放历史）；bot 路径=createWithConnectors
  //（plain session 审批策略 never 不出卡——T73b 施工实测）。
  const { connect } = await import('../../examples/lib/client.mjs')
  const feed = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const evStream = await feed.socket.open('$events', {})
  const evFrames: Array<{ type?: string; event?: string; eventId?: string; agentId?: string; clientId?: string }> = []
  void (async () => { for await (const f of evStream) evFrames.push(f as typeof evFrames[number]) })().catch(() => {})
  const readyDeadline = Date.now() + 5_000
  while (!evFrames.some((f) => f.type === 'ready') && Date.now() < readyDeadline) await new Promise((r) => setTimeout(r, 50))

  const mem = await rt.client.call('pluginManager/installBundle', { spec: MEM_SPEC, options: { enabled: true } })
  expect((mem as { application?: string }).application, 'memory 预装（enabled:true）').toBe('applied')
  const sid = (await rt.client.call('p2temp/session.createWithConnectors', { request: { connectors: [WRAPPER], agentPreset: 'standard', cwd: join(rt.home, 'workspace') } }) as { sessionId: string }).sessionId
  writeFileSync(join(rt.home, 'fake', 'scripts', `${sid}.json`), JSON.stringify({ calls: [
    toolCall(TOOL, { entities: [{ name: 't73b-link', entityType: 'test', observations: [] }] }),
    textCall('done'),
  ] }))
  const stream = await rt.client.follow(sid, { assistantStream: true })
  const frames: unknown[] = []
  void (async () => { for await (const f of stream) frames.push(f) })()
  await rt.client.call('session/prompt', { request: { requestId: `t73b-c-${Math.random().toString(16).slice(2, 8)}`, sessionId: sid, mode: 'queue', content: [{ type: 'text', text: 'go' }] } })

  const deadline = Date.now() + 90_000
  let answered = false
  for (;;) {
    const req = evFrames.find((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sid)
    if (req?.eventId !== undefined) {
      // 活卡期（卡挂屏、未作答）——remember 合法，唯一授权通路（T73c 的 UI 也在此时发）
      const remembered = await rt.client.call('p2sdk/connector_grants_remember', { request: { botId: sid, serverName: SERVER } })
      expect((remembered as { ok?: boolean }).ok, '活卡期 remember 合法').toBe(true)
      expect(existsSync(grantsFile()), '授权文件由 SDK 写出').toBe(true)
      expect(readFileSync(grantsFile(), 'utf8')).toContain(SERVER)
      const clientId = evFrames.find((f) => f.type === 'ready')?.clientId ?? ''
      await feed.call('$events/result', { clientId, eventId: req.eventId, outcome: { kind: 'result', value: 'allowed-once' } })
      answered = true
      break
    }
    if (Date.now() >= deadline) throw new Error('approval/request 未到——出卡没发生？')
    await new Promise((r) => setTimeout(r, 100))
  }
  expect(answered).toBe(true)
  for (;;) {
    if (frames.some((f) => (f as { event?: { type?: string } }).event?.type === 'turn/end')) break
    if (Date.now() >= deadline) throw new Error('turn1 答卡后 turn/end 未到')
    await new Promise((r) => setTimeout(r, 50))
  }
  stream.cancel()
  expect(JSON.stringify(frames), '工具真实到达').toContain('create_entities')

  // 三审中①：答完（allowed-once 放行=next 回调消费待答）后的卡不再是活卡——同键再
  // remember 必须 refused（judge 放行不受影响——授权已落盘）
  let refusedAfter = false
  try {
    await rt.client.call('p2sdk/connector_grants_remember', { request: { botId: sid, serverName: SERVER } })
  } catch { refusedAfter = true }
  expect(refusedAfter, '答完的卡不能再 remember').toBe(true)

  // 同 bot 同连接器下一轮：standing grant 直放——无新审批事件、turn 正常走完
  // fake 游标按 session 计且每 LLM 调用递增：第一轮（tool-call + 收尾 text）耗 2 →
  // 第二轮游标=2，脚本第 2 项才是本轮工具调用
  writeFileSync(join(rt.home, 'fake', 'scripts', `${sid}.json`), JSON.stringify({ calls: [
    textCall('skip0'),
    textCall('skip1'),
    toolCall(TOOL, { entities: [{ name: 't73b-link2', entityType: 'test', observations: [] }] }),
    textCall('done'),
  ] }))
  const stream2 = await rt.client.follow(sid, { assistantStream: true })
  const frames2: unknown[] = []
  void (async () => { for await (const f of stream2) frames2.push(f) })()
  await rt.client.call('session/prompt', { request: { requestId: `t73b-r2-${Math.random().toString(16).slice(2, 8)}`, sessionId: sid, mode: 'queue', content: [{ type: 'text', text: 'again' }] } })
  for (;;) {
    if (frames2.some((f) => (f as { event?: { type?: string } }).event?.type === 'turn/end')) break
    if (Date.now() >= deadline) {
      const kinds: Record<string, number> = {}
      for (const f of frames2) { const k = `${(f as { type?: string }).type}:${(f as { event?: { type?: string } }).event?.type ?? ''}`; kinds[k] = (kinds[k] ?? 0) + 1 }
      throw new Error(`直放轮 turn/end 未到。帧型=${JSON.stringify(kinds)}`)
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  stream2.cancel(); feed.close()
  const incremental = JSON.stringify(frames2.filter((f) => (f as { type?: string }).type !== 'snapshot')) // snapshot 含 turn1 审批历史
  expect(incremental, '第二轮 mcp 工具调用发生（t73b-link2）').toContain('t73b-link2')
  expect(incremental, '工具执行成功（tool/call 帧出现，无拒绝）').toContain('tool/call')
  expect(incremental, 'standing grant 直放——无新审批事件').not.toContain('approval')
}, 240_000)


/** ⑤⑥ 共用：出卡→指定结局→断言结局后 remember refused（不经 remember 自清——测消费接线）。 */
const outcomeTurn = async (outcome: 'allowed-once' | 'rejected'): Promise<void> => {
  const { connect } = await import('../../examples/lib/client.mjs')
  const feed = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const evStream = await feed.socket.open('$events', {})
  const evFrames: Array<{ type?: string; event?: string; eventId?: string; agentId?: string; clientId?: string }> = []
  void (async () => { for await (const f of evStream) evFrames.push(f as typeof evFrames[number]) })().catch(() => {})
  const readyDl = Date.now() + 5_000
  while (!evFrames.some((f) => f.type === 'ready') && Date.now() < readyDl) await new Promise((r) => setTimeout(r, 50))

  const sid = (await rt.client.call('p2temp/session.createWithConnectors', { request: { connectors: [WRAPPER], agentPreset: 'standard', cwd: join(rt.home, 'workspace') } }) as { sessionId: string }).sessionId
  writeFileSync(join(rt.home, 'fake', 'scripts', `${sid}.json`), JSON.stringify({ calls: [
    toolCall(TOOL, { entities: [{ name: `t73b-${outcome}`, entityType: 'test', observations: [] }] }),
    textCall('done'),
  ] }))
  const stream = await rt.client.follow(sid, { assistantStream: true })
  const frames: unknown[] = []
  void (async () => { for await (const f of stream) frames.push(f) })()
  await rt.client.call('session/prompt', { request: { requestId: `t73b-o-${outcome}-${Math.random().toString(16).slice(2, 8)}`, sessionId: sid, mode: 'queue', content: [{ type: 'text', text: 'go' }] } })
  const deadline = Date.now() + 90_000
  for (;;) {
    const req = evFrames.find((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sid)
    if (req?.eventId !== undefined) {
      // 不调 remember——直接给结局（T73b2：结局本身要消费待答）
      const clientId = evFrames.find((f) => f.type === 'ready')?.clientId ?? ''
      await feed.call('$events/result', { clientId, eventId: req.eventId, outcome: { kind: 'result', value: outcome } })
      break
    }
    if (Date.now() >= deadline) throw new Error(`${outcome}: approval/request 未到`)
    await new Promise((r) => setTimeout(r, 100))
  }
  for (;;) {
    if (frames.some((f) => (f as { event?: { type?: string } }).event?.type === 'turn/end')) break
    if (Date.now() >= deadline) throw new Error(`${outcome}: 结局后 turn/end 未到`)
    await new Promise((r) => setTimeout(r, 50))
  }
  stream.cancel(); feed.close()
  // 结局后（活卡已消失）——remember 必须 refused
  let refused = false
  try {
    await rt.client.call('p2sdk/connector_grants_remember', { request: { botId: sid, serverName: SERVER } })
  } catch { refused = true }
  expect(refused, `${outcome} 结局后 remember 必须被拒（T73b2）`).toBe(true)
  expect(existsSync(grantsFile()) === false || !readFileSync(grantsFile(), 'utf8').includes(sid), '该 bot 未获授权').toBe(true)
}

it('⑤ T73b2：批准（allowed-once）但不 remember——结局后 remember 拒', async () => { await outcomeTurn('allowed-once') }, 240_000)

it('⑥ T73b2：拒绝（rejected）——结局后 remember 拒', async () => { await outcomeTurn('rejected') }, 240_000)
