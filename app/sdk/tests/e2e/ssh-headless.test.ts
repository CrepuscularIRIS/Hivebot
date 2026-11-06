// T4（L8-b）：dsh headless 真进程 + ssh 族组合——模型工具调用经 ssh 落到夹具主机。
// ① 正路：bash 的 marker 只可能来自 sshd 会话；write 落远端 workspace；宿主 cwd 空。
// ② 断连不回落：杀本次运行新增的 ssh 客户端后，在跑 bash 15s 内报错、后续调用不在任何地方落文件。
// ③ 真实 ~/.ssh 元数据不动；④ stop 后进程/端口归零。
// patch 由测试生成在夹具目录（产品接入形态是 T5 的设计题）；PTC 与 session-title 禁用理由见工单。
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as net from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startSshServer, type SshServer } from '../support/ssh-host.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const PKG_ROOT = join(import.meta.dirname, '../..')
const T_ROOT = tmkdir('bot-T4-run-')
const T_HOME = join(T_ROOT, 'home')
mkdirSync(T_HOME, { recursive: true })
const fileUrl = (p: string): string => pathToFileURL(p).href
const pkgLib = (name: string): string => fileUrl(join(PKG_ROOT, 'node_modules', '@deepseek-ai', name, 'lib', 'index.js'))
const dshBin = join(PKG_ROOT, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

/** 真实 ~/.ssh 的递归元数据快照（同 ssh-host.test.ts，不读内容）。 */
function snapshotRealSsh(): string[] | null {
  const dir = join(userInfo().homedir, '.ssh')
  if (!existsSync(dir)) return null
  const entries: string[] = []
  const walk = (rel: string): void => {
    for (const name of readdirSync(join(dir, rel)).sort()) {
      const r = rel ? `${rel}/${name}` : name
      const st = lstatSync(join(dir, r))
      entries.push(`${r}|${st.mode}|${st.size}|${st.mtimeMs}|${st.ctimeMs}|${st.ino}`)
      if (st.isDirectory()) walk(r)
    }
  }
  walk('')
  return entries
}

function portRefused(port: number, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1')
    const fail = (message: string): void => { sock.destroy(); reject(new Error(message)) }
    sock.setTimeout(timeoutMs, () => fail(`port ${port}: connect timeout`))
    sock.on('connect', () => fail(`port ${port}: still listening`))
    sock.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNREFUSED') { sock.destroy(); resolve() }
      else fail(`port ${port}: ${err.code ?? err.message}`)
    })
  })
}

interface HeadlessRun {
  code: number | null
  events: Array<{ type: string; [k: string]: unknown }>
  /** 逐行到达时间（毫秒 epoch），② 的 15s 判据用。 */
  arrivals: number[]
  env: NodeJS.ProcessEnv
  stderr: string
}

let server: SshServer
let hostCwd: string
let sshYml: string
let replayYml: string
let realSshBefore: string[] | null

beforeAll(async () => {
  server = await startSshServer()
  hostCwd = join(server.dir, 'host-cwd')
  mkdirSync(hostCwd, { recursive: true })
  realSshBefore = snapshotRealSsh()

  sshYml = join(server.dir, 'ssh.patch.yml')
  writeFileSync(sshYml, `\
# T4：进程级 ssh 组合（测试生成，不进 profile/——产品形态是 T5 的设计题）
- id: fs-sandbox
  disabled: true
- id: subprocess
  disabled: true
- id: sandbox
  disabled: true
- id: session-title-llm
  disabled: true
# PTC 族：script 部署未配 bootstrap 时上游 PTC 不可用，且本机 node PTC 是 ssh 模式下
# 一条回落本机的执行路——一并禁用；接 ctx.ssh.ptcLaunch 是 T5 的事
- id: ptc-runtime
  disabled: true
- id: workflow-ptc
  disabled: true
- id: tool-workflow
  disabled: true
- id: tool-executor-ptc
  disabled: true
- insert:
    - id: ssh
      name: '${pkgLib('dsh-ssh')}'
      config:
        host: pbots-ssh-test
        launch: { kind: node-script, node: '${process.execPath}' }
        helper: '${server.helper}'
        helperHash: '${server.helperHash}'
        workspace: '${server.workspace}'
    - id: fs-ssh
      name: '${pkgLib('dsh-fs-ssh')}'
    - id: subprocess-ssh
      name: '${pkgLib('dsh-subprocess-ssh')}'
    - id: sandbox-ssh
      name: '${pkgLib('dsh-sandbox-ssh')}'
# 覆盖 sandbox-policy：workspaceRoot 指夹具 ws（不是 process.cwd()），保留 headless 的
# inject 与 CLI 追加根（缺 inject: [headlessStartup] 会被 runner 拒跑）
- id: sandbox-policy
  inject: [headlessStartup]
  config:
    mode: workspace-write
    workspaceRoot: '${server.workspace}'
    additionalWritableRoots: !!js ctx.headlessStartup.additionalWritableRoots
`)

  replayYml = join(server.dir, 'replay.patch.yml')
  writeFileSync(replayYml, `\
- insert:
    - id: llm-replay
      name: '${pkgLib('dsh-llm-replay')}'
      config:
        file: /p2sdk/unused-session-fixture.jsonl
        overrideFile: '${join(server.dir, 'replay-override.json')}'
        paceMs: 25
        providers:
          - id: mock
            name: Mock Replay
            models:
              - id: mock
                contextWindow: 131072
- id: agent-default-model
  config:
    provider: mock
    model: mock
`)
}, 120_000)

afterAll(async () => { await server?.stopServer() })

function writeReplay(entries: object[]): void {
  writeFileSync(join(server.dir, 'replay-override.json'), JSON.stringify(entries))
}

function toolCall(name: string, args: object): object {
  const id = `t4-${Math.random().toString(16).slice(2, 8)}`
  const argumentsJson = JSON.stringify(args)
  return {
    kind: 'chunks',
    chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsJson.slice(0, 5) },
      { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsJson.slice(5) },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: argumentsJson } },
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
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 1 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
  }
}

function spawnHeadless(task: string): { child: ChildProcess; env: NodeJS.ProcessEnv; events: Array<{ type: string; [k: string]: unknown }>; arrivals: number[]; stderr: string; exited: Promise<number | null> } {
  // 显式白名单 env：绝不展开 process.env，绝不携带 PBOTS_SSH_MARK（marker 证明的假阳性防护）
  const env: NodeJS.ProcessEnv = {
    PATH: `${server.binDir}:${process.env.PATH ?? ''}`,
    HOME: T_HOME,
    TMPDIR: join(T_ROOT, 'tmp'),
    DBUS_SESSION_BUS_ADDRESS: `unix:path=${T_ROOT}/no-dbus`,
    DSH_HOME: mkdtempSync(join(server.dir, 'dsh-home-')),
    DSH_TELEMETRY_MODE: 'DISABLED',
  }
  const child = spawn('setpriv', ['--pdeathsig', 'TERM', process.execPath, dshBin, 'headless',
    '--patch', sshYml, '--patch', replayYml,
    '--permission-mode', 'workspace-write', '--approval-policy', 'never', '--json', task], {
    cwd: hostCwd, env, stdio: ['ignore', 'pipe', 'pipe'],
  })
  const events: Array<{ type: string; [k: string]: unknown }> = []
  const arrivals: number[] = []
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    for (const line of chunk.split('\n')) {
      if (line.trim() === '') continue
      arrivals.push(Date.now())
      try { events.push(JSON.parse(line)) } catch { events.push({ type: 'unparseable', line }) }
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (c: string) => { stderr += c })
  const exited = new Promise<number | null>((resolve) => child.once('exit', (c) => resolve(c)))
  return { child, env, events, arrivals, stderr, exited }
}


const toolResultsDump = (events: Array<{ type: string; [k: string]: unknown }>): unknown[] =>
  events.filter((e) => e.type === 'tool_result').map((e) => ({ status: e.status, result: String(e.result ?? '').slice(0, 200) }))

describe('T4 L8-b dsh headless + ssh 族真组合', () => {
  it('① 模型工具调用经 ssh：bash marker=本轮 mark、write 落远端 ws、宿主 cwd 空、env 无 mark', { timeout: 240_000 }, async () => {
    const R = `t4-proof-${Math.random().toString(16).slice(2, 10)}`
    writeReplay([
      toolCall('bash', { description: 'Write ssh session marker', command: 'printf %s "$PBOTS_SSH_MARK" > bash-mark.txt' }),
      toolCall('write', { file_path: 'write-proof.txt', content: R }),
      textCall('T4 完成'),
    ])
    const run = spawnHeadless('T4 task')
    const code = await run.exited
    const toolResults = run.events.filter((e) => e.type === 'tool_result')
    const final = run.events.find((e) => e.type === 'final')
    if (final === undefined || code !== 0) throw new Error(`headless 失败 code=${code} stderr=${run.stderr.slice(0, 800)} events=${JSON.stringify(run.events).slice(0, 600)}`)
    expect(final.reason && (final.reason as { kind?: string }).kind).toBe('completed')
    expect(toolResults).toHaveLength(2)
    for (const tr of toolResults) expect(tr.error).toBeUndefined()
    const results1 = toolResultsDump(run.events)
    console.log('[T4-①-dbg] results=', JSON.stringify(results1).slice(0, 600), ' final=', JSON.stringify(final).slice(0, 200))
    expect(readFileSync(join(server.workspace, 'bash-mark.txt'), 'utf8'), 'marker 只可能来自 sshd 会话').toBe(server.mark)
    expect(readFileSync(join(server.workspace, 'write-proof.txt'), 'utf8')).toBe(R)
    expect(readdirSync(hostCwd), '宿主 cwd 无回落文件').toEqual([])
    expect('PBOTS_SSH_MARK' in run.env, '子进程 env 不携带 mark（防本机假阳性）').toBe(false)
  })

  it('② 断连不回落：杀 ssh 客户端后在跑 bash 15s 内报错，后续调用不在任何地方落文件', { timeout: 240_000 }, async () => {
    const basePids = server.clientPids().length
    writeReplay([
      toolCall('bash', { description: 'Start remote sleep marker', command: 'printf go > started; sleep 30' }),
      toolCall('bash', { description: 'Write after cut bash proof', command: 'printf x > after-cut-bash.txt' }),
      toolCall('write', { file_path: 'after-cut-write.txt', content: 'x' }),
      textCall('T4 完成'),
    ])
    const run = spawnHeadless('T4 cut task')
    // 等「远端已开始执行」的信号（started 由远端 bash 写进 ws）
    const startedAt = Date.now()
    for (;;) {
      if (existsSync(join(server.workspace, 'started'))) break
      if (Date.now() - startedAt > 45_000) throw new Error(`ws/started 未出现；stderr=${run.stderr.slice(0, 500)}`)
      await new Promise((r) => setTimeout(r, 100))
    }
    const killAt = Date.now()
    for (const pid of server.clientPids().slice(basePids)) {
      try { process.kill(pid, 'SIGKILL') } catch { /* 已退出 */ }
    }
    const code = await Promise.race([
      run.exited,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('headless 60s 未退出')), 60_000)),
    ])
    // 首个 tool_result（在跑的 bash）必须在 kill 后 15s 内带 error 到达——排除「sleep 跑完才算断」
    const trIndex = run.events.findIndex((e) => e.type === 'tool_result')
    // 记录 (1)(2) 的实际形态（T5 输入）：本轮实测＝运行整体终止，(1)(2) 未执行
    const later = run.events.filter((e) => e.type === 'tool_result').length - 1
    console.log(`[T4-②] code=${code} firstToolResult=${JSON.stringify(run.events[trIndex]!.result)} laterToolResults=${later} finalReason=${JSON.stringify((run.events.find((e) => e.type === 'final')?.reason as { kind?: string })?.kind)}`)
    expect(trIndex, '至少一条 tool_result').toBeGreaterThanOrEqual(0)
    // 实测形态：tool_result 以 status:"error" + result 文本报断连（无 error 字段）
    expect(run.events[trIndex]!.status, '在跑 bash 报错').toBe('error')
    expect(String(run.events[trIndex]!.result)).toMatch(/disconnected|unknown|closed/i)
    expect(run.arrivals[trIndex]! - killAt, 'error 在 kill 后 15s 内').toBeLessThan(15_000)
    // 后续调用不得在任何地方落文件：远端 ws 与宿主 cwd 都查
    expect(existsSync(join(server.workspace, 'after-cut-bash.txt'))).toBe(false)
    expect(existsSync(join(server.workspace, 'after-cut-write.txt'))).toBe(false)
    expect(readdirSync(hostCwd)).toEqual([])
    // 排障：完整事件形态
  })

  it('③ 真实 ~/.ssh 递归元数据未动', () => {
    expect(snapshotRealSsh()).toEqual(realSshBefore)
  })

  it('④ stopServer 后：无夹具路径进程、端口只以 ECONNREFUSED 拒', { timeout: 60_000 }, async () => {
    await server.stopServer()
    const leaked: string[] = []
    for (const pid of readdirSync('/proc')) {
      if (!/^\d+$/.test(pid)) continue
      try {
        if (readFileSync(join('/proc', pid, 'cmdline'), 'utf8').includes(server.dir)) leaked.push(pid)
      } catch { /* 读不到当不存在 */ }
    }
    expect(leaked).toEqual([])
    await portRefused(server.port)
  })
})
