// P5-22 验收（PLAN p5-parity P5-22 选 ⑤，D-1 定稿 ⑤ + 席 A 收紧，v2.1 loopback）：
// ① request_network{reason,command} 出卡（toolName、reason 含完整命令），每次
//    ASK；批准后许可文件出现在数据根 network-permits/。
// ② 联网态（许可命中，真跑 slirp4netns supervisor）四类探针 + 差分：
//    (a) 网关别名 10.0.2.2:<lo-stub> → errno 101（ENETUNREACH，本机 spike 实测）；
//    差分（P2SDK_TEST_SLIRP_NO_LOOPBACK_GUARD 去掉 --disable-host-loopback）→
//    连上宿主 lo stub（探针有效性证明）；(b) 代理 CONNECT 到网关别名 → 防护态
//    connect 即拒；差分态 HTTP/1.1 200；(c) localhost 字面量 → errno 111（用户
//    态网络栈下两侧都是沙箱自身 lo，标既有防护命中）；(d) 直连 127.0.0.1 → 111。
//    正向出口：宿主 LAN IP stub 可达（非 loopback 经 NAT）+ 专用 resolv.conf。
// ③ 一次性：用后即删；同命令第二次断网；A 许可跑 B 命令断网；过期许可断网且被
//    清理；另一会话不受许可影响（session 绑定）。
// ④ 哨兵：联网升权态 bash 内凭证哨兵与 /run/user/$UID/bus 仍不可见、许可目录
//    test -e 退出码 1。
// ⑤ fail closed：P2SDK_TEST_SLIRP_BIN 指向不存在路径 + 有效许可 → 命令不跑
//    （marker 未写、工具 isError = runner failure），绝不静默断网跑。
// dfa 照拒由 guard-escalation（P5-04）与全量回归承担，本文件不重复。
// 全部经真实 launcher + fake LLM；HOME=app/sdk/.test-homes/p5-22（P5-06：工作
// 区放数据根 workspaces/ 下）；stub 只在测试进程内现场起（不碰真实服务）；测试
// 只结束自己 spawn 的子进程（runtimes 数组 afterAll stop），不用 pkill。
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { networkInterfaces } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '../support/fake/harness.ts'
import { issuePermit } from '../../src/policy/request-net.mjs'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TEST_HOME = join(PKG_ROOT, '.test-homes', 'p5-22')
const DATA_DIR = join(TEST_HOME, 'pbots-data')
const PERMIT_DIR = join(DATA_DIR, 'network-permits')
const WS = join(DATA_DIR, 'workspaces', 'x')
const SSH_SENTINEL = join(TEST_HOME, '.ssh', 'known_hosts')

interface EventsFrame {
  type: string
  event?: string
  eventId?: string
  agentId?: string
  request?: { toolName?: string; reason?: string }
}

interface Feed {
  frames: EventsFrame[]
  answer(frame: EventsFrame, value: string): Promise<unknown>
  close(): void
}

interface Session {
  sessionId: string
  /** 跑下一个 turn；answer='none' 断言零卡（出卡即超时红）。 */
  next(answer?: 'rejected' | 'allowed-once' | 'none'): Promise<Frame[]>
  /** 追加一段脚本再跑一个 turn（手写许可的差分 / 失败用例）。 */
  run(call: object, answer?: 'none'): Promise<Frame[]>
}

interface NetRuntime extends Runtime {
  feed: Feed
  toolTexts(sessionId: string): string
}

const runtimes: NetRuntime[] = []
let loPort = 0
let lanPort = 0
let hostIp = ''

/** 探针 python 源（bash 单引号内的换行/缩进安全；单行 JSON 输出）。 */
function probePy(): string {
  return [
    'import json,socket',
    'def c(h,p):',
    ' s=socket.socket();s.settimeout(3)',
    ' try:',
    '  s.connect((h,p));return "conn"',
    ' except OSError as e:return e.errno',
    ' finally:s.close()',
    'def cx(h,p):',
    ' s=socket.socket();s.settimeout(3)',
    ' try:',
    '  s.connect((h,p));s.sendall(("CONNECT 127.0.0.1:%d HTTP/1.1\\r\\nHost: x\\r\\n\\r\\n"%p).encode());return s.recv(12).decode("latin1","replace")[:12]',
    ' except OSError as e:return e.errno',
    ' finally:s.close()',
    'def dns(n):',
    ' try:return socket.getaddrinfo(n,443)[0][4][0]',
    ' except socket.gaierror as e:return "gai%d"%e.errno',
    `o={"gw":c("10.0.2.2",${loPort}),"cx":cx("10.0.2.2",${loPort}),"lh":c("localhost",${loPort}),"d127":c("127.0.0.1",${loPort}),"lan":c("${hostIp}",${lanPort}),"dns":dns("example.com"),"resolv":open("/etc/resolv.conf").read().strip()}`,
    'print(json.dumps(o))',
  ].join('\n')
}

function probeCommand(): string {
  return `/usr/bin/python3 -I -c '${probePy()}'`
}

/** 哨兵与许可目录可见性（联网态同一条命令里跑：批准升权后仍不可见/恒空）。 */
function sentryCommand(): string {
  return `test -e '${join(TEST_HOME, '.ssh')}'; echo "sent=$?:${join(TEST_HOME, '.ssh')}"; test -e '${SSH_SENTINEL}'; echo "sent=$?:${SSH_SENTINEL}"; test -e /etc/ppp/chap-secrets; echo "pppe=$?"; echo "ppp-bytes=$(cat /etc/ppp/chap-secrets 2>/dev/null | wc -c)"; test -e "/run/user/$(id -u)/bus"; echo "bus=$?"; test -e '${PERMIT_DIR}'; echo "permits=$?"`
}

function fakeOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p5-22-patch-'))
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

async function launchNet(env: Record<string, string> = {}): Promise<NetRuntime> {
  clearRealKeys()
  const rt = await launchRuntime({
    env: {
      HOME: TEST_HOME,
      P2SDK_HOME: join(TEST_HOME, 'dsh-' + Math.random().toString(16).slice(2, 8)),
      P2SDK_PATCH: fakeOverlay(),
      PBOTS_DATA_DIR: DATA_DIR,
      ...env,
    },
  })
  const client: DshClient = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const stream = await client.socket.open('$events', {})
  const frames: EventsFrame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f as EventsFrame) })().catch(() => {})
  await waitFor(frames as unknown as Frame[], (f) => f.type === 'ready', 5000, '$events ready')
  const clientId = frames.find((f) => f.type === 'ready')?.clientId ?? ''
  const feed: Feed = {
    frames,
    answer: (frame, value) =>
      client.call('$events/result', { clientId, eventId: frame.eventId, outcome: { kind: 'result', value } }),
    close() { stream.cancel(); void drained; client.close() },
  }
  const t: NetRuntime = {
    ...rt,
    feed,
    toolTexts(sessionId) {
      let raw = ''
      try { raw = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8') } catch { return '' }
      const lines = raw.trim().split('\n').filter(Boolean)
        .map((line) => JSON.parse(line) as { sessionId?: string, toolResults?: Array<{ toolCallId: string | null, isError: boolean, text: string }> })
      const mine = lines.filter((l) => l.sessionId === sessionId)
      // P5-06：toolResults 逐轮累积——拼全部轮次文本，探针 JSON 取最后一次出现
      return mine.flatMap((l) => l.toolResults ?? []).map((r) => (r.isError ? `[isError] ${r.text}` : r.text)).join('\n')
    },
  }
  runtimes.push(t)
  return t
}

/** 模拟 main（P5-29 前的测试替身）：bash 免卡（第 1 行 sandbox-allow 门开）。 */
function provision(rt: Runtime): void {
  const token = readFileSync(join(rt.handoff, 'launch-token'), 'utf8').trim()
  const instance = createHash('sha256').update(token).digest('hex')
  writeFileSync(join(DATA_DIR, 'policy-state.json'), JSON.stringify({ version: 1, paused: false, instance }))
}

function toolTurnCall(name: string, args: object): object {
  const id = `p5-22-${Math.random().toString(16).slice(2, 8)}`
  const argumentsJson = JSON.stringify(args)
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsJson.slice(0, 5) },
      { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsJson.slice(5) },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: argumentsJson } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ],
    paceMs: 10,
  }
}

function bashTurnCall(command: string): object {
  return toolTurnCall('bash', { command, description: 'P5-22 probe' })
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

/** 一个会话；脚本一次性写全（P5-03：fake 游标按会话持有，二次覆盖会脱同步）。 */
async function scriptedSession(h: NetRuntime, calls: object[]): Promise<Session> {
  const { sessionId } = (await h.client.call('session/create', { request: { cwd: WS } })) as { sessionId: string }
  expect(sessionId).toBeTypeOf('string')
  const script: object[] = [...calls]
  const flush = () => {
    const dir = join(h.home, 'fake', 'scripts')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls: script.flatMap((c) => [c, textCall('P5-22 完成')]) }))
  }
  flush()
  const answered = new Set<string>()
  const turn = async (answer: string): Promise<Frame[]> => {
    const stream = await h.client.follow(sessionId)
    const frames: Frame[] = []
    const drained = (async () => { for await (const f of stream) frames.push(f) })()
    await h.client.call('session/prompt', {
      request: { requestId: `p5-22-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'P5-22 探针' }] },
    })
    const deadline = Date.now() + 90_000
    for (;;) {
      if (answer !== 'none') {
        for (const f of h.feed.frames) {
          if (f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId && !answered.has(f.eventId ?? '')) {
            answered.add(f.eventId ?? '')
            await h.feed.answer(f, answer)
          }
        }
      }
      if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
      if (Date.now() > deadline) {
        throw new Error(`turn/end 未到；answered=${answered.size}；cards=${h.feed.frames.filter((f) => f.event === 'approval/request' && f.agentId === sessionId).length}；尾部：${JSON.stringify(frames.slice(-4)).slice(0, 400)}`)
      }
      await new Promise((r) => setTimeout(r, 50))
    }
    stream.cancel()
    void drained
    return frames
  }
  let cursor = 0
  return {
    sessionId,
    next: (answer = 'rejected') => {
      cursor += 1
      return turn(answer)
    },
    run: (call, answer = 'none' as const) => {
      script.push(call)
      flush() // 重写含旧段的完整脚本：fake 按会话游标取第 N 段，追加不脱同步（P5-03）
      cursor += 1
      return turn(answer)
    },
  }
}

/** 从 bash 工具结果解析探针 JSON（取最后一次出现的 {"gw"…} 行）。 */
function parseProbe(texts: string): Record<string, unknown> {
  const matches = [...texts.matchAll(/\{"gw".*?\}/g)]
  const m = matches.at(-1)
  if (m === undefined) throw new Error(`probe JSON not found in tool results: ${texts.slice(0, 600)}`)
  return JSON.parse(m[0]) as Record<string, unknown>
}

function permitCount(): number {
  try { return readdirSync(PERMIT_DIR).length } catch { return 0 }
}

beforeAll(async () => {
  mkdirSync(join(TEST_HOME, '.ssh'), { recursive: true })
  writeFileSync(SSH_SENTINEL, 'sentinel\n')
  mkdirSync(WS, { recursive: true })
  rmSync(PERMIT_DIR, { recursive: true, force: true })

  // 宿主侧 stub：lo（127.0.0.1；回 CONNECT 200——差分格的代理 CONNECT 靶）与
  // lan（0.0.0.0；正向出口靶）。都不碰真实服务。
  const lo = createServer((s) => { s.once('data', () => s.end('HTTP/1.1 200 Connection established\r\n\r\n')) })
  const lan = createServer((s) => { s.once('data', () => s.end('stub:lan\n')) })
  await new Promise<void>((r) => lo.listen(0, '127.0.0.1', r))
  await new Promise<void>((r) => lan.listen(0, '0.0.0.0', r))
  loPort = (lo.address() as AddressInfo).port
  lanPort = (lan.address() as AddressInfo).port
  hostIp = Object.values(networkInterfaces()).flat().find((i) => i !== null && i.family === 'IPv4' && !i.internal)?.address ?? ''
  if (hostIp === '') throw new Error('no non-internal IPv4 address for the LAN exit probe')
})

afterAll(async () => {
  for (const rt of runtimes) {
    rt.feed.close()
    await rt.stop()
  }
})

describe('P5-22 受控升权 ⑤：签发 → 一次性联网 → 断网回退', () => {
  it('① 出卡（toolName/reason 含完整命令）→ 批准签发 → ② 联网态四类探针 + 出口 + 哨兵；用后即删', async () => {
    const h = await launchNet()
    provision(h)
    const cmd = `${probeCommand()}; ${sentryCommand()}`
    const s = await scriptedSession(h, [
      toolTurnCall('request_network', { reason: 'verify controlled network escalation', command: cmd }),
      bashTurnCall(cmd),
    ])
    await s.next('allowed-once')

    // ① 卡：toolName 正确、reason 含完整命令 + 会话范围 + 期限（A3 的 reason 载荷）
    const card = h.feed.frames.find((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === s.sessionId)
    expect(card, 'approval card emitted').toBeTruthy()
    expect(card!.request?.toolName).toBe('request_network')
    expect(card!.request?.reason).toContain('command: /usr/bin/python3 -I -c')
    expect(card!.request?.reason).toContain('verify controlled network escalation')
    expect(card!.request?.reason).toContain('single use')
    expect(permitCount(), '批准后许可文件已签发').toBe(1)

    // ② 联网态探针（真跑 slirp4netns supervisor）
    await s.next('none')
    const texts = h.toolTexts(s.sessionId)
    const p = parseProbe(texts)
    expect(p.gw, '网关别名（--disable-host-loopback）→ ENETUNREACH 101').toBe(101)
    expect(p.cx, '代理 CONNECT 网关别名 → 连接即拒 101').toBe(101)
    expect(p.lh, 'localhost 字面量 → 自身 lo 111').toBe(111)
    expect(p.d127, '直连 127.0.0.1 → 自身 lo 111').toBe(111)
    expect(p.lan, `非 loopback 出口（宿主 ${hostIp}:${lanPort}）可达`).toBe('conn')
    expect(String(p.dns), '专用 resolv.conf(1.1.1.1) 真解析').toMatch(/^[0-9a-f.:]+$/)
    expect(String(p.resolv)).toBe('nameserver 1.1.1.1')
    // ④ 哨兵（联网升权态仍不可见；known_hosts 宿主侧存在，rc=1 证遮蔽而非缺失；
    // chap-secrets 是文件级遮蔽 → P5-01.f2 语义：存在但恒空）
    for (const path of [join(TEST_HOME, '.ssh'), SSH_SENTINEL]) {
      expect(texts, `sentinel masked while networked: ${path}`).toContain(`sent=1:${path}`)
    }
    expect(texts).toMatch(/bus=1/)
    expect(texts).toContain('permits=1')
    expect(texts).toMatch(/pppe=0/) // 文件被空内容顶替（类型恒普通文件）
    expect(texts).toMatch(/ppp-bytes=0/) // 内容恒空——凭证读不出
    // ③ 用后即删
    expect(permitCount(), '许可已被获准执行消耗').toBe(0)
  }, 180_000)

  it('③ 同命令第二次断网（宿主 loopback 即拒、LAN 出口与外网 DNS 均失败）', async () => {
    const h = await launchNet()
    provision(h)
    const s = await scriptedSession(h, [bashTurnCall(probeCommand())])
    await s.next('none')
    const p = parseProbe(h.toolTexts(s.sessionId))
    expect(p.gw).toBe(101)
    expect(p.lh).toBe(111)
    expect(p.d127).toBe(111)
    expect(p.lan, '无许可时非 loopback 出口不可达').not.toBe('conn')
    expect(String(p.dns), 'DNS failure（R5 实测 gaierrno -3/-2）').toMatch(/^gai-?\d+$/)
    expect(String(p.resolv)).not.toBe('nameserver 1.1.1.1')
  }, 120_000)

  it('③ A 许可跑 B 命令断网 + 另一会话不受影响 + 手写许可联网 + 过期许可断网且被清理', async () => {
    const h = await launchNet()
    provision(h)
    const sA = await scriptedSession(h, [])
    const sB = await scriptedSession(h, [])

    // A 会话 + cmdA 的许可（手写：直测 wrapper 校验面）
    issuePermit({ dir: PERMIT_DIR, session: sA.sessionId, command: probeCommand(), ttlMs: 60_000 })
    // B 命令（同会话）：argvHash 不匹配 → 断网、许可不消耗
    await sA.run(bashTurnCall("/usr/bin/python3 -I -c 'print(42)'"))
    expect(permitCount(), 'argv 不匹配的许可不被消耗').toBe(1)
    // 另一会话同命令：session 不匹配 → 断网（B 会话输出同探针，许可不消耗即证断网）
    await sB.run(bashTurnCall(probeCommand()))
    expect(permitCount(), 'session 不匹配的许可不被消耗').toBe(1)
    // A 会话 + A 命令：命中 → 联网（手写许可与 wrapper 校验面的正向闭环）
    await sA.run(bashTurnCall(probeCommand()))
    expect(permitCount(), '命中后用后即删').toBe(0)
    expect(parseProbe(h.toolTexts(sA.sessionId)).lan, '手写许可同样联网').toBe('conn')
    // 过期许可：真跑（断网执行）→ wrapper 清理
    issuePermit({ dir: PERMIT_DIR, session: sA.sessionId, command: probeCommand(), ttlMs: -1000 })
    await sA.run(bashTurnCall(probeCommand()))
    expect(permitCount(), '过期许可被 wrapper 清理').toBe(0)
    expect(parseProbe(h.toolTexts(sA.sessionId)).lan, '过期许可下命令照常断网执行（fail closed 不 fail dead）').not.toBe('conn')
  }, 180_000)

  it('② 差分：去掉 --disable-host-loopback 后网关别名必命中（连上 lo stub + CONNECT 200）', async () => {
    const h = await launchNet({ P2SDK_TEST_SLIRP_NO_LOOPBACK_GUARD: '1' })
    provision(h)
    const s = await scriptedSession(h, [])
    issuePermit({ dir: PERMIT_DIR, session: s.sessionId, command: probeCommand(), ttlMs: 60_000 })
    await s.run(bashTurnCall(probeCommand()))
    const p = parseProbe(h.toolTexts(s.sessionId))
    expect(p.gw, '差分：10.0.2.2 → 宿主 127.0.0.1 lo stub（否则判探针无效）').toBe('conn')
    expect(String(p.cx), '差分：代理 CONNECT 经网关别名到宿主 lo → 200').toContain('HTTP/1.1 2')
    expect(p.lh, 'localhost 在用户态网络栈下仍是沙箱自身 lo（既有防护）').toBe(111)
    expect(p.d127).toBe(111)
  }, 120_000)

  it('⑤ fail closed：slirp 不可用 + 有效许可 → 命令不跑（marker 未写、isError）', async () => {
    const h = await launchNet({ P2SDK_TEST_SLIRP_BIN: '/nonexistent-slirp-helper' })
    provision(h)
    const marker = join(WS, 'p5-22-failclosed-marker')
    const cmd = `echo ran > '${marker}'`
    const s = await scriptedSession(h, [])
    issuePermit({ dir: PERMIT_DIR, session: s.sessionId, command: cmd, ttlMs: 60_000 })
    await s.run(bashTurnCall(cmd))
    expect(existsSync(marker), 'helper 失败时命令必须不跑').toBe(false)
    expect(h.toolTexts(s.sessionId), 'runner failure 以工具错误浮出（含 bwrap: 前缀诊断）').toContain('[isError]')
  }, 120_000)
})
