// T-12 验收手工端到端（verifier 自跑的 vitest 用例，非产品测试）。
// 目的：验收项①②③④在「真实默认链」上的行为——不设 P2SDK_PATCH、
// 不设 P2SDK_HANDOFF、P2SDK_PROVIDER=mock，argv/env 全部来自产品
// src/start.ts 的导出组件（resolveConfig/buildArgs/writeRuntimePatch/
// dshSpawnOptions）。与产品 main() 的唯一偏差：replay-override.json 换成
// 含 bash tool-call 的探针脚本（产品 mockReplayOverride 只有文本回复，
// 无法驱动 bash 工具；e2e approval.test.ts 是经 P2SDK_PATCH 挂 fake
// provider 实现的，本文件补「完全不设 P2SDK_PATCH」的缺口）。
// noask 用例 = 红路径对照：P2SDK_PATCH 挂 `- id: p2sdk-shell-ask /
// disabled: true` 复现 REVIEW R3/R5/R13 的「没问就跑了」。
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { connect, type DshClient } from '/tmp/bot-wt/T-12/app/sdk/examples/lib/client.mjs'
import {
  buildArgs, dshSpawnOptions, isReadyLine, resolveConfig, writeRuntimePatch, acquireHomeLock,
} from '/tmp/bot-wt/T-12/app/sdk/src/start.ts'

const SDK = '/tmp/bot-wt/T-12/app/sdk'
const log = (...a: unknown[]) => console.log('[vfy]', ...a)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function bashCall(command: string, extra: Record<string, string> = {}): object {
  const id = `vfy-${Math.random().toString(16).slice(2, 8)}`
  const argumentsJson = JSON.stringify({ command, description: 'T-12 verify probe', ...extra })
  return {
    kind: 'chunks',
    chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id, name: 'bash', argumentsDelta: argumentsJson.slice(0, 5) },
      { type: 'tool-call-delta', index: 0, id, name: 'bash', argumentsDelta: argumentsJson.slice(5) },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'bash', arguments: argumentsJson } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ],
  }
}
function textCall(text: string): object {
  return {
    kind: 'chunks',
    chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text },
      { type: 'block-end', index: 0, block: { type: 'text', text } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
  }
}

interface EventsFrame { type: string; event?: string; agentId?: string; eventId?: string; request?: { toolName?: string; [k: string]: unknown }; clientId?: string }

/** Boot the default chain (product components; probe replay script) and drive turns. */
async function driveDefaultChain(opts: { noaskOverlay?: string }) {
  delete process.env.P2SDK_PATCH
  delete process.env.P2SDK_HANDOFF
  process.env.P2SDK_PROVIDER = 'mock'
  const home = mkdtempSync(join(tmpdir(), 'p2sdk-vfy-ask-'))
  process.env.P2SDK_HOME = home
  if (opts.noaskOverlay) process.env.P2SDK_PATCH = opts.noaskOverlay

  const cfg = resolveConfig()
  log('cfg.handoff =', cfg.handoff, '| extraPatches =', JSON.stringify(cfg.extraPatches))
  expect(/p2sdk-handoff-[A-Za-z0-9]+$/.test(cfg.handoff), '默认 handoff 是随机 tmpdir（非确定性兄弟目录）').toBe(true)
  if (!opts.noaskOverlay) expect(process.env.P2SDK_PATCH).toBeUndefined()

  const ws = join(home, 'workspace')
  mkdirSync(ws, { recursive: true })
  const canaryPlain = join(ws, 'canary-plain')
  const canaryMode = join(ws, 'canary-mode')
  const canaryEsc = join(ws, 'canary-esc')
  const probeCmd = [
    'echo PROBE_BEGIN',
    `echo PRINTENV_COUNT=$(printenv | grep -c -E '^P2SDK_(HOME|HANDOFF)=' || true)`,
    'echo ENV_HOME_SET=${P2SDK_HOME+SET}',
    'echo CAT_DERIVED_BYTES=$(cat "$(dirname "${P2SDK_HOME:-/nonexistent}")/.dsh-handoff/launch-token" 2>/dev/null | wc -c)',
    `echo FIND_HOME_COUNT=$(find "${home}" -name launch-token 2>/dev/null | wc -l)`,
    `echo DIRECT_READ_BYTES=$(cat ${cfg.handoff}/launch-token 2>/dev/null | wc -c)`,
    `echo DIRECT_RC=$(cat ${cfg.handoff}/launch-token >/dev/null 2>&1; echo $?)`,
    `echo TOKEN_SEEN=$(test -f ${cfg.handoff}/launch-token && echo yes || echo no)`,
    `echo WS_TOUCH_RC=$(touch ${ws}/probe-write-check 2>/dev/null; echo $?)`,
    'echo PROBE_END',
  ].join(' ; ')

  const script = opts.noaskOverlay
    ? [bashCall(`touch ${canaryPlain}`), textCall('回1完成'), bashCall(`touch ${canaryEsc}`, { sandbox_permissions: 'danger-full-access', justification: 'T-12 严格宽升权探针' }), textCall('回2完成')]
    : [
        bashCall(`touch ${canaryPlain}`), textCall('回1完成'),
        bashCall(`touch ${canaryMode}`, { sandbox_permissions: 'workspace-write', justification: 'T-12 同模式重复探针' }), textCall('回2完成'),
        bashCall(`touch ${canaryEsc}`, { sandbox_permissions: 'danger-full-access', justification: 'T-12 严格宽升权探针' }), textCall('回3完成'),
        bashCall(probeCmd), textCall('回4完成'),
      ]

  const release = acquireHomeLock(cfg.home)
  if (typeof release === 'string') throw new Error(release)
  writeFileSync(join(cfg.home, 'replay-override.json'), JSON.stringify(script))
  const runtimePatch = writeRuntimePatch(cfg)
  const dshEntry = join(SDK, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const args = buildArgs(cfg, runtimePatch)
  log('dsh --patch 列表:', args.filter((_, i) => args[i - 1] === '--patch').join(' : '))
  const child = spawn(process.execPath, [dshEntry, ...args], dshSpawnOptions(cfg))
  let client: DshClient | undefined
  let answerClient: DshClient | undefined
  let eventsStream: (AsyncIterable<unknown> & { cancel?: () => void }) | undefined
  let fs1: Awaited<ReturnType<DshClient['follow']>> | undefined

  let announced = false
  let pending = ''
  let readyResolve!: (v: boolean) => void
  const ready = new Promise<boolean>((r) => { readyResolve = r })
  child.stdout!.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    if (announced) return
    pending += chunk
    let nl: number
    while ((nl = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, nl)
      if (isReadyLine(line)) {
        announced = true
        try { rmSync(runtimePatch, { force: true }) } catch { /* best effort */ }
        readyResolve(true)
      }
      pending = pending.slice(nl + 1)
    }
    if (!announced && isReadyLine(pending)) {
      announced = true
      try { rmSync(runtimePatch, { force: true }) } catch { /* best effort */ }
      readyResolve(true)
    }
  })
  const timer = setTimeout(() => { if (!announced) readyResolve(false) }, 90_000)
  child.on('exit', () => { clearTimeout(timer); if (!announced) readyResolve(false) })

  try {
    expect(await ready, 'runtime ready（默认链可启动）').toBe(true)
    log('dsh pid =', child.pid)

    // 验收③亲查：dsh 子进程 /proc/<pid>/environ
    const envNames = new Set(readFileSync(`/proc/${child.pid}/environ`, 'utf8').split('\0').map((e) => e.split('=')[0]))
    expect(envNames.has('P2SDK_HOME'), '/proc environ 无 P2SDK_HOME').toBe(false)
    expect(envNames.has('P2SDK_HANDOFF'), '/proc environ 无 P2SDK_HANDOFF').toBe(false)
    log('/proc environ: P2SDK_HOME/P2SDK_HANDOFF 均 ABSENT；DSH_HOME', envNames.has('DSH_HOME') ? 'present(设计内，scrub 在工具子进程层)' : 'absent')

    const token = readFileSync(join(cfg.handoff, 'launch-token'), 'utf8').trim()
    const baseUrl = readFileSync(join(cfg.handoff, 'base-url'), 'utf8').trim()
    client = await connect({ baseUrl, token })
    answerClient = await connect({ baseUrl, token, interactions: 'answer' })
    eventsStream = await answerClient.socket.open('$events', {})
    const frames: EventsFrame[] = []
    void (async () => { for await (const f of eventsStream) frames.push(f as EventsFrame) })()
    await sleep(500)

    const { sessionId } = (await client.call('session/create', { request: { cwd: ws } })) as { sessionId: string }
    log('sessionId =', sessionId)
    const followFrames: unknown[] = []
    fs1 = await client.follow(sessionId)
    void (async () => { for await (const f of fs1) followFrames.push(f) })()

    const sendPrompt = (text: string) => client.call('session/prompt', {
      request: { requestId: `vfy-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, sessionId, mode: 'queue', content: [{ type: 'text', text }] },
    })
    const approvals = () => frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId)
    const waitApproval = async (n: number, ms: number) => {
      const deadline = Date.now() + ms
      while (Date.now() < deadline) {
        if (approvals().length >= n) return approvals()[n - 1]
        await sleep(20)
      }
      return null
    }
    const waitTurnEnds = async (n: number, ms: number) => {
      const deadline = Date.now() + ms
      while (Date.now() < deadline) {
        const ends = followFrames.filter((f) => (f as { type?: string; event?: { type?: string } }).type === 'event' && (f as { event?: { type?: string } }).event?.type === 'turn/end').length
        if (ends >= n) return true
        await sleep(20)
      }
      return false
    }
    const answer = (frame: EventsFrame, value: string) => answerClient.call('$events/result', {
      clientId: (frames.find((f) => f.type === 'ready') as EventsFrame | undefined)?.clientId ?? '',
      eventId: frame.eventId, outcome: { kind: 'result', value },
    })

    const state = { canaryPlain, canaryMode, canaryEsc, sendPrompt, waitApproval, waitTurnEnds, answer, approvals, followFrames, cfg, home, token }
    return state
  } finally {
    // 供调用方在 it() 里 finally 收尾（见下）
    ;(child as ChildProcess & { __vfyRelease?: () => void }).__vfyRelease = release
    ;(globalThis as { __vfyChild?: ChildProcess }).__vfyChild = child
    ;(globalThis as { __vfyFollow?: unknown }).__vfyFollow = fs1
    ;(globalThis as { __vfyEvents?: unknown }).__vfyEvents = eventsStream
    ;(globalThis as { __vfyClients?: DshClient[] }).__vfyClients = [client, answerClient].filter((c): c is DshClient => c !== undefined)
  }
}

/** Teardown inside the test framework (same semantics as e2e rt.stop()). */
async function teardown() {
  const g = globalThis as { __vfyChild?: ChildProcess; __vfyFollow?: { cancel?: () => void }; __vfyEvents?: { cancel?: () => void }; __vfyClients?: { close(): void }[]; __vfyRelease?: () => void }
  try { g.__vfyFollow?.cancel?.() } catch { /* ignore */ }
  try { g.__vfyEvents?.cancel?.() } catch { /* ignore */ }
  for (const c of g.__vfyClients ?? []) { try { c.close() } catch { /* ignore */ } }
  const child = g.__vfyChild
  if (child) {
    child.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => { child.kill('SIGKILL'); resolve() }, 8000)
      child.on('exit', () => { clearTimeout(t); resolve() })
      if (child.exitCode !== null) { clearTimeout(t); resolve() }
    })
  }
  g.__vfyRelease?.()
  log('teardown 完成, dsh exitCode =', child?.exitCode)
}

it('T-12①②③④ 默认链（不设 P2SDK_PATCH/HANDOFF）：普通 bash 必问、同模式必问、严格宽走上游审批、凭证不可推导', async () => {
  const st = await driveDefaultChain({})
  try {
    // ① 普通 bash（无 sandbox_permissions）必须问
    await st.sendPrompt('摸 canary-plain')
    const a1 = await st.waitApproval(1, 10_000)
    expect(a1, '①普通 bash 产生 approval/request').toBeTruthy()
    log('① request.toolName =', a1?.request?.toolName)
    expect(a1?.request?.toolName, '①审批指向 bash 工具').toBe('bash')
    await st.answer(a1!, 'rejected')
    expect(existsSync(st.canaryPlain), '①拒绝后 canary-plain 不存在').toBe(false)
    expect(st.approvals().length, '①恰好 1 次询问（无双弹窗）').toBe(1)
    expect(await st.waitTurnEnds(1, 15_000), '①回合1结束').toBe(true)

    // ② 同模式重复（workspace-write）必须问
    await st.sendPrompt('摸 canary-mode')
    const a2 = await st.waitApproval(2, 10_000)
    expect(a2, '②同模式重复产生 approval/request（R6/R12）').toBeTruthy()
    await st.answer(a2!, 'allowed-once')
    expect(await st.waitTurnEnds(2, 15_000), '②回合2结束').toBe(true)
    expect(existsSync(st.canaryMode), '②批准后 canary-mode 存在').toBe(true)
    expect(st.approvals().length, '②累计恰好 2 次询问（无双弹窗）').toBe(2)

    // ③ 严格宽（danger-full-access）委托上游升权审批：仍一次询问
    await st.sendPrompt('摸 canary-esc')
    const a3 = await st.waitApproval(3, 10_000)
    expect(a3, '③严格宽升权产生 approval/request（上游）').toBeTruthy()
    log('③ escalation request keys =', Object.keys(a3?.request ?? {}).join(','))
    await st.answer(a3!, 'allowed-once')
    expect(await st.waitTurnEnds(3, 15_000), '③回合3结束').toBe(true)
    expect(existsSync(st.canaryEsc), '③批准后 canary-esc 存在').toBe(true)
    expect(st.approvals().length, '③累计恰好 3 次询问（无双弹窗）').toBe(3)

    // ④ 模型侧探针
    await st.sendPrompt('跑探针')
    const a4 = await st.waitApproval(4, 10_000)
    expect(a4, '④探针 bash 也先问').toBeTruthy()
    await st.answer(a4!, 'allowed-once')
    expect(await st.waitTurnEnds(4, 15_000), '④回合4结束').toBe(true)
    await sleep(500)
    log('④ operator 侧 token 存在:', existsSync(join(st.cfg.handoff, 'launch-token')) ? 'yes' : 'no')
    const transcript = JSON.stringify(st.followFrames)
    // 数字型探针值只匹配输出行（命令回显处是 $(...) 形式，不会命中 \d+ / 精确子串）
    const grabNum = (name: string) => { const m = transcript.match(new RegExp(name + '=(\\d+)')); return m ? m[1] : '<missing>' }
    log('④ PRINTENV_COUNT =', grabNum('PRINTENV_COUNT'))
    log('④ ENV_HOME_SET =', grabNum('ENV_HOME_SET'))
    log('④ CAT_DERIVED_BYTES =', grabNum('CAT_DERIVED_BYTES'))
    log('④ FIND_HOME_COUNT =', grabNum('FIND_HOME_COUNT'))
    writeFileSync('/home/lingxufeng/bot/work/p2-sdk/evidence/T-12-verify/probe-transcript.json', transcript)
    expect(transcript, '④探针输出进入 transcript').toContain('PROBE_END')
    expect(transcript, '④printenv 无 P2SDK_HOME/P2SDK_HANDOFF').toContain('PRINTENV_COUNT=0')
    expect(transcript, '④推导路径 cat 取不到 token（0 字节）').toContain('CAT_DERIVED_BYTES=0')
    expect(transcript, '④find runtime home 无 token').toContain('FIND_HOME_COUNT=0')
    log('④ DIRECT_READ_BYTES（受控直读）=', grabNum('DIRECT_READ_BYTES'))
    { const m = transcript.match(/DIRECT_RC=(\d+)/); log('④ DIRECT_RC（cat 退出码）=', m ? m[1] : '<missing>') }
    { const m = transcript.match(/TOKEN_SEEN=(yes|no)/); log('④ TOKEN_SEEN（test -f）=', m ? m[1] : '<missing>') }
    { const m = transcript.match(/WS_TOUCH_RC=(\d+)/); log('④ WS_TOUCH_RC（workspace 写探针）=', m ? m[1] : '<missing>') }
    // /tmp 枚举面不实测（分类器边界），改为上游代码证据分析，见 VERIFY
    expect(transcript, '④token 本体不进 transcript').not.toContain(st.token)
  } finally {
    await teardown()
  }
}, 240_000)

it('T-12 入口烟测+min-client demo：真实 scripts/start.mjs（mock，不设 PATCH/HANDOFF）stderr 印 handoff 行，min-client 走该目录完成流式往返', async () => {
  delete process.env.P2SDK_PATCH
  delete process.env.P2SDK_HANDOFF
  process.env.P2SDK_PROVIDER = 'mock'
  const home = mkdtempSync(join(tmpdir(), 'p2sdk-vfy-entry-'))
  process.env.P2SDK_HOME = home
  const child = spawn(process.execPath, [join(SDK, 'scripts', 'start.mjs')], {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (c: string) => { stdout += c })
  child.stderr.on('data', (c: string) => { stderr += c })
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (/\[p2sdk\] ready http/.test(stdout) && /p2sdk: handoff \S+/.test(stderr)) break
    if (child.exitCode !== null) throw new Error(`launcher exited early: ${stdout}${stderr}`)
    await sleep(200)
  }
  try {
    const hoMatch = stderr.match(/p2sdk: handoff (\S+)/)
    expect(hoMatch, 'stderr 印出 p2sdk: handoff <dir>（operator 侧元数据）').toBeTruthy()
    const handoffDir = hoMatch![1]
    log('入口 stderr handoff =', handoffDir)
    expect(handoffDir, 'handoff 是随机 tmpdir').toMatch(/p2sdk-handoff-/)
    expect(/\[p2sdk\] ready http/.test(stdout), 'ready 行到达').toBe(true)
    expect(stdout + stderr, 'argv/env 链路无 token 泄漏到 stdio').not.toContain(readFileSync(join(handoffDir, 'launch-token'), 'utf8').trim())

    const proc = spawn(process.execPath, [join(SDK, 'examples', 'min-client.mjs'), '验收你好'], {
      env: { ...process.env, P2SDK_HANDOFF: handoffDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')
    proc.stdout.on('data', (c: string) => { out += c })
    proc.stderr.on('data', (c: string) => { out += c })
    const code = await new Promise<number>((resolve) => proc.on('exit', (c) => resolve(c ?? 1)))
    log('min-client 输出尾部:', out.trim().split('\n').slice(-2).join(' | '))
    expect(code, 'min-client exit 0').toBe(0)
    expect(out, 'min-client PASS（流式往返完成）').toContain('min-client PASS')
  } finally {
    child.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => { child.kill('SIGKILL'); resolve() }, 8000)
      child.on('exit', () => { clearTimeout(t); resolve() })
      if (child.exitCode !== null) { clearTimeout(t); resolve() }
    })
    log('launcher teardown 完成, exitCode =', child.exitCode)
  }
}, 240_000)

it('T-12 红路径：禁用默认 approval 行后「没问就跑了」（R3/R5/R13 复现），严格宽升权仍问', async () => {
  const overlay = join(tmpdir(), 'p2sdk-vfy-noask-', 'no-ask.yml')
  const dir = mkdtempSync(join(tmpdir(), 'p2sdk-vfy-noask-'))
  const overlayPath = join(dir, 'no-ask.yml')
  writeFileSync(overlayPath, '# T-12 verify red-path: disable the default shell-ask row\n- id: p2sdk-shell-ask\n  disabled: true\n')
  void overlay
  const st = await driveDefaultChain({ noaskOverlay: overlayPath })
  try {
    await st.sendPrompt('摸 canary-plain')
    await sleep(6_000)
    expect(st.approvals().length, '红路径：6s 内 0 次 approval/request（没问就跑了）').toBe(0)
    expect(existsSync(st.canaryPlain), '红路径：canary-plain 已被直接创建（命令执行了）').toBe(true)
    expect(await st.waitTurnEnds(1, 15_000), '红路径：回合1结束').toBe(true)

    await st.sendPrompt('摸 canary-esc')
    const a = await st.waitApproval(1, 10_000)
    expect(a, '红路径：danger-full-access 仍产生 approval（上游升权未受伤）').toBeTruthy()
    await st.answer(a!, 'allowed-once')
    expect(await st.waitTurnEnds(2, 15_000), '红路径：回合2结束').toBe(true)
    expect(existsSync(st.canaryEsc), '红路径：批准后 canary-esc 存在').toBe(true)
  } finally {
    await teardown()
  }
}, 240_000)
