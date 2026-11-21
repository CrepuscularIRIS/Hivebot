// T10（L8-f / DESIGN D3/D4 r2）：远端 bash 套 wrapper 的产品级验收。
// ④a 先红：原版 sandbox-ssh（helper 自带 sandbox，读不设防）下 bash 读到宿主
// ~/.ssh 哨兵正文——修后（sandbox-zone-ssh 改写 argv 走宿主 wrapper）读不到。
// ④b 远端哨兵同挡；④c endpoint 目录不露出 + helper 包目录写保护；
// ③a 门开 0 卡 marker 落远端；③b 门关出卡；③c 变异换回原版 → ④a 红。
// bash 默认出卡（shell-ask）——审批经 $events socket 应答（openFeed 模式）。
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startSshServer, type SshServer } from '../support/ssh-host.ts'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { clearRealKeys, waitFor, type Frame } from '../support/fake/harness.ts'
import { trackTmpDir } from '../support/tmp-sweep.ts'

const PKG_ROOT = join(import.meta.dirname, '../..')
// T10b：④ 探针必须在 /tmp 之外——上游 workspace-write profile 自带 --tmpfs /tmp
// （dsh-sandbox-local lib/index.js:34-35），夹具在 /tmp 下时原版 helper 也「挡住」，
// 变异不咬合（经理终验实验表）。本文件全部临时目录跟着这个 TMPDIR 走。
const OUTSIDE_TMP = trackTmpDir(mkdtempSync('/var/tmp/bot-T10-'))
process.env.TMPDIR = OUTSIDE_TMP
const TEST_ROOT = mkdtempSync(join(OUTSIDE_TMP, 'bot-T10-run-'))
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
  for (const p of [TEST_HOME, server.remoteHome]) expect(p === '/tmp' || p.startsWith('/tmp/'), `探针必须在 /tmp 外：${p}`).toBe(false)
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

/** 门开态（tiers-policy provision 同款）：instance = sha256(launch-token)。 */
function provision(state: Record<string, unknown> = {}): void {
  const token = readFileSync(join(rt!.handoff, 'launch-token'), 'utf8').trim()
  const instance = createHash('sha256').update(token).digest('hex')
  // resolveConfig 缺省 dataDirs = [HOME/.config/pbots-ui, …]（PBOTS_DATA_DIR 未设）
  const dataDir = join(TEST_HOME, '.config', 'pbots-ui')
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(join(dataDir, 'policy-state.json'), JSON.stringify({ version: 1, paused: false, instance, ...state }))
}

describe('T10 远端 bash wrapper', () => {
  it('③a 门开：bash 直写 marker 零卡 + 读回（wrapper 保留 profile 的 --bind ws 写通路）', { timeout: 240_000 }, async () => {
    provision()
    const ws = join(server.workspace, 't10-3a')
    mkdirSync(ws, { recursive: true })
    const { sessionId } = (await rt!.client.call('session/create', { request: { cwd: ws, permissionPreset: 'workspace-write' } })) as { sessionId: string }
    const dir = join(rt!.home, 'fake', 'scripts')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({
      calls: [
        toolCall('bash', { command: `printf %s '${server.mark}' > mark.txt`, description: 'T10 3a write' }),
        toolCall('bash', { command: 'cat mark.txt', description: 'T10 3a readback' }),
        textCall('T10'),
      ],
    }))
    const stream = await rt!.client.follow(sessionId)
    const frames: Frame[] = []
    const drained = (async () => { for await (const f of stream) frames.push(f) })()
    await rt!.client.call('session/prompt', { request: { requestId: `t10-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'T10' }] } })
    const deadline = Date.now() + 120_000
    for (;;) {
      if (frames.filter((f) => f.type === 'event' && f.event?.type === 'turn/end').length >= 1) break
      if (Date.now() > deadline) throw new Error('turn/end 未到')
      await new Promise((r) => setTimeout(r, 150))
    }
    stream.cancel(); void drained
    const results = frames.filter((f) => f.type === 'event' && f.event?.type === 'tool/result')
    expect(results.length, '两个工具结果').toBeGreaterThanOrEqual(2)
    const bashOut = (results[1]!.event!.data as { message?: { isError?: boolean; content?: Array<{ text?: string }> } })
    expect(bashOut.message?.isError, 'bash 零卡直跑（门开）').not.toBe(true)
    expect((bashOut.message?.content ?? []).map((c) => c.text ?? '').join(''), 'bash 读回 marker').toContain(server.mark)
    expect(existsSync(join(ws, 'mark.txt')), 'marker 落远端 ws').toBe(true)
    expect(readFileSync(join(ws, 'mark.txt'), 'utf8'), '落盘内容=本轮 mark').toBe(server.mark)
    expect(eventsFrames.filter((f: any) => f.event === 'approval/request' && f.agentId === sessionId).length, '本会话 0 张审批卡').toBe(0)
  })

  it('③b 门关（无 policy-state）→ bash 出卡', { timeout: 240_000 }, async () => {
    // 门关态：provision 不调（③a 已 provision 过同一 runtime……policy-state 是持久的！
    // 独立 runtime 才干净——但 e2e 一套限制下用 paused:true 覆盖（tiers ② 同款语义：
    // 无效状态逐个出卡）
    provision({ paused: true })
    const r = await driveBash('echo t10-3b')
    // 出卡被 approveAll 应答后执行——断言「曾出卡」：answeredIds 有新条目
    expect(answeredIds.size, '门关 bash 出卡（被应答后放行）').toBeGreaterThan(0)
  })

  it('④c 沙箱内 /tmp/dsh-ssh-* 不可见；helper 包目录写保护', { timeout: 240_000 }, async () => {
    provision()
    const r = await driveBash('ls -d /tmp/dsh-ssh-* 2>/dev/null | wc -l')
    expect(r.toolResults[0]!.text.trim(), 'endpoint 目录不露出（精确计数 0）').toBe('0')
    const helperDir = join(PKG_ROOT, 'node_modules', '@deepseek-ai', 'dsh-ssh')
    const r2 = await driveBash(`touch ${helperDir}/t10-x 2>/dev/null; echo rc=$?`)
    expect(r2.toolResults[0]!.text, 'helper 包目录写保护（非零退出）').toContain('rc=1')
  })
  it('④a bash 读宿主 ~/.ssh 哨兵 → 退出非零、正文不出现', { timeout: 240_000 }, async () => {
    const sentinel = join(TEST_HOME, '.ssh', 'id_sentinel')
    mkdirSync(join(TEST_HOME, '.ssh'), { recursive: true })
    writeFileSync(sentinel, 'HOST-KEY-SENTINEL-T10')
    const r = await driveBash(`cat ${sentinel}; echo rc=$?`)
    expect(r.toolResults[0]!.text, '正文不出现（宿主 .ssh 在 wrapper NEVER 根）').not.toContain('HOST-KEY-SENTINEL-T10')
    expect(r.toolResults[0]!.text, '退出非零（bash 真跑了、被挡）').toMatch(/rc=[1-9]/)
  })

  it('④b bash 读远端 ~/.ssh 哨兵 → 同挡', { timeout: 240_000 }, async () => {
    const sentinel = join(server.remoteHome, '.ssh', 'id_sentinel')
    mkdirSync(join(server.remoteHome, '.ssh'), { recursive: true })
    writeFileSync(sentinel, 'REMOTE-KEY-SENTINEL-T10')
    const r = await driveBash(`cat ${sentinel}; echo rc=$?`)
    expect(r.toolResults[0]!.text, '远端正文不出现').not.toContain('REMOTE-KEY-SENTINEL-T10')
    expect(r.toolResults[0]!.text, '退出非零').toMatch(/rc=[1-9]/)
  })
})

// T12a ⑦：web 组合下杀 ssh 抓 turn/end 真帧（文案单测的输入——不喂自编形状）。
// 自起 rt2（杀 ssh 会害 beforeAll 的 rt）；门开态（provision2）免审批。
describe('T12a ⑦ ssh 中途断连真帧', () => {
  it('杀 ssh 客户端 → tool/result outcome unknown + turn/end 真帧 + 断后不重放 + 第二会话形态', { timeout: 300_000 }, async () => {
    const basePids = server.clientPids().length
    const rt2 = await launchRuntime({
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
    try {
      // 门开态（provision 对 rt2 的实例）——同 provision() 形态
      const token2 = readFileSync(join(rt2.handoff, 'launch-token'), 'utf8').trim()
      const instance2 = createHash('sha256').update(token2).digest('hex')
      // resolveConfig 缺省读 <HOME>/.config/pbots-ui/policy-state.json（provision() 同位）；
      // 本 describe 在 T10 各格之后跑，覆盖 instance 只影响已跑完的格
      const dataDir2 = join(TEST_HOME, '.config', 'pbots-ui')
      mkdirSync(dataDir2, { recursive: true })
      writeFileSync(join(dataDir2, 'policy-state.json'), JSON.stringify({ version: 1, paused: false, instance: instance2 }))
      const ws = join(server.workspace, 't12a-7')
      mkdirSync(ws, { recursive: true })
      rmSync(join(ws, 'started'), { force: true })
      const { sessionId } = (await rt2.client.call('session/create', { request: { cwd: ws, permissionPreset: 'workspace-write' } })) as { sessionId: string }
      const dir = join(rt2.home, 'fake', 'scripts')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls: [
        toolCall('bash', { command: 'printf go > started; sleep 30', description: 'T12a start' }),
        toolCall('bash', { command: 'printf x > after-cut.txt', description: 'T12a after cut' }),
        textCall('T12a'),
      ] }))
      const stream = await rt2.client.follow(sessionId)
      const frames: Frame[] = []
      const drained = (async () => { for await (const f of stream) frames.push(f) })()
      await rt2.client.call('session/prompt', { request: { requestId: `t12a-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'T12a' }] } })
      // 等远端 started（≤45s）
      const startedAt = Date.now()
      for (;;) {
        if (existsSync(join(ws, 'started'))) break
        if (Date.now() - startedAt > 45_000) throw new Error(`ws/started 未出现`)
        await new Promise((r) => setTimeout(r, 100))
      }
      // 基线差杀新增 ssh 客户端（T4 ② 写法——不伤 beforeAll 的连接）
      for (const pid of server.clientPids().slice(basePids)) {
        try { process.kill(pid, 'SIGKILL') } catch { /* 已退出 */ }
      }
      // 等 turn/end（≤60s）
      const deadline = Date.now() + 60_000
      for (;;) {
        if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
        if (Date.now() > deadline) throw new Error(`turn/end 未到：${JSON.stringify(frames.slice(-3)).slice(0, 300)}`)
        await new Promise((r) => setTimeout(r, 150))
      }
      // ① tool/result isError 且含 outcome is unknown
      const tr = frames.find((f) => f.type === 'event' && f.event?.type === 'tool/result' && (f.event.data as { message?: { isError?: boolean } }).message?.isError === true)
      expect(tr, '有一条 isError tool/result').toBeTruthy()
      const trText = ((tr!.event!.data as { message?: { content?: Array<{ text?: string }> } }).message?.content ?? []).map((c) => c.text ?? '').join('\n')
      expect(trText, '正文含 outcome is unknown').toContain('outcome is unknown')
      // ② turn/end 的 reason 整体含 SSH connection is closed
      const te = frames.find((f) => f.type === 'event' && f.event?.type === 'turn/end')!
      expect(JSON.stringify((te.event as { data?: { reason?: unknown } }).data?.reason), 'turn/end reason 含断连串').toContain('SSH connection is closed')
      // ③ 断后不重放：after-cut.txt 不存在
      expect(existsSync(join(ws, 'after-cut.txt')), '断连后的调用没执行也没重放').toBe(false)
      // 真帧打印（ui 单测原样粘贴用）
      console.log('[T12a-raw]', JSON.stringify(tr))
      console.log('[T12a-raw]', JSON.stringify(te))
      stream.cancel(); void drained
      // 第二会话：断开之后别的 bot 碰远端的形态（只断言到了不挂）
      const ws2 = join(server.workspace, 't12a-7b')
      mkdirSync(ws2, { recursive: true })
      const { sessionId: s2 } = (await rt2.client.call('session/create', { request: { cwd: ws2, permissionPreset: 'workspace-write' } })) as { sessionId: string }
      writeFileSync(join(dir, `${s2}.json`), JSON.stringify({ calls: [toolCall('bash', { command: 'printf ok > second.txt', description: 'T12a second' }), textCall('T12a-2')] }))
      const stream2 = await rt2.client.follow(s2)
      const frames2: Frame[] = []
      const drained2 = (async () => { for await (const f of stream2) frames2.push(f) })()
      await rt2.client.call('session/prompt', { request: { requestId: `t12a2-${Date.now()}`, sessionId: s2, mode: 'queue', content: [{ type: 'text', text: 'T12a-2' }] } })
      const deadline2 = Date.now() + 60_000
      let ended2 = false
      for (;;) {
        if (frames2.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) { ended2 = true; break }
        if (Date.now() > deadline2) break // 断后新会话可无限挂（重连等待）——形态本身是发现，不抛
        await new Promise((r) => setTimeout(r, 150))
      }
      const te2 = frames2.find((f) => f.type === 'event' && f.event?.type === 'turn/end')
      const tr2 = frames2.find((f) => f.type === 'event' && f.event?.type === 'tool/result')
      console.log('[T12a-raw-2] ended=', ended2)
      console.log('[T12a-raw-2]', JSON.stringify(tr2))
      if (te2) console.log('[T12a-raw-2]', JSON.stringify(te2))
      stream2.cancel(); void drained2
      // 收尾：rt2 的 dsh 不留孤儿（readStderr 解析 pid → /proc 不存在）
      await rt2.stop()
      const m = /p2sdk: dsh pid (\d+)/.exec(rt2.readStderr())
      if (m) expect(existsSync(join('/proc', m[1]!)), 'rt2 的 dsh 已收（无孤儿）').toBe(false)
    } finally {
      try { await rt2.stop() } catch { /* 已停 */ }
    }
  })
})
