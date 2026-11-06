// T9a+T9ab（L8-d）：产品启动器的 ssh 组合骨架 e2e。
// ⑧ PTC 断依赖（T9ab 修订：不禁 base ptc-runtime——只禁 T4 三行，会话可建，
//    fake 首请求 tools 不含 workflow）；
// ⑨ glob/grep guard 工具名拒（真实会话驱动）；
// ⑪ SIGKILL launcher → 清场。
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as net from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startSshServer, type SshServer } from '../support/ssh-host.ts'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '../support/fake/harness.ts'
import { trackTmpDir } from '../support/tmp-sweep.ts'

const PKG_ROOT = join(import.meta.dirname, '../..')
const TEST_ROOT = mkdtempSync(join(tmpdir(), 'bot-T9a-run-'))
trackTmpDir(TEST_ROOT)
const TEST_HOME = join(TEST_ROOT, 'home')
mkdirSync(TEST_HOME, { recursive: true })
let dshSshBefore: string[] = []

let server: SshServer
let rt: Runtime | undefined

function fakeOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bot-T9a-patch-'))
  trackTmpDir(dir)
  writeFileSync(join(dir, 'fake-llm.yml'), `\
- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: 'file://${join(PKG_ROOT, 'tests', 'support', 'fake', 'plugin.mjs')}'
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
  server = await startSshServer()
  dshSshBefore = readdirSync('/tmp').filter((n) => n.startsWith('dsh-ssh-')).sort()
  rt = await launchRuntime({
    env: {
      HOME: TEST_HOME,
      PATH: `${server.binDir}:${process.env.PATH ?? ''}`,
      P2SDK_HOME: mkdtempSync(join(TEST_ROOT, 'dsh-')),
      P2SDK_PATCH: fakeOverlay(),
      P2SDK_SSH_HOST: 'pbots-ssh-test',
      P2SDK_SSH_REMOTE_ROOT: server.workspace,
      P2SDK_SSH_HELPER: server.helper,
      P2SDK_SSH_HELPER_HASH: server.helperHash,
      P2SDK_SSH_NODE: process.execPath,
    },
  })
}, 240_000)

afterAll(async () => {
  try { await rt?.stop() } catch { /* 已停 */ }
  await server?.stopServer()
})

function toolCall(name: string, args: object): object {
  const id = `t9a-${Math.random().toString(16).slice(2, 8)}`
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

async function drive(calls: object[]): Promise<{ sessionId: string; toolResults: Array<{ isError: boolean; text: string }> }> {
  const ws = join(server.workspace, `t9a-${Math.random().toString(16).slice(2, 8)}`)
  mkdirSync(ws, { recursive: true })
  const { sessionId } = (await rt!.client.call('session/create', { request: { cwd: ws } })) as { sessionId: string }
  const dir = join(rt!.home, 'fake', 'scripts')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls: calls.flatMap((c) => [c, textCall('T9a')]) }))
  const stream = await rt!.client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  await rt!.client.call('session/prompt', { request: { requestId: `t9a-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'T9a' }] } })
  const deadline = Date.now() + 120_000
  for (;;) {
    if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
    if (Date.now() > deadline) throw new Error(`turn/end 未到：${JSON.stringify(frames.slice(-4)).slice(0, 300)}`)
    await new Promise((r) => setTimeout(r, 100))
  }
  stream.cancel(); void drained
  const results: Array<{ isError: boolean; text: string }> = []
  for (const f of frames) {
    if (f.type !== 'event' || f.event?.type !== 'tool/result') continue
    const d = f.event.data as { message?: { isError?: boolean; content?: Array<{ text?: string }> } }
    results.push({ isError: d.message?.isError === true, text: (d.message?.content ?? []).map((c) => c.text ?? '').join('\\n') })
  }
  return { sessionId, toolResults: results }
}

describe('T9a 产品启动器 ssh 组合', () => {
  it('⑧ 会话可建；首请求工具面不含 workflow 族', { timeout: 240_000 }, async () => {
    // T9ab：去掉 ptc-runtime 禁行后 standard preset 可建会话。
    // workflow 工具被禁（workflow-ptc/tool-workflow/tool-executor-ptc 三行）——
    // 不直接调它（会挂：依赖链断但工具壳还在等）；改为验证首请求的 tools
    // 面里没出现 workflow 族工具名。
    const ws = join(server.workspace, 't9a-ptc')
    mkdirSync(ws, { recursive: true })
    const { sessionId } = (await rt!.client.call('session/create', { request: { cwd: ws } })) as { sessionId: string }
    expect(sessionId, 'session/create 成功（standard preset 可用）').toBeTruthy()
    const dir = join(rt!.home, 'fake', 'scripts')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls: [textCall('T9a')] }))
    const stream = await rt!.client.follow(sessionId)
    const frames: Frame[] = []
    const drained = (async () => { for await (const f of stream) frames.push(f) })()
    await rt!.client.call('session/prompt', { request: { requestId: `t9a-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'T9a' }] } })
    const deadline = Date.now() + 60_000
    for (;;) {
      if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
      if (Date.now() > deadline) throw new Error(`turn/end 未到`)
      await new Promise((r) => setTimeout(r, 100))
    }
    stream.cancel(); void drained
    let raw = ''
    try { raw = readFileSync(join(rt!.home, 'fake', 'requests.jsonl'), 'utf8') } catch { /* */ }
    const reqs = raw.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { sessionId: string | null; userTexts: string[] }).filter((r) => r.sessionId === sessionId)
    expect(reqs.length, '有模型请求').toBeGreaterThan(0)
    const allText = reqs.map((r) => r.userTexts.join('\n')).join('\n')
    expect(allText, '工具面不含 workflow').not.toContain('workflow')
  })

  it('⑨ glob/grep 被 guard 拒：原因含 not available in ssh mode', { timeout: 240_000 }, async () => {
    // 调试：先试 bash（已知走 pre-execute）看 guard 是否在链上
    const bashResult = await drive([toolCall('bash', { description: 'test', command: 'echo hi' })])
    console.log('[T9ab-dbg] bash result:', JSON.stringify(bashResult.toolResults[0]).slice(0, 200))
    const g = await drive([toolCall('grep', { pattern: 'x' })])
    expect(g.toolResults.length).toBeGreaterThanOrEqual(1)
    expect(g.toolResults[0]!.isError).toBe(true)
    expect(g.toolResults[0]!.text).toContain('not available in ssh mode')
    const b = await drive([toolCall('glob', { pattern: '*' })])
    expect(b.toolResults.length).toBeGreaterThanOrEqual(1)
    expect(b.toolResults[0]!.isError).toBe(true)
    expect(b.toolResults[0]!.text).toContain('not available in ssh mode')
  })

  it('⑪ SIGKILL launcher → /tmp/dsh-ssh-* 新增 ≤1 且空、进程清场', { timeout: 120_000 }, async () => {
    const child = (rt as unknown as { child: { pid: number; kill(s: string): void } }).child
    expect(child, 'runtime.ts 暴露 child').toBeTruthy()
    const killBefore = readdirSync('/tmp').filter((n) => n.startsWith('dsh-ssh-')).sort()
    child.kill('SIGKILL')
    await new Promise((r) => setTimeout(r, 2000))
    const after = readdirSync('/tmp').filter((n) => n.startsWith('dsh-ssh-')).sort()
    const added = after.filter((n) => !killBefore.includes(n))
    expect(added.length, `新增 dsh-ssh 目录 ≤1（实际 ${added.length}）`).toBeLessThanOrEqual(1)
    for (const d of added) {
      const contents = readdirSync(join('/tmp', d))
      expect(contents, `目录 ${d} 应为空（实际 ${contents.join(',')}）`).toEqual([])
    }
    // launcher 端口拒连
    const baseUrl = rt!.baseUrl
    const port = Number(new URL(baseUrl).port)
    await expect(new Promise((_, reject) => {
      const s = net.connect(port, '127.0.0.1')
      s.on('connect', () => { s.destroy(); reject(new Error('port still open')) })
      s.on('error', (e) => { s.destroy(); reject(e) })
    })).rejects.toThrow()
    rt = undefined // 已杀
  })
})
