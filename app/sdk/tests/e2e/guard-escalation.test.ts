// P5-04 验收 ①–④（PLAN p5-parity 0d，G#5 前半，决策 10）：拒绝裸升权。
// guard.mjs 对任何工具 arguments.sandbox_permissions === 'danger-full-access'
// → deny（固定字面串 'escalation path not available'，v2.1 定死，P5-05 ② /
// P5-06 按此断言），判定插在 NEVER_TOOLS 之后、路径判定之前。堵的是真实
// 无沙箱路径（上游证据：bash-sandbox index.ts:92-100 mode===dfa 直接
// super.execute 不进 wrapper；sandbox/escalation.ts:30-31 WIDER_MODES 里
// dfa 是一切模式的升权终点；write/edit 同参数名，fs 工具 dfa 调用不受
// fs-sandbox 约束）。全部经真实 launcher + fake LLM，HOME=.test-homes/p5-04
//（决策 8）；哨兵是合成文件，只验证存在性/内容回读，不碰真实凭证。
// ① bash `cat <哨兵>` 带 dfa 参数 → deny、asked === 0、标记文件不存在；
// ② write / edit 带同参数写工作区外 → deny（原因必须是 dfa 字面串，不是
//    P5-02 的路径原因）、宿主无新文件 / 原文件不变、asked === 0；
// ③ 差分：stock（禁用 p2sdk-fs-guard）下同一 bash 产生 approval/asked，
//    批准后确实读到哨兵（无沙箱执行真发生了）；
// ④ 不带升权参数的普通 bash 行为与合入前一致：出卡 1 次、批准后执行成功。
// P5-04.f1 补格（PLAN P5-04 行 ④⑤）：
// ④b DSH_PERMISSION_MODE=danger-full-access 启动态（bash 侧 P5-05 的 never
//    已拒，文件工具侧补齐）：bash / write 工作区外 → 会话级 deny（字面串
//    'danger-full-access session mode is not supported'，先于 P5-02 路径判定）、
//    asked === 0、无副作用；read 工作区文件不受影响（不越界收紧）。
// ⑤ 顺序格：测试 patch 组合「有效模式 = dfa 且 approval ≠ never」（整键覆盖
//    base 的 approval 行 policy=ask + permission 行 dfa preset 的 approval=ask，
//    derive 的组合默认 (dfa, ask) 才有 preset 可匹配、新 session 才钉得住），
//    普通 bash（无参数，shell-ask 必返回 ask，shell-ask.mjs:49）→ guard 先拦：
//    deny 且 asked === 0、原因是 guard 字面串；差分：同组合不挂 guard →
//    asked === 1（guard 若排在 shell-ask 后，本格必红——shell-ask 的 ask 不调
//    next()，guard 永远不执行）。
// fake 插件按会话持内存游标（REPORT-P5-03 坑 1）：每 turn 新会话。
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { uniqueTestHome } from '../support/sandbox-home.ts'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '../support/fake/harness.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TEST_HOME = uniqueTestHome('p5-04') // P5-H3：运行级唯一（防并行全量互踩哨兵）
const DATA_DIR = join(TEST_HOME, 'pbots-data')
/** P5-04 v2.1 定死的 deny 字面串（与 src/policy/guard.mjs 同源断言）。 */
export const DFA_REASON = 'escalation path not available'
/** P5-04.f1 会话级字面串（PLAN P5-04 行 ②，v2.1 定死；P5-05 ② 枚举集成员）。 */
export const DFA_SESSION_REASON = 'danger-full-access session mode is not supported'
/** 合成哨兵：wrapper 遮蔽的 $HOME/.ssh 下（P5-01 ②：加固 bash test -e 退出码 1）。 */
const SENTINEL = join(TEST_HOME, '.ssh', 'dfa-sentinel')
const SENTINEL_CONTENT = `p504-dfa-sentinel-${Math.random().toString(16).slice(2, 8)}`

interface Feed {
  frames: Array<{ type: string; event?: string; eventId?: string; agentId?: string }>
  answer(frame: { eventId?: string }, value: string): Promise<unknown>
  close(): void
}

interface EscRuntime extends Runtime {
  feed: Feed
  writeScriptCalls(sessionId: string, calls: object[]): void
}

const runtimes: EscRuntime[] = []

function fakeOverlay(): string {
  const dir = tmkdir('p5-04-patch-')
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

/** stock 差分：禁用 p2sdk-fs-guard（guard-fs.test.ts 同款）。 */
function stockOverlay(): string {
  const dir = tmkdir('p5-04-stock-')
  const overlay = join(dir, 'stock.yml')
  writeFileSync(overlay, `\
# P5-04 差分对照：恢复 stock（无 dfa 参数 guard）
- id: p2sdk-fs-guard
  disabled: true
`)
  return overlay
}

/**
 * P5-04 ⑤ 组合 overlay：有效模式 = dfa 且 approval ≠ never。dsh patch 对非
 * insert 行是整键覆盖（cordis-plugin-include applyEntryPatches，同
 * approval.yml preset 覆盖机制）：approval 行 policy 翻回 ask；permission 行
 * 的 dfa preset 改 approval: ask —— permission-presets 构造器 derive 组合默认
 * (ctx.shell.sandboxMode=dfa, approval=ask)，组合表里必须存在匹配 preset 否则
 * boot 即抛（CUSTOM_PRESET），且 pinInitialPermission 给新 session 钉的
 * sandbox/mode=dfa + approval/policy=ask 全靠这张表。stock=true 追加禁 guard 行。
 */
function comboOverlay(stock: boolean): string {
  const dir = tmkdir('p5-04-combo-')
  const overlay = join(dir, 'combo.yml')
  writeFileSync(overlay, `\
# P5-04 ⑤ 组合会话：mode=danger-full-access 且 approval=ask（≠ never）。
- id: approval
  name: '@deepseek-ai/dsh-user-approval'
  config:
    policy: ask
- id: permission
  name: '@deepseek-ai/dsh-permission-presets'
  config:
    presets:
      read-only:
        sandbox: read-only
        approval: ask
        name: read-only
        description: p5-04 ⑤ 组合测试表
      workspace-write:
        sandbox: workspace-write
        approval: ask
        name: workspace-write
        description: p5-04 ⑤ 组合测试表
      danger-full-access:
        sandbox: danger-full-access
        approval: ask
        name: danger-full-access
        description: p5-04 ⑤ 组合（dfa + ask）
${stock ? '\n# 差分侧：不挂 guard\n- id: p2sdk-fs-guard\n  disabled: true\n' : ''}`)
  return overlay
}

async function openFeed(rt: Runtime): Promise<Feed> {
  const client: DshClient = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const stream = await client.socket.open('$events', {})
  const frames: Feed['frames'] = []
  const drained = (async () => { for await (const f of stream) frames.push(f as Feed['frames'][number]) })().catch(() => {})
  await waitFor(frames as unknown as Frame[], (f) => f.type === 'ready', 5000, '$events ready')
  const clientId = frames.find((f) => f.type === 'ready')?.clientId ?? ''
  return {
    frames,
    answer: (frame, value) => client.call('$events/result', { clientId, eventId: frame.eventId, outcome: { kind: 'result', value } }),
    close() { stream.cancel(); void drained; client.close() },
  }
}

/** launchEsc 选项：dfa = DSH_PERMISSION_MODE=danger-full-access 启动；combo = ⑤ 组合 patch。 */
interface LaunchOpts {
  dfa?: boolean
  combo?: boolean
}

async function launchEsc(stock: boolean, opts: LaunchOpts = {}): Promise<EscRuntime> {
  clearRealKeys()
  const patches = [
    fakeOverlay(),
    opts.combo === true ? comboOverlay(stock) : '',
    stock && opts.combo !== true ? stockOverlay() : '',
  ].filter(Boolean).join(':')
  const rt = await launchRuntime({
    env: {
      HOME: TEST_HOME,
      P2SDK_PATCH: patches,
      PBOTS_DATA_DIR: DATA_DIR,
      ...(opts.dfa === true ? { DSH_PERMISSION_MODE: 'danger-full-access' } : {}),
    },
  })
  const feed = await openFeed(rt)
  const g: EscRuntime = {
    ...rt,
    feed,
    writeScriptCalls(sessionId, calls) {
      const dir = join(rt.home, 'fake', 'scripts')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
    },
  }
  runtimes.push(g)
  return g
}

/** 一个模型响应里的 tool-call block 们 + 收尾 text。 */
function multiToolCall(calls: Array<{ name: string; args: object }>): object {
  const blocks = calls.map((c, i) => {
    const id = `p5-04-${Math.random().toString(16).slice(2, 8)}-${i}`
    const argumentsJson = JSON.stringify(c.args)
    return [
      { type: 'block-start', index: i, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: i, id, name: c.name, argumentsDelta: argumentsJson },
      { type: 'block-end', index: i, block: { type: 'tool-call', id, name: c.name, arguments: argumentsJson } },
    ]
  }).flat()
  return {
    chunks: [...blocks, { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'tool-calls' } }],
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

interface ToolResultView { toolCallId: string; isError: boolean; text: string }

/** dfa 升权 bash 调用：读哨兵并把内容落进工作区标记文件（①与③用同一命令）。 */
function dfaBashCall(marker: string): { name: string; args: object } {
  return {
    name: 'bash',
    args: {
      command: `cat ${SENTINEL} > ${marker} 2>&1; echo cat_rc=$?`,
      description: 'P5-04 danger-full-access escalation probe',
      sandbox_permissions: 'danger-full-access',
      justification: 'P5-04 dfa 探针：验证升权路径',
    },
  }
}

/** 一个 turn（新会话，fake 游标坑）：prompt → 可选等待 approval → 等收尾。 */
async function turn(
  h: EscRuntime,
  cwd: string,
  calls: object[],
  onApproval?: (frame: { eventId?: string }) => Promise<void>,
): Promise<{ sessionId: string; results: Map<string, ToolResultView> }> {
  const { sessionId } = (await h.client.call('session/create', { request: { cwd } })) as { sessionId: string }
  const stream = await h.client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  h.writeScriptCalls(sessionId, [...calls, textCall('P5-04 完成')])
  await h.client.call('session/prompt', {
    request: { requestId: `p5-04-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'P5-04 探针' }] },
  })
  const deadline = Date.now() + 60_000
  for (;;) {
    if (onApproval !== undefined) {
      const f = h.feed.frames.find((fr) => fr.type === 'waterfall' && fr.event === 'approval/request' && fr.agentId === sessionId)
      if (f !== undefined) await onApproval(f)
    }
    if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
    if (Date.now() > deadline) throw new Error(`turn/end 未到；尾部：${JSON.stringify(frames.slice(-4))}`)
    await new Promise((r) => setTimeout(r, 50))
  }
  stream.cancel()
  void drained
  const results = new Map<string, ToolResultView>()
  for (const f of frames) {
    if (f.type !== 'event' || f.event?.type !== 'tool/result') continue
    const data = f.event.data as { message?: { toolCallId?: string; isError?: boolean; content?: Array<{ type: string; text?: string }> } }
    results.set(data.message?.toolCallId ?? '', {
      toolCallId: data.message?.toolCallId ?? '',
      isError: data.message?.isError === true,
      text: (data.message?.content ?? []).map((c) => c.text ?? '').join('\n'),
    })
  }
  return { sessionId, results }
}

function askedFor(h: EscRuntime, sessionId: string): number {
  return h.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId).length
}

/** 组合先证非空（approval.test.ts R2 同款）：部署默认 preset 与 session 钉的 preset。 */
async function pinnedPresetOf(h: EscRuntime, sessionId: string): Promise<{ defaultPreset: string; pinned: string }> {
  const catalog = (await h.client.call('permissionPresets/catalog', {})) as { defaultPreset: string }
  const projections = (await h.client.call('session/projections', { request: { sessionId } })) as {
    values: { permissions?: { currentValue?: string } }
  }
  return { defaultPreset: catalog.defaultPreset, pinned: projections.values.permissions?.currentValue ?? '' }
}

let GUARD_RT: EscRuntime
let STOCK_RT: EscRuntime
/** P5-04.f1 ④：DSH_PERMISSION_MODE=danger-full-access 启动（guard 挂着）。 */
let DFA_RT: EscRuntime
/** P5-04.f1 ⑤：组合（mode=dfa 且 approval≠never），guard 挂着 / stock 各一。 */
let COMBO_RT: EscRuntime
let COMBO_STOCK_RT: EscRuntime

beforeAll(async () => {
  mkdirSync(join(TEST_HOME, '.ssh'), { recursive: true })
  mkdirSync(join(TEST_HOME, 'workspace'), { recursive: true })
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(SENTINEL, SENTINEL_CONTENT)
  GUARD_RT = await launchEsc(false)
  STOCK_RT = await launchEsc(true)
  DFA_RT = await launchEsc(false, { dfa: true })
  COMBO_RT = await launchEsc(false, { dfa: true, combo: true })
  COMBO_STOCK_RT = await launchEsc(true, { dfa: true, combo: true })
}, 300_000)

afterAll(async () => {
  for (const h of runtimes) {
    h.feed.close()
    await h.stop()
  }
})

it('① dfa 升权 bash：deny + dfa 字面原因 + asked 0 + 标记文件不存在', { timeout: 180_000 }, async () => {
  expect(existsSync(SENTINEL), '前提：宿主侧哨兵存在').toBe(true)
  const marker = join(TEST_HOME, 'workspace', 'leak-dfa-guarded.txt')
  const { sessionId, results } = await turn(GUARD_RT, join(TEST_HOME, 'workspace'), [multiToolCall([dfaBashCall(marker)])])
  expect(askedFor(GUARD_RT, sessionId), 'deny 不出卡').toBe(0)
  expect(results.size, '一个 tool result').toBe(1)
  const r = [...results.values()][0]!
  expect(r.isError, 'deny 时 isError').toBe(true)
  expect(r.text, '原因带 guard 前缀').toContain('p2sdk-fs-guard')
  expect(r.text, `原因含 v2.1 定死的字面串 "${DFA_REASON}"`).toContain(DFA_REASON)
  expect(existsSync(marker), '命令未执行：标记文件不存在').toBe(false)
})

it('② dfa 升权 write/edit 工作区外：deny（dfa 原因，非路径原因）+ 宿主无副作用 + asked 0', { timeout: 180_000 }, async () => {
  const outsideWrite = join(TEST_HOME, 'dfa-outside-write.txt')
  const outsideEdit = join(TEST_HOME, 'dfa-outside-edit.txt')
  const editBefore = createHash('sha256').update('p504-original').digest('hex')
  writeFileSync(outsideEdit, 'p504-original')
  const dfa = { sandbox_permissions: 'danger-full-access', justification: 'P5-04 dfa 探针：验证升权路径' }
  const { sessionId, results } = await turn(GUARD_RT, join(TEST_HOME, 'workspace'), [
    multiToolCall([
      { name: 'write', args: { file_path: outsideWrite, content: 'p504-x', ...dfa } },
      { name: 'edit', args: { file_path: outsideEdit, old_string: 'p504-original', new_string: 'p504-x', ...dfa } },
    ]),
  ])
  expect(askedFor(GUARD_RT, sessionId), 'deny 不出卡').toBe(0)
  expect(results.size, '两个 tool result').toBe(2)
  for (const r of results.values()) {
    expect(r.isError, `${r.toolCallId} deny 时 isError`).toBe(true)
    expect(r.text, '原因是 dfa 字面串（区分 P5-02 路径原因）').toContain(DFA_REASON)
    expect(r.text, '不是 masked/read-only 路径原因').not.toContain('masked area')
  }
  expect(existsSync(outsideWrite), 'write 未执行：宿主无新文件').toBe(false)
  expect(createHash('sha256').update(readFileSync(outsideEdit)).digest('hex'), 'edit 未执行：原文件不变').toBe(editBefore)
})

it('③ 差分：stock 下同一 dfa bash 出卡，批准后哨兵真被读到（真实无沙箱路径）', { timeout: 180_000 }, async () => {
  const marker = join(TEST_HOME, 'workspace', 'leak-dfa-stock.txt')
  let answered = 0
  const { sessionId } = await turn(STOCK_RT, join(TEST_HOME, 'workspace'), [multiToolCall([dfaBashCall(marker)])], async (frame) => {
    if (answered === 0) {
      answered++
      await STOCK_RT.feed.answer(frame, 'allowed-once')
    }
  })
  expect(answered, 'stock 下同一调用产生 approval/asked').toBe(1)
  expect(askedFor(STOCK_RT, sessionId), 'asked 恰 1').toBe(1)
  expect(existsSync(marker), '批准后命令真执行（无沙箱路径存在）').toBe(true)
  expect(readFileSync(marker, 'utf8').trim(), '哨兵内容真被读到').toBe(SENTINEL_CONTENT)
})

it('④ 不带升权参数的普通 bash 与合入前一致：出卡 1 次、批准后执行', { timeout: 180_000 }, async () => {
  const marker = join(TEST_HOME, 'workspace', 'parity-marker.txt')
  const ordinaryBash = {
    name: 'bash',
    args: { command: `echo p504-parity > ${marker}`, description: 'P5-04 普通调用行为一致性探针' },
  }
  let answered = 0
  const { sessionId } = await turn(GUARD_RT, join(TEST_HOME, 'workspace'), [multiToolCall([ordinaryBash])], async (frame) => {
    if (answered === 0) {
      answered++
      await GUARD_RT.feed.answer(frame, 'allowed-once')
    }
  })
  expect(answered, '普通 bash 照旧出卡').toBe(1)
  expect(askedFor(GUARD_RT, sessionId), 'asked 恰 1').toBe(1)
  expect(existsSync(marker), '批准后照旧执行').toBe(true)
  expect(readFileSync(marker, 'utf8').trim(), '命令真实执行').toBe('p504-parity')
})

// P5-04.f1 ④b（PLAN P5-04 行 ④）：DSH_PERMISSION_MODE=danger-full-access 启动
// 态。组合链：sandbox-policy mode=dfa + approval policy=never + permission
// preset 钉 dfa（approval.test.ts R2 同款）。bash 侧 shell-ask 的 never 拒绝
// 是 P5-05 的防线；本格证明 guard 的会话级判定补齐文件工具侧，且 write 的
// 原因是会话级字面串而非 P5-02 路径原因（判定先于路径）。
it('④b DSH_PERMISSION_MODE=danger-full-access 启动：bash / write 工作区外 → 会话级 deny + asked 0 + 无副作用；read 不越界', { timeout: 180_000 }, async () => {
  const canary = join(TEST_HOME, 'workspace', 'p504-dfa-session-canary')
  const outside = join(TEST_HOME, 'p504-dfa-session-outside.txt')
  const readMarker = join(TEST_HOME, 'workspace', 'p504-read-marker.txt')
  writeFileSync(readMarker, 'p504-read-ok')
  const { sessionId, results } = await turn(DFA_RT, join(TEST_HOME, 'workspace'), [
    multiToolCall([
      { name: 'bash', args: { command: `echo x > ${canary}`, description: 'P5-04 ④ dfa 会话普通 bash 探针' } },
      { name: 'write', args: { file_path: outside, content: 'p504-x' } },
      { name: 'read', args: { file_path: readMarker } },
    ]),
  ])
  const { defaultPreset, pinned } = await pinnedPresetOf(DFA_RT, sessionId)
  expect(defaultPreset, '前提：部署默认 preset 是 dfa（否则绿是空绿）').toBe('danger-full-access')
  expect(pinned, '前提：新 session 钉 dfa preset').toBe('danger-full-access')

  expect(askedFor(DFA_RT, sessionId), 'deny 不出卡（approval=never 本也无应答者）').toBe(0)
  expect(results.size, '三个 tool result').toBe(3)
  const denied = [...results.values()].filter((r) => r.isError)
  // L-7 R6 语义更新（2026-11-04）：本运行时没配 policy-state 且状态文件从未写入
  // （写端 P5-29 未交付）→ 文件工具不门控：工作区内 read 恢复自主执行（A9 ⑦ 提前
  // 到生产默认态）。bash/write 仍是 guard 的会话级 deny（原因字面串不变）。
  expect(denied.length, 'bash + write 会话级 deny；read 工作区内放行').toBe(2)
  const sessionDenied = denied.filter((r) => r.text.includes(DFA_SESSION_REASON))
  expect(sessionDenied.length, 'bash/write 恰两个 guard 会话级 deny').toBe(2)
  for (const r of sessionDenied) {
    expect(r.text, `原因含 v2.1 定死的会话级字面串 "${DFA_SESSION_REASON}"`).toContain(DFA_SESSION_REASON)
    expect(r.text, '原因带 guard 前缀（不是 shell-ask 的 never 原因）').toContain('p2sdk-fs-guard')
    expect(r.text, '不是 P5-02 的路径原因（会话级判定先于路径判定）').not.toContain('masked area')
  }
  const readOk = [...results.values()].find((r) => !r.isError)
  expect(readOk, 'read 的 tool result 成功').toBeTruthy()
  expect(readOk!.text, 'read 读到工作区文件内容').toContain('p504-read-ok')
  expect(existsSync(canary), 'bash 未执行').toBe(false)
  expect(existsSync(outside), 'write 未执行：宿主无新文件').toBe(false)
})

// P5-04.f1 ⑤（PLAN P5-04 行 ⑤，从 P5-02 ⑥ 移来的顺序格）：组合「有效模式
// = dfa 且 approval ≠ never」。普通 bash 无参数 → shell-ask 对它会返回 ask
// （shell-ask.mjs:49：非 never 即 ask）；guard 挂着时却 deny 且 0 出卡 → 出
// 拦截者只能是排在 shell-ask 之前的 guard。guard 若排在 shell-ask 后，本格
// 必红：waterfall 里 shell-ask 的 ask 不调 next()，guard 永远不执行。
it('⑤ 顺序格：组合会话（mode=dfa 且 approval≠never）普通 bash → guard 先拦，deny 会话级字面串 + asked 0', { timeout: 180_000 }, async () => {
  const canary = join(TEST_HOME, 'workspace', 'p504-combo-canary')
  const ordinaryBash = {
    name: 'bash',
    args: { command: `echo x > ${canary}`, description: 'P5-04 ⑤ 组合会话普通 bash 探针（无参数，shell-ask 必返回 ask）' },
  }
  const { sessionId, results } = await turn(COMBO_RT, join(TEST_HOME, 'workspace'), [multiToolCall([ordinaryBash])])
  const { defaultPreset, pinned } = await pinnedPresetOf(COMBO_RT, sessionId)
  expect(defaultPreset, '前提：组合表以 dfa 为默认 preset').toBe('danger-full-access')
  expect(pinned, '前提：新 session 钉组合 dfa preset（sandbox=dfa + approval=ask）').toBe('danger-full-access')

  expect(askedFor(COMBO_RT, sessionId), 'guard 排在 shell-ask 前：不出卡').toBe(0)
  expect(results.size, '一个 tool result').toBe(1)
  const r = [...results.values()][0]!
  expect(r.isError, 'deny 时 isError').toBe(true)
  expect(r.text, 'deny 来自 guard（前缀），不是 shell-ask 的 ask').toContain('p2sdk-fs-guard')
  expect(r.text, `原因含 v2.1 定死的会话级字面串 "${DFA_SESSION_REASON}"`).toContain(DFA_SESSION_REASON)
  expect(r.text, '不是 shell-ask 的 never 原因').not.toContain('approval unavailable in this session')
  expect(existsSync(canary), '命令未执行').toBe(false)
})

// P5-04.f1 ⑤ 差分：同组合不挂 guard → shell-ask 返回 ask（approval ≠ never
// 的行为证据——never 会本地拒不出卡，asked 1 只可能来自 ask），批准后命令
// 在 dfa 会话里真实执行。guard 若排在 shell-ask 后，⑤ 主格的 asked 就会是 1。
it('⑤ 差分：同组合不挂 guard → shell-ask 出卡 asked 1，批准后执行', { timeout: 180_000 }, async () => {
  const canary = join(TEST_HOME, 'workspace', 'p504-combo-stock-canary')
  const ordinaryBash = {
    name: 'bash',
    args: { command: `echo x > ${canary}`, description: 'P5-04 ⑤ 组合会话普通 bash 探针（差分侧）' },
  }
  let answered = 0
  const { sessionId } = await turn(COMBO_STOCK_RT, join(TEST_HOME, 'workspace'), [multiToolCall([ordinaryBash])], async (frame) => {
    if (answered === 0) {
      answered++
      await COMBO_STOCK_RT.feed.answer(frame, 'allowed-once')
    }
  })
  expect(answered, '无 guard 时 shell-ask 返回 ask（组合里 approval≠never 的证据）').toBe(1)
  expect(askedFor(COMBO_STOCK_RT, sessionId), 'asked 恰 1').toBe(1)
  expect(existsSync(canary), '批准后在 dfa 会话真实执行').toBe(true)
  expect(readFileSync(canary, 'utf8').trim(), '命令真实执行').toBe('x')
})
