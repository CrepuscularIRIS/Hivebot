// T7c（Q-028=B）：write/edit 进 bot 自己的 skill 目录必出确认卡。
// ①-⑧ 照工单；模板=write-outside.test.ts。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { connect } from '../../examples/lib/client.mjs'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '../support/fake/harness.ts'
import { trackTmpDir } from '../support/tmp-sweep.ts'

const PKG_ROOT = join(import.meta.dirname, '../..')
const TEST_ROOT = mkdtempSync(join(tmpdir(), 'bot-T7c-run-'))
trackTmpDir(TEST_ROOT)
const TEST_HOME = join(TEST_ROOT, 'home')
mkdirSync(TEST_HOME, { recursive: true })
const DATA_DIR = join(TEST_HOME, 'pbots-data')
const WS = join(DATA_DIR, 'workspaces', 'x')

interface Feed { frames: Frame[]; answer(frame: Frame, value: 'rejected' | 'allowed-once'): Promise<unknown>; close(): void }
interface Rt extends Runtime { feed: Feed; writeScriptCalls(id: string, calls: object[]): void }

let rt: Rt

function fakeOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bot-T7c-patch-'))
  trackTmpDir(dir)
  writeFileSync(join(dir, 'fake-llm.yml'), `\
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
                inputModalities: [text, image]
`)
  return join(dir, 'fake-llm.yml')
}

beforeAll(async () => {
  clearRealKeys()
  mkdirSync(WS, { recursive: true })
  rt = await launchRuntime({ env: { HOME: TEST_HOME, P2SDK_HOME: mkdtempSync(join(TEST_ROOT, 'dsh-')), P2SDK_PATCH: fakeOverlay(), PBOTS_DATA_DIR: DATA_DIR } }) as Rt
  const client = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const stream = await client.socket.open('$events', {})
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f as Frame) })().catch(() => {})
  await waitFor(frames, (f) => f.type === 'ready', 5000, '$events ready')
  const clientId = frames.find((f) => f.type === 'ready')?.clientId ?? ''
  rt.feed = { frames, answer: (frame, value) => client.call('$events/result', { clientId, eventId: frame.eventId, outcome: { kind: 'result', value } }), close() { stream.cancel(); void drained; client.close() } }
  rt.writeScriptCalls = (id, calls) => {
    const dir = join(rt.home, 'fake', 'scripts')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ calls }))
  }
}, 240_000)

afterAll?.(async () => { try { rt.feed?.close() } catch {} try { await rt?.stop() } catch {} })

function toolCall(name: string, args: object): object {
  const id = `t7c-${Math.random().toString(16).slice(2, 8)}`
  const a = JSON.stringify(args)
  return { chunks: [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: a.slice(0, 5) },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: a.slice(5) },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: a } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ] }
}
function textCall(t: string): object {
  return { chunks: [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: t },
    { type: 'block-end', index: 0, block: { type: 'text', text: t } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 1 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ] }
}

async function drive(calls: object[], answer: 'allowed-once' | 'rejected' | 'none' = 'none'): Promise<{ sessionId: string; results: Array<{ isError: boolean; text: string }>; asked: number }> {
  const { sessionId } = (await rt.client.call('session/create', { request: { cwd: WS } })) as { sessionId: string }
  rt.writeScriptCalls(sessionId, calls.flatMap((c) => [c, textCall('T7c 完成')]))
  const stream = await rt.client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  await rt.client.call('session/prompt', { request: { requestId: `t7c-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'T7c' }] } })
  const deadline = Date.now() + 60_000
  const answered = new Set<string>()
  for (;;) {
    if (answer !== 'none') {
      for (const f of rt.feed.frames) {
        if (f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId && !answered.has(f.eventId ?? '')) {
          answered.add(f.eventId ?? '')
          await rt.feed.answer(f, answer)
        }
      }
    }
    if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
    if (Date.now() > deadline) throw new Error(`turn/end 未到；answered=${answered.size}；尾部：${JSON.stringify(frames.slice(-4)).slice(0, 300)}`)
    await new Promise((r) => setTimeout(r, 50))
  }
  stream.cancel(); void drained
  const results: Array<{ isError: boolean; text: string }> = []
  for (const f of frames) {
    if (f.type !== 'event' || f.event?.type !== 'tool/result') continue
    const d = f.event.data as { message?: { isError?: boolean; content?: Array<{ text?: string }> } }
    results.push({ isError: d.message?.isError === true, text: (d.message?.content ?? []).map((c) => c.text ?? '').join('\n') })
  }
  const asked = rt.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId).length
  return { sessionId, results, asked }
}

describe('T7c skill 写入审阅卡', () => {
  it('① write .dsh/skills → 1卡 allowed-once → 文件存在 isError=false', { timeout: 240_000 }, async () => {
    const { results, asked } = await drive([toolCall('write', { file_path: join(WS, '.dsh/skills/t7c-a/SKILL.md'), content: '---\nname: t7c-a\ndescription: d\n---\nbody\n' })], 'allowed-once')
    expect(asked).toBe(1)
    expect(results[0]!.isError).toBe(false)
    expect(existsSync(join(WS, '.dsh/skills/t7c-a/SKILL.md'))).toBe(true)
  })
  it('② write .dsh/skills → 1卡 rejected → 文件不存在 isError=true', { timeout: 240_000 }, async () => {
    const { results, asked } = await drive([toolCall('write', { file_path: join(WS, '.dsh/skills/t7c-r/SKILL.md'), content: 'x' })], 'rejected')
    expect(asked).toBe(1)
    expect(results[0]!.isError).toBe(true)
    expect(existsSync(join(WS, '.dsh/skills/t7c-r/SKILL.md'))).toBe(false)
  })
  it('③ edit 已存在 skill → 1卡 拒 → 字节不变', { timeout: 240_000 }, async () => {
    mkdirSync(join(WS, '.dsh/skills/t7c-b'), { recursive: true })
    const original = '---\nname: t7c-b\ndescription: d\n---\noriginal\n'
    writeFileSync(join(WS, '.dsh/skills/t7c-b/SKILL.md'), original)
    const { results, asked } = await drive([toolCall('edit', { file_path: join(WS, '.dsh/skills/t7c-b/SKILL.md'), old_string: 'original', new_string: 'changed' })], 'rejected')
    expect(asked).toBe(1)
    expect(results[0]!.isError).toBe(true)
    expect(readFileSync(join(WS, '.dsh/skills/t7c-b/SKILL.md'), 'utf8')).toBe(original)
  })
  it('④ .agents/skills 同 ① → 1卡', { timeout: 240_000 }, async () => {
    const { asked } = await drive([toolCall('write', { file_path: join(WS, '.agents/skills/t7c-c/SKILL.md'), content: 'x' })], 'allowed-once')
    expect(asked).toBe(1)
  })
  it('⑤ 符号链接绕法 → 仍 1卡', { timeout: 240_000 }, async () => {
    mkdirSync(join(WS, '.dsh/skills'), { recursive: true })
    try { symlinkSync('.dsh/skills', join(WS, 'lnk')) } catch { /* 已存在 */ }
    const { asked } = await drive([toolCall('write', { file_path: join(WS, 'lnk/t7c-d/SKILL.md'), content: 'x' })], 'allowed-once')
    expect(asked).toBe(1)
  })
  it('⑥ 对照：工作区内非 skill 根 → 0卡', { timeout: 240_000 }, async () => {
    const { asked } = await drive([toolCall('write', { file_path: join(WS, 'notes/t7c.md'), content: 'x' })])
    expect(asked).toBe(0)
  })
  it('⑦ never 子代理写 skill → deny 0卡 文件不存在', { timeout: 420_000 }, async () => {
    // T7cc：照 write-outside.test.ts:479 真造 ptc worker（不再占位）
    const { copyFileSync } = await import('node:fs')
    const store = join(PKG_ROOT, 'node_modules', '.pnpm')
    const ptcHit = readdirSync(store).find((n) => n.startsWith('@deepseek-ai+dsh-ptc-runtime-node@'))
    if (!ptcHit) throw new Error('dsh-ptc-runtime-node not found')
    const ptcSrc = join(store, ptcHit, 'node_modules', '@deepseek-ai', 'dsh-ptc-runtime-node', 'lib', 'process.js')
    const bootstrap = join(WS, '.t7cc-ptc-boot.mjs')
    copyFileSync(ptcSrc, bootstrap)
    // 独立 overlay 覆盖 ptc-runtime 的 bootstrap（子代理 approvalPolicy=never）
    const subDir = mkdtempSync(join(tmpdir(), 'bot-T7cc-sub-')); trackTmpDir(subDir)
    const subOverlay = join(subDir, 'sub.yml')
    writeFileSync(subOverlay, `\
- id: ptc-runtime
  config:
    launch:
      kind: node-script
      executable: /usr/bin/node
      bootstrapPath: ${bootstrap}
`)
    // 独立 runtime（新数据目录——旧目录门已开过测不出）
    const rt2 = await launchRuntime({ env: {
      HOME: TEST_HOME, TMPDIR: join(TEST_ROOT, 't7cc-tmp'),
      DBUS_SESSION_BUS_ADDRESS: 'unix:path=' + join(TEST_ROOT, 'no-dbus'),
      P2SDK_HOME: mkdtempSync(join(TEST_ROOT, 'dsh7-')),
      P2SDK_PATCH: `${fakeOverlay()}:${subOverlay}`,
      PBOTS_DATA_DIR: join(TEST_HOME, 't7cc-data'),
    } })
    // T7cc 前置：rt2 也挂 feed——否则子会话出了卡也测不到
    const feed2Client = await connect({ baseUrl: rt2.baseUrl, token: rt2.token, interactions: 'answer' })
    const feed2Stream = await feed2Client.socket.open('$events', {})
    const feed2Frames: Frame[] = []
    const feed2Drained = (async () => { for await (const f of feed2Stream) feed2Frames.push(f as Frame) })().catch(() => {})
    await waitFor(feed2Frames, (f) => f.type === 'ready', 5000, 'rt2 $events ready')
    try {
      const ws7 = join(TEST_HOME, 't7cc-data', 'workspaces', 'w7')
      mkdirSync(ws7, { recursive: true })
      // root 脚本：委派子代理
      const { sessionId: root } = (await rt2.client.call('session/create', { request: { cwd: ws7 } })) as { sessionId: string }
      const dir7 = join(rt2.home, 'fake', 'scripts'); mkdirSync(dir7, { recursive: true })
      writeFileSync(join(dir7, `${root}.json`), JSON.stringify({ calls: [
        toolCall('subagent', { description: 'T7cc skill write probe', prompt: 'run the T7cc child skill write probe' }),
        textCall('已委派'),
      ] }))
      // 子会话脚本（default.json）：写 skill + 收尾
      writeFileSync(join(dir7, 'default.json'), JSON.stringify({ calls: [
        toolCall('write', { file_path: join(ws7, '.dsh/skills/t7c-g/SKILL.md'), content: 'x' }),
        textCall('子会话完成'),
      ] }))
      await rt2.client.call('session/prompt', { request: { requestId: `t7cc-${Date.now()}`, sessionId: root, mode: 'queue', content: [{ type: 'text', text: 'T7cc 委派' }] } })
      // 等子会话完成（新 sessionId 出现+≥2 轮请求）
      const deadline = Date.now() + 180_000
      let child = ''
      for (;;) {
        let raw = ''
        try { raw = readFileSync(join(rt2.home, 'fake', 'requests.jsonl'), 'utf8') } catch { /* */ }
        const reqs = raw.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { sessionId: string | null; toolResults: Array<{ isError: boolean; text: string }> })
        const hit = reqs.find((r) => r.sessionId !== null && r.sessionId !== root)
        if (hit) { child = hit.sessionId as string; break }
        if (Date.now() > deadline) throw new Error('180s 内没观察到子会话')
        await new Promise((r) => setTimeout(r, 100))
      }
      // 等子会话完成 2 轮
      for (;;) {
        let raw = ''
        try { raw = readFileSync(join(rt2.home, 'fake', 'requests.jsonl'), 'utf8') } catch { /* */ }
        const childReqs = raw.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { sessionId: string | null }).filter((r) => r.sessionId === child)
        if (childReqs.length >= 2) break
        if (Date.now() > deadline + 120_000) throw new Error(`子会话只完成 ${childReqs.length}/2`)
        await new Promise((r) => setTimeout(r, 100))
      }
      // 子会话的 write 结果应为 deny（never 子代理无卡直接拒）
      let raw = ''
      try { raw = readFileSync(join(rt2.home, 'fake', 'requests.jsonl'), 'utf8') } catch { /* */ }
      const childResults = raw.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { sessionId: string | null; toolResults: Array<{ isError: boolean; text: string }> })
        .filter((r) => r.sessionId === child).flatMap((r) => r.toolResults ?? [])
      expect(childResults.length, '子会话有 tool result').toBe(1)
      expect(childResults[0]!.isError, 'never 子代理写 skill 被拒').toBe(true)
      // T7cc 前置：拒绝原因是 never 策略（不是「没人接卡」）
      expect(childResults[0]!.text).toContain('approval unavailable in this session')
      // T7cc 前置：子会话 0 卡（never 路径无卡直接拒）
      const childAsked = feed2Frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === child).length
      expect(childAsked, '子会话 0 卡').toBe(0)
      expect(existsSync(join(ws7, '.dsh/skills/t7c-g/SKILL.md')), '文件不存在').toBe(false)
    } finally {
      try { feed2Stream.cancel(); void feed2Drained; feed2Client.close() } catch { /* */ }
      try { await rt2.stop() } catch { /* */ }
    }
  })

  it('⑧ 自主门开（policy-state provision）→ 写 skill 仍出卡', { timeout: 240_000 }, async () => {
    // 照 tiers-policy.test.ts:128 provision() 写 policy-state
    const { createHash } = await import('node:crypto')
    const token = readFileSync(join(rt.handoff, 'launch-token'), 'utf8').trim()
    
    // 简化：直接在当前测试环境写 policy-state 后测
    // （provision 的完整造法需要 DATA_DIR 一致性——T7cb 里先确认 TEST_HOME/pbost-data 可写）
    const stateDir = join(TEST_HOME, 'pbots-data')
    try { mkdirSync(stateDir, { recursive: true }) } catch { /* 已存在 */ }
    const token2 = readFileSync(join(rt.handoff, 'launch-token'), 'utf8').trim()
    const inst = createHash('sha256').update(token2).digest('hex')
    writeFileSync(join(stateDir, 'policy-state.json'), JSON.stringify({ version: 1, paused: false, instance: inst }))
    // 门开态下先写非 skill 文件验证门真开
    const g = await drive([toolCall('write', { file_path: join(WS, 'notes/t7c-h.md'), content: 'gate-open' })])
    expect(g.results[0]!.isError, `门开态写非skill应成功: ${g.results[0]?.text.slice(0,100)}`).toBe(false)
    // 写 skill 仍出卡
    const { asked } = await drive([toolCall('write', { file_path: join(WS, '.dsh/skills/t7c-h/SKILL.md'), content: 'x' })], 'allowed-once')
    expect(asked, '门开态写 skill 仍出卡').toBe(1)
  })

  it('⑨ 符号链接工作区+skill根不存在 → 仍出卡', { timeout: 240_000 }, async () => {
    // T7cb：独立工作区经符号链接、skill 根尚不存在
    const WS2 = join(DATA_DIR, 'workspaces', 'y')
    mkdirSync(WS2, { recursive: true })
    const link = join(TEST_ROOT, 'ws2-link')
    try { symlinkSync(WS2, link) } catch { /* 已存在 */ }
    const { sessionId } = (await rt.client.call('session/create', { request: { cwd: link } })) as { sessionId: string }
    rt.writeScriptCalls(sessionId, [
      toolCall('write', { file_path: join(link, '.dsh/skills/t7c-i/SKILL.md'), content: 'x' }),
      textCall('T7c ⑨'),
    ])
    const stream = await rt.client.follow(sessionId)
    const frames: Frame[] = []
    const drained = (async () => { for await (const f of stream) frames.push(f) })()
    await rt.client.call('session/prompt', { request: { requestId: `t7c-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'T7c ⑨' }] } })
    const deadline = Date.now() + 60_000
    const answered = new Set<string>()
    for (;;) {
      for (const f of rt.feed.frames) {
        if (f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId && !answered.has(f.eventId ?? '')) {
          answered.add(f.eventId ?? '')
          await rt.feed.answer(f, 'allowed-once')
        }
      }
      if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
      if (Date.now() > deadline) throw new Error('turn/end 未到')
      await new Promise((r) => setTimeout(r, 50))
    }
    stream.cancel(); void drained
    const asked = rt.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId).length
    expect(asked, '符号链接工作区+skill根不存在仍出卡').toBe(1)
  })
})
import { afterAll } from 'vitest'
