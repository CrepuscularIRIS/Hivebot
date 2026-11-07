// T9a+T9ab（L8-d）：产品启动器的 ssh 组合骨架 e2e。
// ⑧ PTC 断依赖（T9ab 修订：不禁 base ptc-runtime——只禁 T4 三行，会话可建，
//    fake 首请求 tools 不含 workflow）；
// ⑨ glob/grep guard 工具名拒（真实会话驱动）；
// ⑪ SIGKILL launcher → 清场。
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
      P2SDK_SSH_REMOTE_HOME: server.remoteHome,
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

async function drive(calls: object[]): Promise<{ sessionId: string; toolResults: Array<{ isError: boolean; text: string }>; asked: number }> {
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
  const asked = 0 // approval 走 $events socket 不进 follow 流（T9b3 实测）；终态由 isError+never-root 判
  const results: Array<{ isError: boolean; text: string }> = []
  for (const f of frames) {
    if (f.type !== 'event' || f.event?.type !== 'tool/result') continue
    const d = f.event.data as { message?: { isError?: boolean; content?: Array<{ text?: string }> } }
    results.push({ isError: d.message?.isError === true, text: (d.message?.content ?? []).map((c) => c.text ?? '').join('\\n') })
  }
  return { sessionId, toolResults: results, asked }
}

describe('T9a 产品启动器 ssh 组合', () => {





  it('⑨ glob/grep 被 guard 拒：原因含 not available in ssh mode', { timeout: 240_000 }, async () => {
    const g = await drive([toolCall('grep', { pattern: 'x' })])
    expect(g.toolResults.length).toBeGreaterThanOrEqual(1)
    expect(g.toolResults[0]!.isError).toBe(true)
    expect(g.toolResults[0]!.text).toContain('not available in ssh mode')
    const b = await drive([toolCall('glob', { pattern: '*' })])
    expect(b.toolResults.length).toBeGreaterThanOrEqual(1)
    expect(b.toolResults[0]!.isError).toBe(true)
    expect(b.toolResults[0]!.text).toContain('not available in ssh mode')
  })

  it('②b（T9b3 先红）远端 ~/.ssh 哨兵 read：guard 远端根未接 → 现在能读到正文（先红）', { timeout: 240_000 }, async () => {
    const { writeFileSync: wfs, mkdirSync: mks } = await import('node:fs')
    mks(join(server.remoteHome, '.ssh'), { recursive: true })
    wfs(join(server.remoteHome, '.ssh', 'id_sentinel'), 'REMOTE-KEY-SENTINEL-T9B3')
    const r = await drive([toolCall('read', { file_path: join(server.remoteHome, '.ssh', 'id_sentinel') })])
    // 终态断言（T9b3 接远端根后）：guard NEVER 拒——isError、never-root、零卡。
    // 先红态（guard 未接远端根）：出审批卡（asked≥1）或读出正文——下方两断言在先红态红。
    expect(r.toolResults[0]!.isError, '远端凭证 read 被拒').toBe(true)
    expect(r.toolResults[0]!.text, 'guard hardRoots 拒串').toContain('touches a hard-denied area')
  })

  it('⑥ Q-029 旧会话（header.cwd 宿主路径）bash → 拒 + 固定提示串 + 两侧无新文件', { timeout: 180_000 }, async () => {
    // 旧会话 = cwd 在宿主（TEST_HOME 下），不在 remoteRoot 下
    const oldWs = join(TEST_HOME, 'legacy-ws')
    mkdirSync(oldWs, { recursive: true })
    const { sessionId } = (await rt!.client.call('session/create', { request: { cwd: oldWs } })) as { sessionId: string }
    const dir = join(rt!.home, 'fake', 'scripts')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls: [toolCall('bash', { command: 'echo x > probe.txt', description: 'T11-6' }), textCall('T116')] }))
    const stream = await rt!.client.follow(sessionId)
    const frames: Frame[] = []
    const drained = (async () => { for await (const f of stream) frames.push(f) })()
    await rt!.client.call('session/prompt', { request: { requestId: `t116-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'go' }] } })
    const deadline = Date.now() + 90_000
    for (;;) {
      if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
      if (frames.some((f) => f.type === 'event' && f.event?.type === 'approval/asked')) {
        let patch = ''
        void patch
        throw new Error('⑥ guard 未拦（出卡）——runtime-patch 已被 handoff 删（设计）；下一步：单测层直验 guard sshMode 分支（guard.test 假 exec.agent.session.header.cwd）')
      }
      if (Date.now() > deadline) throw new Error(`turn/end 未到：${JSON.stringify(frames.map((f) => f.type === 'event' && f.event ? { t: f.event.type } : f.type).slice(-6))}`)
      await new Promise((r) => setTimeout(r, 200))
    }
    stream.cancel(); void drained
    if (frames.some((f) => f.type === 'event' && f.event?.type === 'approval/asked')) {
      throw new Error(`⑥ guard 未拦（出了审批卡）——runtime-patch guard 行核：${readFileSync(join(rt!.home, 'runtime-patch.yml'), 'utf8').split('\n').filter((l) => l.includes('sshMode') || l.includes('remoteRoot') || l.includes('p2sdk-fs-guard')).join(' | ')}`)
    }
    const results = frames.filter((f) => f.type === 'event' && f.event?.type === 'tool/result')
    expect(results.length).toBeGreaterThanOrEqual(1)
    const d0 = results[0]!.event!.data as { message?: { isError?: boolean; content?: Array<{ text?: string }> } }
    expect(d0.message?.isError, '旧会话 bash 被拒').toBe(true)
    const text = (d0.message?.content ?? []).map((c) => c.text ?? '').join('')
    expect(text, '固定提示串（含新建会话指引）').toContain('Create a new chat')
    expect(existsSync(join(oldWs, 'probe.txt')), '宿主无新文件').toBe(false)
  })

  it('⑤d workspace_ensure 越界/坏形状 → 拒且远端无新目录', { timeout: 120_000 }, async () => {
    const before = readdirSync(server.workspace).length
    const wsRootBefore = existsSync(join(server.workspace, 'workspaces')) ? readdirSync(join(server.workspace, 'workspaces')).length : 0
    // 六坏形全拒（RemoteError bad-bot-id）
    const rejected: string[] = []
    for (const bad of ['../escape', 'a/b', 'has space', '.hidden', 'x'.repeat(200), 'ok/id']) {
      try {
        await rt!.client.call('p2sdk/workspace_ensure', { request: { botId: bad } })
      } catch (e) {
        rejected.push(bad)
        if (!String(e).includes('bad-bot-id')) throw new Error(`坏形状 ${bad} 拒因异常: ${String(e).slice(0, 150)}`)
      }
    }
    expect(rejected, '六个坏形状全拒').toHaveLength(6)
    await new Promise((r) => setTimeout(r, 500))
    // workspaces 根可能尚未被任何 ensure 建出（全坏形皆拒）——不存在即最强断言
    const wsDir = join(server.workspace, 'workspaces')
    const wsRootAfter = existsSync(wsDir) ? readdirSync(wsDir).length : -1
    expect(wsRootAfter, `远端 workspaces 无新目录（before=${wsRootBefore} after=${wsRootAfter}）`).toBeLessThanOrEqual(wsRootBefore)
    expect(readdirSync(server.workspace).length, '远端根无逃逸目录').toBe(before)
  })

  it('②d remoteHome 配错 → 起不来：launchRuntime reject 且错误含校验固定串（guard exit 86）', { timeout: 240_000 }, async () => {
    // 先红（T9b3 前）= guardRow 不带 remoteHome → 校验不跑、照常启动（resolve）。
    // 终态：校验在 ssh.ready 后 exit(86)，dsh 死于 connect 窗口——错误带 stderr 尾。
    await expect(
      launchRuntime({ env: {
        HOME: TEST_HOME, PATH: `${server.binDir}:${process.env.PATH ?? ''}`,
        P2SDK_HOME: mkdtempSync(join(TEST_ROOT, 'dsh2d-')), P2SDK_PATCH: fakeOverlay(),
        P2SDK_SSH_HOST: 'pbots-ssh-test', P2SDK_SSH_REMOTE_ROOT: server.workspace,
        P2SDK_SSH_HELPER: server.helper, P2SDK_SSH_HELPER_HASH: server.helperHash, P2SDK_SSH_NODE: process.execPath,
        P2SDK_SSH_REMOTE_HOME: server.workspace, // 配错：远端 ~ 不是 ws
      } }),
      '配错 remoteHome 起不来',
    ).rejects.toThrow(/does not match the remote home/)
  })

  it('⑪ launcher 强杀→dsh 仍活；dsh 强杀→ssh 清场、端口 ECONNREFUSED', { timeout: 180_000 }, async () => {
    // T9ad：基线必须在 rt3 创建**之前**取——dsh-ssh 构造函数里就 mkdtemp 出
    // /tmp/dsh-ssh-* 目录（dsh-ssh lib/index.js:67,302），取晚了差集恒空。
    const dshSshDirs = (): string[] => readdirSync('/tmp').filter((n) => n.startsWith('dsh-ssh-')).sort()
    const helperPids = (): number[] => readdirSync('/proc').filter((p) => /^\d+$/.test(p)).map(Number).filter((p) => {
      try { return readFileSync(`/proc/${p}/cmdline`, 'utf8').includes(server.helper) } catch { return false }
    })
    const baseline = dshSshDirs()
    const baseClients = server.clientPids().length
    const baseHelpers = helperPids()
    // 独立 runtime（避免基线被 ⑧⑨ 污染）
    const rt3 = await launchRuntime({ env: {
      HOME: TEST_HOME, PATH: `${server.binDir}:${process.env.PATH ?? ''}`,
      P2SDK_HOME: mkdtempSync(join(TEST_ROOT, 'dsh11-')), P2SDK_PATCH: fakeOverlay(),
      P2SDK_SSH_HOST: 'pbots-ssh-test', P2SDK_SSH_REMOTE_ROOT: server.workspace,
      P2SDK_SSH_HELPER: server.helper, P2SDK_SSH_HELPER_HASH: server.helperHash, P2SDK_SSH_NODE: process.execPath,
    } })
    // dsh 是 launcher 的子进程——从 /proc 找
    const launcherPid = (rt3 as unknown as { child: { pid: number } }).child.pid
    const childList = readFileSync(`/proc/${launcherPid}/task/${launcherPid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number)
    const dshPid = childList[0]
    expect(dshPid, '从 /proc 找到 dsh 子进程').toBeTruthy()
    // 前半：SIGKILL launcher → dsh 仍活（T-13 detached 设计）
    const child = (rt3 as unknown as { child: { kill(s: string): void } }).child
    child.kill('SIGKILL')
    await new Promise((r) => setTimeout(r, 2000))
    expect(existsSync(`/proc/${dshPid}`), 'dsh 仍活（detached 设计）').toBe(true)
    // 后半：SIGKILL dsh → ssh 清场。防空集断言先行——kill 前集合必须非空，
    // 「kill 后为空」才有意义（T9ab/T9ac 两轮的毛病都是基线取晚了）。
    expect(dshSshDirs().filter((n) => !baseline.includes(n)).length, 'rt3 建了自己的 dsh-ssh 目录（防空集）').toBeGreaterThanOrEqual(1)
    const myClients = server.clientPids().slice(baseClients)
    const myHelpers = helperPids().filter((p) => !baseHelpers.includes(p))
    expect(myClients.length, 'rt3 经包装器起过 ssh 客户端（防空集）').toBeGreaterThan(0)
    expect(myHelpers.length, 'rt3 的远端 helper 在跑（防空集）').toBeGreaterThan(0)
    process.kill(dshPid, 'SIGKILL')
    const alive = (p: number): boolean => { try { process.kill(p, 0); return true } catch { return false } }
    for (let i = 0; i < 75; i++) { if (!alive(dshPid)) break; await new Promise((r) => setTimeout(r, 200)) }
    await new Promise((r) => setTimeout(r, 2000))
    const after = dshSshDirs()
    const added = after.filter((n) => !baseline.includes(n))
    expect(added.length, `新增 dsh-ssh ≤1`).toBeLessThanOrEqual(1)
    for (const d of added) { expect(readdirSync(join('/tmp', d)), `目录 ${d} 为空`).toEqual([]) }
    const port3 = Number(new URL(rt3.baseUrl).port)
    const err = await new Promise<Error>((resolve) => {
      const sock = net.connect(port3, '127.0.0.1')
      sock.on('error', (e) => { sock.destroy(); resolve(e) })
      sock.on('connect', () => { sock.destroy(); resolve(new Error('still open')) })
    })
    expect((err as NodeJS.ErrnoException).code, '端口 ECONNREFUSED').toBe('ECONNREFUSED')
    try { await rt3.stop() } catch { /* 已杀 */ }
    // T9ad：kill 前防空集断言过的 myClients/myHelpers 必须在 15s 内退净。
    // 不按 ppid 数孤儿——本机 systemd --user（child subreaper）收养孤儿，
    // ppid 恒指向它而非 1；这里直接按登记 PID 等待。超时未退的补刀（全是本
    // 夹具/本测试登记的自己人），补刀后仍活才断言失败。
    const mine = [...myClients, ...myHelpers]
    for (let i = 0; i < 75 && mine.some(alive); i++) await new Promise((r) => setTimeout(r, 200))
    const left = mine.filter(alive)
    for (const p of left) { try { process.kill(p, 'SIGKILL') } catch { /* 已退 */ } }
    expect(left, 'SIGKILL dsh 后其 ssh 客户端与远端 helper 15s 内退净').toEqual([])
  })
})
