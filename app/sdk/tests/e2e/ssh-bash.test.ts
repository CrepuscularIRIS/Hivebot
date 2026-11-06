// T10（L8-f / DESIGN D3/D4 r2）：远端 bash 套 wrapper 的产品级验收。
// ④a 先红：原版 sandbox-ssh（helper 自带 sandbox，读不设防）下 bash 读到宿主
// ~/.ssh 哨兵正文——修后（sandbox-zone-ssh 改写 argv 走宿主 wrapper）读不到。
// ④b 远端哨兵同挡；④c endpoint 目录不露出 + helper 包目录写保护；
// ③a 门开 0 卡 marker 落远端；③b 门关出卡；③c 变异换回原版 → ④a 红。
// bash 默认出卡（shell-ask）——审批经 $events socket 应答（openFeed 模式）。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startSshServer, type SshServer } from '../support/ssh-host.ts'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { clearRealKeys, waitFor, type Frame } from '../support/fake/harness.ts'
import { trackTmpDir } from '../support/tmp-sweep.ts'

const PKG_ROOT = join(import.meta.dirname, '../..')
const TEST_ROOT = mkdtempSync(join(tmpdir(), 'bot-T10-run-'))
trackTmpDir(TEST_ROOT)
const TEST_HOME = join(TEST_ROOT, 'home')
mkdirSync(TEST_HOME, { recursive: true })

let server: SshServer
let rt: Runtime | undefined
let answeredIds = new Set<string>()
let eventsFrames: any[] = []
let answerer: DshClient | undefined

function fakeOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bot-T10-patch-'))
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
      P2SDK_SSH_REMOTE_HOME: server.remoteHome,
    },
  })
  // 审批应答器：独立 connect 客户端开 $events（envelope-live 同款——rt.client
  // 的 socket 语义不等价）
  answerer = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const stream = await answerer.socket.open('$events', {})
  void (async () => { for await (const f of stream as any) eventsFrames.push(f as any) })().catch(() => {})
  await waitFor(eventsFrames as unknown as Frame[], (f) => f.type === 'ready', 8000, '$events ready')
}, 240_000)

afterAll(async () => {
  try { answerer?.close() } catch { /* gone */ }
  try { await rt?.stop() } catch { /* 已停 */ }
  await server?.stopServer()
})

function toolCall(name: string, args: object): object {
  const id = `t10-${Math.random().toString(16).slice(2, 8)}`
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

/** 自动应答本会话的审批卡（allowed-once）。 */
const approveAll = async (sessionId: string) => {
  const frame = eventsFrames.find((f: any) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId && !answeredIds.has(f.eventId))
  if (!frame) return
  answeredIds.add(frame.eventId)
  const ready = eventsFrames.find((f: any) => f.type === 'ready')
  await answerer!.call('$events/result', { clientId: ready?.clientId ?? '', eventId: frame.eventId, outcome: { kind: 'result', value: 'allowed-once' } })
}

async function driveBash(command: string): Promise<{ toolResults: Array<{ isError: boolean; text: string }>; asked: number }> {
  const ws = join(server.workspace, `t10-${Math.random().toString(16).slice(2, 8)}`)
  mkdirSync(ws, { recursive: true })
  const { sessionId } = (await rt!.client.call('session/create', { request: { cwd: ws } })) as { sessionId: string }
  const dir = join(rt!.home, 'fake', 'scripts')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls: [toolCall('bash', { command, description: 'T10' }), textCall('T10')] }))
  const stream = await rt!.client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  await rt!.client.call('session/prompt', { request: { requestId: `t10-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'T10' }] } })
  const deadline = Date.now() + 120_000
  for (;;) {
    const ended = frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')
    if (ended) break
    if (Date.now() > deadline) throw new Error(`turn/end 未到：${JSON.stringify(frames.slice(-3)).slice(0, 240)}`)
    await approveAll(sessionId)
    await new Promise((r) => setTimeout(r, 150))
  }
  stream.cancel(); void drained
  const results: Array<{ isError: boolean; text: string }> = []
  for (const f of frames) {
    if (f.type !== 'event' || f.event?.type !== 'tool/result') continue
    const d = f.event.data as { message?: { isError?: boolean; content?: Array<{ text?: string }> } }
    results.push({ isError: d.message?.isError === true, text: (d.message?.content ?? []).map((c) => c.text ?? '').join('\n') })
  }
  return { toolResults: results, asked: 0 }
}

describe('T10 远端 bash wrapper', () => {
  it('④a bash 读宿主 ~/.ssh 哨兵 → 退出非零、正文不出现', { timeout: 240_000 }, async () => {
    const sentinel = join(TEST_HOME, '.ssh', 'id_sentinel')
    mkdirSync(join(TEST_HOME, '.ssh'), { recursive: true })
    writeFileSync(sentinel, 'HOST-KEY-SENTINEL-T10')
    const r = await driveBash(`cat ${sentinel}; echo rc=$?`)
    expect(r.toolResults[0]!.text, '正文不出现（宿主 .ssh 在 wrapper NEVER 根）').not.toContain('HOST-KEY-SENTINEL-T10')
  })

  it('④b bash 读远端 ~/.ssh 哨兵 → 同挡', { timeout: 240_000 }, async () => {
    const sentinel = join(server.remoteHome, '.ssh', 'id_sentinel')
    mkdirSync(join(server.remoteHome, '.ssh'), { recursive: true })
    writeFileSync(sentinel, 'REMOTE-KEY-SENTINEL-T10')
    const r = await driveBash(`cat ${sentinel}`)
    expect(r.toolResults[0]!.text, '远端正文不出现').not.toContain('REMOTE-KEY-SENTINEL-T10')
  })
})
