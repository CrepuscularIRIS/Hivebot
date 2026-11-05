// P5-01 验收 ①–⑨（PLAN p5-parity）：全部经真实 launcher（scripts/start.mjs）+
// fake LLM 的 bash 工具调用（tests/support/fake/plugin.mjs），HOME=主仓
// .test-homes/p5-01（决策 8），探针按 §2 口径逐条写死期望并成对带差分对照
// （stock = 后置 overlay 把 sandbox 行 config 整体换回缺省 → 无 runnerCommand）。
// 凭证哨兵只探存在性（test -e / -s / -S / stat），绝不读内容；测试只结束自己
// spawn 的子进程（launchRuntime.stop 自管），不用 pkill。⑤ 的退出码精确断言
// （python 加载失败=2、内部错误非零）在 sandbox-wrapper.test.ts 直测。
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readFileSync as readFileSyncNode, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir, userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { uniqueTestHome } from '../support/sandbox-home.ts'
import { trackTmpDir } from '../support/tmp-sweep.ts'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '../support/fake/harness.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const REPO_ROOT = join(PKG_ROOT, '..', '..')
const PASSWD_HOME = userInfo().homedir
const TEST_HOME = uniqueTestHome('p5-01') // 决策 8 父目录不变（⑧ 布局分支依赖）+ P5-H3 运行级唯一后缀
// ③ 的工作区：必须在 /var/tmp（ro-bind / 只读区，../outside 才是确定性 EROFS），
// P5-H3 起叶子加随机后缀——固定路径会被并行全量的 ③ 互删 inside3
const WS3 = trackTmpDir(mkdtempSync('/var/tmp/p5-01-ws3-'))
const DATA_DIR = join(TEST_HOME, 'pbots-data')
const DEFAULT_DATA_DIR = join(TEST_HOME, '.config', 'pbots-ui')
const TOOL_PY = join(PASSWD_HOME, 'miniconda3', 'bin', 'python')

interface EventsFrame {
  type: string
  event?: string
  eventId?: string
  agentId?: string
}

interface Feed {
  frames: EventsFrame[]
  answer(frame: EventsFrame, value: string): Promise<unknown>
  close(): void
}

interface SandboxRuntime extends Runtime {
  writeScriptCalls(sessionId: string, calls: object[]): void
  feed: Feed
}

const runtimes: SandboxRuntime[] = []

/** fake LLM overlay（approval.test.ts buildFakeOverlay 同款）。 */
function fakeOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p5-01-patch-'))
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
  return overlay
}

/** stock 差分 overlay：patch 行整体替换 config → runnerCommand 回缺省空表（上游默认 bwrap/探测链）。 */
function stockOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p5-01-stock-'))
  const overlay = join(dir, 'stock.yml')
  writeFileSync(overlay, `\
# P5-01 差分对照：恢复 stock 沙箱（无 runnerCommand）
- id: sandbox
  config:
    probeTimeoutMs: 5000
`)
  return overlay
}

/** ⑤ 用：把 runnerCommand 整体换成给定 argv（缺 wrapper / 坏参数注入）。 */
function runnerOverlay(runnerCommand: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'p5-01-runner-'))
  const overlay = join(dir, 'runner.yml')
  const q = (s: string): string => `'${s.replaceAll("'", "''")}'`
  writeFileSync(overlay, `\
- id: sandbox
  config:
    runnerCommand: [${runnerCommand.map(q).join(', ')}]
    runnerFailureSignatures: ['bwrap: ']
`)
  return overlay
}

async function openFeed(rt: Runtime): Promise<Feed> {
  const client: DshClient = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const stream = await client.socket.open('$events', {})
  const frames: EventsFrame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f as EventsFrame) })().catch(() => {})
  await waitFor(frames as unknown as Frame[], (f) => f.type === 'ready', 5000, '$events ready')
  const clientId = frames.find((f) => f.type === 'ready')?.clientId ?? ''
  return {
    frames,
    answer: (frame, value) =>
      client.call('$events/result', { clientId, eventId: frame.eventId, outcome: { kind: 'result', value } }),
    close() {
      stream.cancel()
      void drained
      client.close()
    },
  }
}

interface LaunchOpts {
  env?: Record<string, string>
  extraPatch?: string
  /** 不设 PBOTS_DATA_DIR（⑨/stock：缺省布局 + WARN）。 */
  noDataDir?: boolean
}

async function launchSandbox(opts: LaunchOpts = {}): Promise<SandboxRuntime> {
  clearRealKeys()
  const env: Record<string, string> = {
    HOME: TEST_HOME,
    P2SDK_PATCH: opts.extraPatch ? `${fakeOverlay()}:${opts.extraPatch}` : fakeOverlay(),
    ...opts.env,
  }
  if (!opts.noDataDir) env.PBOTS_DATA_DIR = DATA_DIR
  const rt = await launchRuntime({ env })
  const feed = await openFeed(rt)
  const sandbox: SandboxRuntime = {
    ...rt,
    feed,
    writeScriptCalls(sessionId: string, calls: object[]): void {
      const dir = join(rt.home, 'fake', 'scripts')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
    },
  }
  runtimes.push(sandbox)
  return sandbox
}

function bashCall(command: string): object {
  const id = `p5-01-${Math.random().toString(16).slice(2, 8)}`
  const argumentsJson = JSON.stringify({ command, description: 'P5-01 sandbox acceptance probe' })
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id, name: 'bash', argumentsDelta: argumentsJson },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'bash', arguments: argumentsJson } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ],
    paceMs: 10,
  }
}

function textCall(text: string): object {
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text },
      { type: 'block-end', index: 0, block: { type: 'text', text } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
    paceMs: 10,
  }
}

async function createSessionAt(client: DshClient, cwd: string): Promise<string> {
  const { sessionId } = (await client.call('session/create', { request: { cwd } })) as { sessionId: string }
  expect(sessionId, 'session/create returned a sessionId').toBeTypeOf('string')
  return sessionId
}

/** 一个 bash turn：出卡 → allowed-once → 跑完 → 返回 tool/result 帧的 JSON 文本。 */
async function bashTurn(rt: SandboxRuntime, cwd: string, command: string): Promise<string> {
  const sessionId = await createSessionAt(rt.client, cwd)
  const stream = await rt.client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  rt.writeScriptCalls(sessionId, [bashCall(command), textCall('P5-01 完成')])
  const requestId = `p5-01-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  await rt.client.call('session/prompt', { request: { requestId, sessionId, mode: 'queue', content: [{ type: 'text', text: 'P5-01 探针' }] } })
  const deadline = Date.now() + 30_000
  for (;;) {
    const req = rt.feed.frames.find((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId)
    if (req) {
      await rt.feed.answer(req, 'allowed-once')
      break
    }
    if (Date.now() > deadline) throw new Error('approval/request 未到（30s）')
    await new Promise((r) => setTimeout(r, 50))
  }
  const endAt = Date.now() + 60_000
  for (;;) {
    if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
    if (Date.now() > endAt) throw new Error(`turn/end 未到（60s），frames 尾部：${JSON.stringify(frames.slice(-3))}`)
    await new Promise((r) => setTimeout(r, 50))
  }
  stream.cancel()
  void drained
  const result = frames.find((f) => f.type === 'event' && f.event?.type === 'tool/result')
  expect(result, 'tool/result 帧到达').toBeTruthy()
  return JSON.stringify(result)
}

/** RESULT name=value 探针输出 → 表。 */
function probeResults(frameJson: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of frameJson.matchAll(/RESULT ([A-Za-z0-9_]+)=([^\\"\n]+)/g)) out[m[1]] = m[2]
  return out
}

function expectProbe(results: Record<string, string>, name: string, expected: string): void {
  expect(results[name], `探针 ${name}：期望 ${expected}，实际 ${results[name] ?? '<缺失>'}`).toBe(expected)
}

const sha256 = (p: string): string => {
  try { return createHash('sha256').update(readFileSync(p)).digest('hex') } catch { return 'absent' }
}

function setupTestHome(): void {
  rmSync(TEST_HOME, { recursive: true, force: true })
  mkdirSync(join(TEST_HOME, '.ssh'), { recursive: true })
  writeFileSync(join(TEST_HOME, '.ssh', 'sentinel-key'), 'p501-sentinel')
  mkdirSync(join(DATA_DIR, 'workspaces', 'other-bot'), { recursive: true })
  writeFileSync(join(DATA_DIR, 'token-sentinel'), 'p501-token')
  writeFileSync(join(DATA_DIR, 'workspaces', 'other-bot', 'wm'), 'p501')
  writeFileSync(join(DATA_DIR, 'standing-grants.json'), '{}')
  mkdirSync(DEFAULT_DATA_DIR, { recursive: true })
  writeFileSync(join(DEFAULT_DATA_DIR, 'standing-grants.json'), '{}')
}

function netProbeScript(targets: Array<{ name: string; host: string; port: number; dns?: boolean }>): string {
  const cases = targets.map((t) => `  (${t.dns ? 'True' : 'False'}, "${t.name}", "${t.host}", ${t.port})`).join(',\n')
  return `/usr/bin/python3 -I -c '
import socket
cases = [
${cases}
]
for dns, name, host, port in cases:
    try:
        if dns:
            socket.getaddrinfo(host, port)
        else:
            socket.create_connection((host, port), timeout=3).close()
        print("RESULT %s=ok" % name)
    except OSError as e:
        print("RESULT %s=errno%d" % (name, e.errno if e.errno is not None else -99))
'`
}

function shProbe(lines: string[]): string {
  return ['probe() { n="$1"; shift; if "$@" >/dev/null 2>&1; then r=0; else r=1; fi; echo "RESULT $n=$r"; }', ...lines].join('\n')
}

function pyWrite(name: string, path: string, mode: 'w' | 'a'): string {
  return `/usr/bin/python3 -I -c 'import sys
try:
    open(sys.argv[1], sys.argv[2])
    print("RESULT ${name}=written")
except OSError as e:
    print("RESULT ${name}=errno%d" % e.errno)' '${path}' '${mode}'`
}

/** ② 的哨兵批：dsh_session / handoff 探针引用给定 runtime 自己的目录。 */
function maskProbeScript(home: string, handoff: string): string {
  return shProbe([
    `probe home_ssh test -e "$HOME/.ssh"`,
    `probe passwd_ssh test -e '${join(PASSWD_HOME, '.ssh')}'`,
    `probe passwd_codex test -e '${join(PASSWD_HOME, '.codex')}'`,
    `probe data_token test -e '${join(DATA_DIR, 'token-sentinel')}'`,
    `probe data_otherbot test -e '${join(DATA_DIR, 'workspaces', 'other-bot', 'wm')}'`,
    `probe dsh_session test -e '${join(home, 'session-log-sentinel')}'`,
    `probe handoff test -e '${handoff}'`,
    // HOME 外清单两项是普通文件（80/1628 字节）：文件根遮蔽后是空普通文件（f2），test -e 仍 0，用 -s（只看大小）
    `probe ppp_chap test -s /etc/ppp/chap-secrets`,
    // f2 钉死不变量：cat rc=0 且空（旧 --ro-bind /dev/null 原语在 bwrap MS_NODEV 下 rc=1，跨版本漂移）；
    // 类型必须是普通文件（旧原语是字符设备 crw 1,3）
    `probe ppp_cat cat /etc/ppp/chap-secrets`,
    `probe ppp_type test -f /etc/ppp/chap-secrets`,
    `probe ppp_pap test -s /etc/ppp/pap-secrets`,
    'probe bus_sock test -S /run/user/$UID/bus',
    `probe condarc_s test -s '${join(PASSWD_HOME, 'miniconda3', '.condarc')}'`,
    `probe aau_s test -s '${join(PASSWD_HOME, 'miniconda3', 'etc', 'aau_token')}'`,
    `probe tool_python_run '${TOOL_PY}' -c 'print(1)'`,
  ])
}

beforeAll(setupTestHome)

afterAll(async () => {
  for (const rt of runtimes) {
    try { await rt.stop() } catch { /* 已停 */ }
    try { rt.feed.close() } catch { /* 已关 */ }
    rmSync(rt.handoff, { recursive: true, force: true })
  }
  rmSync(join(PKG_ROOT, '.dsh'), { recursive: true, force: true })
  rmSync(join(tmpdir(), 'bot-p5-01-hosttmp-sentinel'), { force: true })
  rmSync(WS3, { recursive: true, force: true })
  rmSync(TEST_HOME, { recursive: true, force: true })
})

it('① 网络：外网 gaierror、三 loopback 拒连；差分 stock stub/dns 可达', async () => {
  const stub = createServer((req, res) => { res.writeHead(200); res.end('p501-stub') })
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', () => resolve()))
  const stubPort = (stub.address() as { port: number }).port
  try {
    const rt = await launchSandbox()
    const gw = Number(new URL(rt.baseUrl).port)
    const frame = await bashTurn(rt, join(TEST_HOME, 'ws1'), netProbeScript([
      { name: 'dns_example', host: 'example.com', port: 443, dns: true },
      { name: 'lo_litellm', host: '127.0.0.1', port: 4001 },
      { name: 'lo_gateway', host: '127.0.0.1', port: gw },
      { name: 'lo_20000', host: '127.0.0.1', port: 20000 },
      { name: 'lo_stub', host: '127.0.0.1', port: stubPort },
    ]))
    const r = probeResults(frame)
    expect(['errno-3', 'errno-2'], `dns 探针：${r.dns_example}`).toContain(r.dns_example)
    expectProbe(r, 'lo_litellm', 'errno111')
    expectProbe(r, 'lo_gateway', 'errno111')
    expectProbe(r, 'lo_20000', 'errno111')
    expectProbe(r, 'lo_stub', 'errno111')

    const stock = await launchSandbox({ extraPatch: stockOverlay(), noDataDir: true })
    const sframe = await bashTurn(stock, join(TEST_HOME, 'ws1s'), netProbeScript([
      { name: 'dns_example', host: 'example.com', port: 443, dns: true },
      { name: 'lo_stub', host: '127.0.0.1', port: stubPort },
    ]))
    const sr = probeResults(sframe)
    expectProbe(sr, 'lo_stub', 'ok')
    expectProbe(sr, 'dns_example', 'ok')
  } finally {
    stub.close()
  }
}, 180_000)

it('② 遮蔽：凭证/数据/交接/D-Bus/HOME 外哨兵不可见，工具链哨兵 -s 为空、bin/python 可执行；宿主 sha256 不变；差分 stock 全 0', async () => {
  const rt = await launchSandbox()
  writeFileSync(join(rt.home, 'session-log-sentinel'), 'p501')
  const credFiles = [join(PASSWD_HOME, 'miniconda3', '.condarc'), join(PASSWD_HOME, 'miniconda3', 'etc', 'aau_token')]
  const before = credFiles.map(sha256)
  const frame = await bashTurn(rt, join(TEST_HOME, 'ws2'), maskProbeScript(rt.home, rt.handoff))
  const r = probeResults(frame)
  expectProbe(r, 'home_ssh', '1')
  expectProbe(r, 'passwd_ssh', '1')
  expectProbe(r, 'passwd_codex', '1')
  expectProbe(r, 'data_token', '1')
  expectProbe(r, 'data_otherbot', '1')
  expectProbe(r, 'dsh_session', '1')
  expectProbe(r, 'handoff', '1')
  expectProbe(r, 'ppp_chap', '1')
  // f2：空普通文件 0644——cat 恒 rc=0、test -f 恒 0（rc 与类型双钉死，不再 [01] 漂移）
  expectProbe(r, 'ppp_cat', '0')
  expectProbe(r, 'ppp_type', '0')
  expectProbe(r, 'ppp_pap', '1')
  expectProbe(r, 'bus_sock', '1')
  // v2.1：工具链文件根被 /dev/null 覆盖 → test -e 仍 0，用 -s（只看大小不读内容）
  expectProbe(r, 'condarc_s', '1')
  expectProbe(r, 'aau_s', '1')
  expectProbe(r, 'tool_python_run', '0')
  expect(credFiles.map(sha256)).toEqual(before)

  const stock = await launchSandbox({ extraPatch: stockOverlay(), noDataDir: true })
  writeFileSync(join(stock.home, 'session-log-sentinel'), 'p501')
  const sframe = await bashTurn(stock, join(TEST_HOME, 'ws2s'), maskProbeScript(stock.home, stock.handoff))
  const sr = probeResults(sframe)
  for (const name of ['home_ssh', 'passwd_ssh', 'passwd_codex', 'data_token', 'data_otherbot', 'ppp_chap', 'ppp_pap', 'bus_sock', 'condarc_s', 'aau_s']) {
    expectProbe(sr, name, '0')
  }
  // f2 差分：stock 的 /etc/ppp/chap-secrets 是真实 root:0600 文件 → cat EACCES rc=1、
  // 类型普通文件 0；加固侧被空普通文件 0644 覆盖 → cat rc=0（方向：遮蔽后更可读但零字节）
  expectProbe(sr, 'ppp_cat', '1')
  expectProbe(sr, 'ppp_type', '0')
  // 既有防护命中（标注，不计入本 slug 防线）：stock 的 --tmpfs /tmp 同样遮住 /tmp 下的
  // DSH_HOME 与 handoff（R5 §①），两侧同为退出码 1
  expectProbe(sr, 'dsh_session', '1')
  expectProbe(sr, 'handoff', '1')
  expectProbe(sr, 'tool_python_run', '0')
}, 180_000)

it('③ 写：cwd 宿主可见；$HOME 外与 cwd 外写不落宿主；cwd 同级与 /var/tmp EROFS（既有，标注）', async () => {
  // 工作区放 /var/tmp 下（ro-bind / / 的只读区）：../outside 才是确定性的 EROFS 探针。
  // TEST_HOME 内的工作区父目录是遮蔽 tmpfs，../outside 会被 tmpfs 吸收（宿主同样不存在）。
  const ws3 = WS3
  rmSync(ws3, { recursive: true, force: true })
  mkdirSync(ws3, { recursive: true })
  const rt = await launchSandbox()
  const frame = await bashTurn(rt, ws3, [
    'echo p501 > inside3',
    'echo p501 > "$HOME/outside-h"',
    pyWrite('cwd_outside', '../outside-c', 'w'),
    pyWrite('var_tmp', '/var/tmp/bot-p5-outside', 'w'),
  ].join('\n'))
  const r = probeResults(frame)
  expect(existsSync(join(ws3, 'inside3')), '$CWD 写入宿主可见').toBe(true)
  expect(existsSync(join(TEST_HOME, 'outside-h')), '$HOME/outside 不落宿主').toBe(false)
  expect(existsSync('/var/tmp/outside-c'), '$CWD/../outside 不落宿主').toBe(false)
  // 既有防护命中（stock 同拦，不计入本 slug 防线）：EROFS 30
  expectProbe(r, 'cwd_outside', 'errno30')
  expectProbe(r, 'var_tmp', 'errno30')

}, 180_000)

it('④ 宿主 /tmp 预置哨兵不可见（既有防护：--tmpfs /tmp，stock 同拦，标注不计入）', async () => {
  const sentinel = join(tmpdir(), 'bot-p5-01-hosttmp-sentinel')
  writeFileSync(sentinel, 'p501')
  const rt = await launchSandbox()
  const frame = await bashTurn(rt, join(TEST_HOME, 'ws4'), shProbe([`probe hosttmp test -e ${sentinel}`]))
  expectProbe(probeResults(frame), 'hosttmp', '1')
}, 120_000)

it('⑤ fail closed：wrapper 文件缺失（Errno 2 诊断）与内部错误（bwrap: 前缀），命令未执行、标记不存在', async () => {
  const missingWrap = join(mkdtempSync(join(tmpdir(), 'p5-01-missing-')), 'bwrap-wrap.py')
  const rtA = await launchSandbox({ extraPatch: runnerOverlay(['/usr/bin/python3', '-I', missingWrap]) })
  const wsA = join(TEST_HOME, 'ws5a')
  mkdirSync(wsA, { recursive: true })
  const frameA = await bashTurn(rtA, wsA, 'echo ran > f5a-marker')
  expect(frameA).toContain("can't open file")
  expect(frameA).toContain('[Errno 2]')
  expect(frameA).not.toContain('RESULT')
  expect(existsSync(join(wsA, 'f5a-marker')), '命令未执行：标记不存在').toBe(false)

  const rtB = await launchSandbox({ extraPatch: runnerOverlay(['/usr/bin/python3', '-I', join(PKG_ROOT, 'sandbox', 'bwrap-wrap.py'), '--home']) })
  const wsB = join(TEST_HOME, 'ws5b')
  mkdirSync(wsB, { recursive: true })
  const frameB = await bashTurn(rtB, wsB, 'echo ran > f5b-marker')
  expect(frameB).toContain('bwrap: ')
  expect(frameB).not.toContain('RESULT')
  expect(existsSync(join(wsB, 'f5b-marker')), '命令未执行：标记不存在').toBe(false)
}, 180_000)

it('⑥ 工具链：command -v python / sys.prefix 与宿主一致；写 sys.prefix EROFS', async () => {
  const rt = await launchSandbox()
  const hostCv = spawnSync('/bin/bash', ['-c', 'command -v python'], { encoding: 'utf8' }).stdout.trim()
  const hostPrefix = spawnSync(hostCv, ['-I', '-c', 'import sys; print(sys.prefix)'], { encoding: 'utf8' }).stdout.trim()
  expect(hostCv, '宿主 command -v python 是 miniconda 的').toBe(TOOL_PY)
  const frame = await bashTurn(rt, join(TEST_HOME, 'ws6'), [
    'echo "RESULT cvpython=$(command -v python)"',
    'echo "RESULT sysprefix=$("$(command -v python)" -I -c \'import sys; print(sys.prefix)\')"',
    `"$(command -v python)" -I -c 'import sys
try:
    open(sys.prefix + "/p501-prefix-probe", "w")
    print("RESULT write_prefix=written")
except OSError as e:
    print("RESULT write_prefix=errno%d" % e.errno)'`,
  ].join('\n'))
  const r = probeResults(frame)
  expectProbe(r, 'cvpython', hostCv)
  expectProbe(r, 'sysprefix', hostPrefix)
  expectProbe(r, 'write_prefix', 'errno30')
}, 120_000)

it('⑦ cwd = DSH_HOME 祖先：按实现写死 A（再遮）——哨兵退出码 1，命令照常执行', async () => {
  const dshHome = join(TEST_HOME, 'rt7', 'dsh-home')
  mkdirSync(dshHome, { recursive: true })
  writeFileSync(join(dshHome, 'session-log-sentinel'), 'p501')
  const rt = await launchSandbox({ env: { P2SDK_HOME: dshHome } })
  const ws = join(TEST_HOME, 'rt7')
  const frame = await bashTurn(rt, ws, [
    shProbe([`probe dshhome_sentinel test -e '${join(dshHome, 'session-log-sentinel')}'`]),
    'touch marker7',
  ].join('\n'))
  expectProbe(probeResults(frame), 'dshhome_sentinel', '1')
  expect(existsSync(join(ws, 'marker7')), '选实现 A：命令照常执行').toBe(true)
}, 120_000)

it('⑧ cwd=PKG_ROOT/仓根：策略代码只读 EROFS、sha 不变、PKG_ROOT/.dsh 哨兵不可见；cwd=$HOME 拒绝（差分 stock 执行）', async () => {
  const dshHome = join(PKG_ROOT, '.dsh')
  mkdirSync(dshHome, { recursive: true })
  writeFileSync(join(dshHome, 'session-log-sentinel'), 'p501')
  const rt = await launchSandbox({ env: { P2SDK_HOME: dshHome } })
  const wrapPath = join(PKG_ROOT, 'sandbox', 'bwrap-wrap.py')
  const skillMd = join(REPO_ROOT, '.claude', 'skills', 'grok-orchestrate', 'SKILL.md')
  const hooksPy = join(REPO_ROOT, '.claude', 'hooks', 'process_guard.py')
  // worktree 下 .git 是指针文件：gitdir 指向主仓对象库（policyRoots 解析后只读挂载）
  let gitdirHead = join(REPO_ROOT, '.git', 'HEAD')
  if (!existsSync(gitdirHead)) {
    const m = /^gitdir: (.+)$/m.exec(readFileSyncNode(join(REPO_ROOT, '.git'), 'utf8'))
    gitdirHead = m ? join(m[1].trim(), 'HEAD') : gitdirHead
  }
  const before = [wrapPath, skillMd, gitdirHead].map(sha256)

  const frameA = await bashTurn(rt, PKG_ROOT, [
    pyWrite('wrap_append', 'sandbox/bwrap-wrap.py', 'a'),
    pyWrite('guard_append', 'src/policy/guard.mjs', 'a'),
    `if [ -e '${join(dshHome, 'session-log-sentinel')}' ]; then echo "RESULT dotdsh=0"; else echo "RESULT dotdsh=1"; fi`,
  ].join('\n'))
  const rA = probeResults(frameA)
  expectProbe(rA, 'wrap_append', 'errno30')
  expectProbe(rA, 'guard_append', 'errno30')
  expectProbe(rA, 'dotdsh', '1')

  // 布局分歧（P5-01.f1）：主仓检出的 TEST_HOME（决策 8 的 .test-homes/）在仓根之下
  // → cwd=仓根即「工作区是 HOME 祖先」→ 决策 13 ④ wrapper fail-closed 拒绝运行，
  // 探针一律不执行；worktree 布局仓根在 /tmp 下不含任何 HOME，探针照常跑。
  const repoRootContainsHome = [TEST_HOME, PASSWD_HOME].some(
    (h) => h === REPO_ROOT || h.startsWith(`${REPO_ROOT}/`),
  )
  const frameB = await bashTurn(rt, REPO_ROOT, [
    pyWrite('skill_append', skillMd, 'a'),
    pyWrite('hook_append', hooksPy, 'a'),
    pyWrite('githead_append', join(REPO_ROOT, '.git', 'HEAD'), 'a'),
    pyWrite('gitdirhead_append', gitdirHead, 'a'),
  ].join('\n'))
  if (repoRootContainsHome) {
    expect(frameB).toContain('bwrap: ')
    expect(frameB).toContain('refusing to run')
    expect(frameB, '主仓布局：wrapper 拒绝后探针不执行').not.toContain('RESULT')
  } else {
    const rB = probeResults(frameB)
    expectProbe(rB, 'skill_append', 'errno30')
    // hooks 目录是主仓未跟踪内容：主仓在=EROFS(30)，worktree 缺目录=ENOENT(2)（两布局各写死）
    expectProbe(rB, 'hook_append', existsSync(join(REPO_ROOT, '.claude', 'hooks')) ? 'errno30' : 'errno2')
    // .git 在主仓是目录（EROFS）；worktree 是指针文件（ENOTDIR=20）。对象库另由 gitdir 探针覆盖
    expectProbe(rB, 'githead_append', existsSync(join(REPO_ROOT, '.git', 'HEAD')) ? 'errno30' : 'errno20')
    expectProbe(rB, 'gitdirhead_append', 'errno30')
  }

  expect([wrapPath, skillMd, gitdirHead].map(sha256)).toEqual(before)
  // P5-02 起 src/policy/guard.mjs 真实存在（bash 侧 append 探针 errno30 与
  // 上行 sha 断言共同证明没被写入；guard 侧写保护另由 guard-fs.test.ts ⑦ 覆盖）

  const frameC = await bashTurn(rt, TEST_HOME, 'echo ran > marker-home8')
  expect(frameC).toContain('bwrap: ')
  expect(existsSync(join(TEST_HOME, 'marker-home8')), 'wrapper 拒绝：标记不存在').toBe(false)
  const stock = await launchSandbox({ extraPatch: stockOverlay(), noDataDir: true })
  await bashTurn(stock, TEST_HOME, 'echo ran > marker-home8')
  expect(existsSync(join(TEST_HOME, 'marker-home8')), 'stock 差分：cwd=$HOME 时照常执行').toBe(true)
  rmSync(join(TEST_HOME, 'marker-home8'), { force: true })
}, 240_000)

it('⑨ 数据根：未设 PBOTS_DATA_DIR 恰 1 行 WARN、cwd=缺省数据根时授权哨兵 test -s 退出码 1（差分 stock 0）；env 不含两变量；相对路径拒绝', async () => {
  const rt = await launchSandbox({ noDataDir: true })
  const warnLines = rt.readStderr().split('\n').filter((l) => /^WARN p2sdk: PBOTS_DATA_DIR unset/.test(l))
  expect(warnLines, 'WARN 恰 1 行').toHaveLength(1)
  const frame = await bashTurn(rt, DEFAULT_DATA_DIR, [
    shProbe([
      `probe grants_s test -s '${join(DEFAULT_DATA_DIR, 'standing-grants.json')}'`,
      `probe env_data sh -c 'env | grep -q "^PBOTS_DATA_DIR="'`,
      `probe env_mask sh -c 'env | grep -q "^P2SDK_SANDBOX_MASK="'`,
    ]),
  ].join('\n'))
  const r = probeResults(frame)
  expectProbe(r, 'grants_s', '1')
  expectProbe(r, 'env_data', '1')
  expectProbe(r, 'env_mask', '1')

  const stock = await launchSandbox({ extraPatch: stockOverlay(), noDataDir: true })
  const sframe = await bashTurn(stock, DEFAULT_DATA_DIR, shProbe([`probe grants_s test -s '${join(DEFAULT_DATA_DIR, 'standing-grants.json')}'`]))
  expectProbe(probeResults(sframe), 'grants_s', '0')

  for (const [name, env] of [
    ['PBOTS_DATA_DIR', { PBOTS_DATA_DIR: 'rel/data' }],
    ['P2SDK_SANDBOX_MASK', { P2SDK_SANDBOX_MASK: 'rel/mask' }],
  ] as const) {
    const home = mkdtempSync(join(tmpdir(), 'p5-01-relerr-'))
    const res = spawnSync(process.execPath, [join(PKG_ROOT, 'scripts', 'start.mjs')], {
      env: { PATH: process.env.PATH!, HOME: TEST_HOME, P2SDK_PROVIDER: 'mock', P2SDK_HOME: home, P2SDK_HANDOFF: join(home, 'ho'), ...env },
      encoding: 'utf8',
      timeout: 30_000,
    })
    expect(res.status, `${name} 相对路径必须非零退出`).not.toBe(0)
    expect(res.stderr).toContain(name)
    rmSync(home, { recursive: true, force: true })
  }
}, 180_000)
