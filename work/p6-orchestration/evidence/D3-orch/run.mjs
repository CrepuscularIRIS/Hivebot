#!/usr/bin/env node
// P6-20 D3′ 真模型路由采集器（PLAN p6-orchestration P6-20 行；run.mjs 改 P6-04
// 版——evidence/D3/run.mjs，不再用 p6-reply preset / runtime.ts）。
//
// 与 D3 的差别：经 P2SDK_PATCH 挂生产 orchestration.yml（p6-stuck.spec 同款挂
// 法），本进程扮演 main（订阅 pbots/orchestration.requests：mintWorkspace →
// createdBy 先落盘 → session/create(sessionId,cwd) → rename → respond——顺序镜像
// ui/main/m3-meta/orchestrate.ts createWorkerBot），env 必须显式
// P2SDK_ORCH_DATA_DIR（LEARNINGS 2026-11-04：不设则 identity 回落真实
// ~/.config 判错，create_bot 隐藏）。全记录：主 bot 帧 raw/<gid>.jsonl、worker
// 帧 raw/<gid>.w<k>.jsonl、llm/stream 工具表（recorder overlay）；污染回合与
// 回报批由 score.mjs 消费。
//
// 用法：
//   node run.mjs --check                 静态自检（prompts 冻结集形状 / yml /
//                                        fake 插件在位；LiteLLM 探测在真模式起跑前做）
//   node run.mjs --smoke                 fake 模型接线冒烟（通道往返 / assign 首条 /
//                                        回报投递+消化 / 工具表可见性 / raw 形状，1 组）
//   node run.mjs [--only id[,id…]] [--force] [--keep]
//                                        真模型采集（LiteLLM glm-5.3，与生产主 bot
//                                        同模型；key 取 P2SDK_LLM_API_KEY 或
//                                        LITELLM_MASTER_KEY，仅进子进程 env，不打印
//                                        不落盘）。16 条 × 3 = 48 组串行，组间延迟
//                                        P620_GROUP_DELAY_MS（缺省 5000）；
//                                        raw/<gid>.jsonl 已存在的组跳过（断点续跑），
//                                        --force 重采（旧记录转 .prevN 保留）。
//                                        连续 3 组 turn-error / runtime-exit → 提前
//                                        收尾（已完成组均已落盘，剩余组打印清单）。
//
// bash 触发 shell-ask 审批卡经 $events 以 interactions=answer 客户端自动作答
// allowed-once（真实链路，同 D3）；worker ask_user_question 自动选第一项（防组
// 挂死；发生即打印并计数）。
//
// 运行时布局（沙箱内，成功即删；--keep 或失败保留并打印路径）：
// /tmp/bot-p620/{home,dsh,handoff,data,work/<gid>,data/workspaces/<botId>}。
// 会话 cwd 独立于 HOME/DSH_HOME（bwrap wrapper 拒绝 cwd 落在 --home 树内）；
// worker cwd 按生产布局放 data/workspaces/<botId>（dataDir 被 mask 后由工作区
// 重 --bind 恢复，与 Electron main 一致）。
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..')
const SDK = join(REPO_ROOT, 'app', 'sdk')
const EVID = process.env.P622_EVID_DIR || HERE
const PROMPTS = process.env.P622_PROMPTS_FILE || join(HERE, 'prompts.json')
const ORCH_YML = join(SDK, 'profile', 'patches', 'orchestration.yml')
const FAKE_PLUGIN = join(SDK, 'tests', 'support', 'fake', 'plugin.mjs')
const ROOT = process.env.P622_RUNTIME_ROOT || '/tmp/bot-p620'
if (!/^\/tmp\/bot-p622r(?:1|2|2b|2c)-[a-zA-Z0-9_-]+$/.test(ROOT) && ROOT !== '/tmp/bot-p620') throw new Error('runtime root must be an isolated /tmp/bot-p622r1-*, /tmp/bot-p622r2-* or /tmp/bot-p622r2b-* directory')
const DEFAULT_MODEL = 'glm-5.3' // 与生产主 bot 同模型（PLAN P6-20 行）
const ORCH_REQUESTS = 'pbots/orchestration.requests'
const ORCH_RESPOND = 'pbots/orchestration.respond'
// 等待预算（ms）：主回合 / worker 回合 / 回报投递+消化 / 组总额
const T_MAIN = 300_000
const T_WORKER = 420_000
const T_REPORT = 240_000
const T_GROUP = 900_000
const GROUP_DELAY_MS = Number(process.env.P620_GROUP_DELAY_MS ?? 5000)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fileExists = (p) => { try { readFileSync(p); return true } catch { return false } }
/** 目标路径占用时把旧文件改名 .prevN，新写入用主名（全记录：重跑都留）。 */
function reserveName(path) {
  let n = 2
  let candidate = `${path}.prev${n}`
  while (fileExists(candidate)) candidate = `${path}.prev${++n}`
  try { renameSync(path, candidate) } catch { /* 不存在：直接用主名 */ }
  return path
}

// 跨闭包状态：当前组（通道 handler 归属）、runtime 存活、smoke 脚本构造器。
let currentGroup = null // { mainId, workers: [{sessionId,name,prompt,frames,stream}] }
let runtimeExited = false
let rateLimited = false
let rateLimitDetails = ''
let groupRetryCount = 0
// Group retries use fresh sessions; archive every previous attempt through reserveName.
function retry429Delay(details, retries) {
  const seconds = [...details.matchAll(/(?:retry[- ]after["':\s]*|try again in\s*|retry in\s*)(\d+(?:\.\d+)?)/gi)].map((m) => Number(m[1]))
  const longest = Math.max(0, ...seconds)
  return retries >= 3 || longest >= 1000 ? null : Math.max(30000, Math.ceil(longest * 1000))
}
const detect429 = (frames) => frames.some((f) => f?.type === 'event' && f.event?.type === 'turn/end' && f.event.data?.reason?.kind === 'error' && /429|rate.?limit|too many requests/i.test(JSON.stringify(f.event.data)))
let smokeScripts = null
let llmBaseUsed = 'http://127.0.0.1:4001' // main() 起跑时赋值；runGroup meta 用

function loadPrompts() {
  const data = JSON.parse(readFileSync(PROMPTS, 'utf8'))
  if (!Array.isArray(data.cases)) throw new Error('prompts.json 缺 cases 数组')
  return data.cases
}

// ── bots.json（harness 扮演 main 侧的 M3 store；CONTRACT v1.5 §3.1 形状） ──

const botsJsonPath = () => join(ROOT, 'data', 'bots.json')

/** 组开头整表重写（mutate 省略）；创建 worker 时 RMW 追加 createdBy。 */
function writeBotsJson(mainBotId, mutate) {
  let bots = {}
  try { bots = JSON.parse(readFileSync(botsJsonPath(), 'utf8')).bots ?? {} } catch { /* 首写 */ }
  if (mutate !== undefined) bots = mutate(bots)
  writeFileSync(botsJsonPath(), JSON.stringify({ version: 1, mainBotId, recipes: {}, ...(Object.keys(bots).length === 0 ? {} : { bots }) }))
}

// ── recorder overlay（llm/stream 记录器；模型名 + 工具表，不记消息与凭证） ──

function recorderOverlay() {
  const dir = mkdtempSync(join(tmpdir(), 'bot-p620-rec-'))
  const overlay = join(dir, 'recorder.yml')
  writeFileSync(join(dir, 'recorder.mjs'), `\
// P6-20 D3' recorder: per-request model / tool names at llm/stream.
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'p6-d3o-recorder'

export function apply(ctx) {
  ctx.on('llm/stream', (options, next) => {
    const home = process.env.DSH_HOME
    if (home !== undefined) {
      const pick = (k) => (options[k] === undefined ? null : options[k])
      appendFileSync(join(home, 'd3o-llm.jsonl'), JSON.stringify({
        ts: Date.now(),
        sessionId: options.sessionId === undefined ? 'null' : String(options.sessionId),
        model: pick('model'), provider: pick('provider'),
        toolNames: (options.tools ?? []).map((t) => t.name).sort(),
      }) + '\\n')
    }
    return next()
  })
}
`)
  writeFileSync(overlay, `\
# Disable opaque provider retries; the harness bounds and records group-level retries.
- id: llm-retry
  disabled: true
- insert:
    - id: p6-d3o-recorder
      name: '${pathToFileURL(join(dir, 'recorder.mjs')).href}'
`)
  return { dir, overlay }
}

/** 读 $DSH_HOME/d3o-llm.jsonl 中某 sessionId 的记录行（无则空数组）。 */
function recorderRows(sessionId) {
  const rows = []
  const p = join(ROOT, 'dsh', 'd3o-llm.jsonl')
  if (!fileExists(p)) return rows
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (line.trim() === '') continue
    try { const r = JSON.parse(line); if (r.sessionId === sessionId) rows.push(r) } catch { /* 撕裂行 */ }
  }
  return rows
}

// ── --check：静态自检 ──

function check() {
  const fails = []
  const ok = (cond, label) => { if (!cond) fails.push(label) }
  const cases = loadPrompts()
  const count = (k) => cases.filter((c) => c.kind === k).length
  ok(cases.length === 16, `cases 恰 16 条（实际 ${cases.length}）`)
  ok(count('direct') === 4 && count('single') === 4 && count('parallel') === 2 && count('attach') === 2 && count('stop') === 2 && count('chat') === 2, `类目 4/4/2/2/2/2（实际 ${['direct', 'single', 'parallel', 'attach', 'stop', 'chat'].map((k) => `${k}:${count(k)}`).join(' ')}）`)
  ok(new Set(cases.map((c) => c.id)).size === 16, 'id 唯一')
  ok(cases.every((c) => c.expect && typeof c.expect.route === 'string' && typeof c.expect.createCalls === 'number' && typeof c.expect.stopCalls === 'number'), '每条 expect.route/createCalls/stopCalls 齐全')
  ok(cases.filter((c) => c.kind === 'attach' || c.kind === 'stop').every((c) => Array.isArray(c.turns) && c.turns.length === 2 && c.turns.every((t) => typeof t === 'string' && t.trim() !== '')), 'attach/stop 均为两回合')
  ok(cases.filter((c) => c.kind !== 'attach' && c.kind !== 'stop').every((c) => typeof c.prompt === 'string' && c.prompt.trim() !== ''), '单回合类均有 prompt')
  ok(fileExists(ORCH_YML) && readFileSync(ORCH_YML, 'utf8').includes('- id: pbots-orchestration'), 'orchestration.yml 有 pbots-orchestration insert 行')
  ok(fileExists(FAKE_PLUGIN), 'fake 插件存在（--smoke 用）')
  ok(readFileSync(join(SDK, 'src', 'orchestration', 'main-channel.mjs'), 'utf8').includes("'pbots/orchestration.requests'"), '⑤ 通道端点在位')

  const KEY = process.env.P2SDK_LLM_API_KEY || process.env.LITELLM_MASTER_KEY || ''
  const model = process.env.P2SDK_LLM_MODEL || DEFAULT_MODEL
  console.log(`model=${model} key=${KEY ? 'present' : 'MISSING'}（key 不打印不落盘）`)
  if (fails.length > 0) {
    console.error(`--check FAIL (${fails.length}):`)
    for (const f of fails) console.error(`  - ${f}`)
    return 1
  }
  console.log('--check PASS')
  return 0
}

// ── 等待原语（帧扫描轮询；frames 由 follow 流持续追加） ──

const textOf = (ev) => (ev.data?.content ?? []).filter((b) => b?.type === 'text').map((b) => b.text ?? '').join('')

/** 等 frames 里匹配 text 的用户回合闭合（其后出现 turn/end）；超时返回 ok:false。 */
async function waitMainTurn(frames, text, groupDeadline) {
  const key = text.slice(0, 40)
  const deadline = Math.min(Date.now() + T_MAIN, groupDeadline)
  for (;;) {
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]
      if (f?.type !== 'event' || f.event?.type !== 'user/message') continue
      if ((f.event.data?.source?.kind ?? '') !== 'user' || !textOf(f.event).startsWith(key)) continue
      for (let k = i + 1; k < frames.length; k++) {
        const g = frames[k]
        if (g?.type === 'event' && g.event?.type === 'user/message' && (g.event.data?.source?.kind ?? '') === 'user') break // 下一回合先开
        if (g?.type === 'event' && g.event?.type === 'turn/end') return { ok: true, idx: k }
      }
    }
    if (Date.now() > deadline || runtimeExited || rateLimited) return { ok: false }
    await sleep(400)
  }
}

/** 等每个 worker 帧流里 turn/end ≥ n 次（无 worker 立即失败，不烧预算）。 */
async function waitWorkersEnded(workers, n, groupDeadline, budgetMs = T_WORKER) {
  if (workers.length === 0) return { ok: false, counts: [] }
  const deadline = Math.min(Date.now() + budgetMs, groupDeadline)
  for (;;) {
    const counts = workers.map((w) => w.frames.filter((f) => f?.type === 'event' && f.event?.type === 'turn/end').length)
    if (counts.every((c) => c >= n)) return { ok: true, counts }
    if (Date.now() > deadline || runtimeExited || rateLimited) return { ok: false, counts }
    await sleep(400)
  }
}

/** 等回报投递并被消化：**最后一批** pbots-worker user/message 之后有 turn/end，
 *  再静默 4s 收批（判最后一批而非任意批——后到批次在模型思考静默期不被 4s
 *  静默提前放行，否则其消化回合被截断、污染回合指标漏采）。 */
async function waitReportConsumed(frames, groupDeadline) {
  const deadline = Math.min(Date.now() + T_REPORT, groupDeadline)
  let lastLen = -1
  let quietSince = 0
  for (;;) {
    let lastReportIdx = -1
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]
      if (f?.type !== 'event' || f.event?.type !== 'user/message') continue
      const kind = f.event.data?.source?.kind ?? ''
      if (kind === 'pbots-worker') { lastReportIdx = i; continue }
      if (kind === 'user') lastReportIdx = -1 // 用户回合插队：继续扫描，只有其后回报才计
    }
    let consumed = false
    if (lastReportIdx >= 0) {
      for (let k = lastReportIdx + 1; k < frames.length; k++) {
        const g = frames[k]
        if (g?.type === 'event' && g.event?.type === 'user/message' && (g.event.data?.source?.kind ?? '') === 'user') break
        if (g?.type === 'event' && g.event?.type === 'turn/end') { consumed = true; break }
      }
    }
    if (lastReportIdx >= 0 && consumed) {
      if (frames.length !== lastLen) { lastLen = frames.length; quietSince = Date.now() }
      if (Date.now() - quietSince >= 4000) return { ok: true }
    }
    if (Date.now() > deadline || runtimeExited || rateLimited) return { ok: false }
    await sleep(400)
  }
}

/** prompt 一次（mode queue；requestId 唯一）。 */
async function promptTurn(client, sessionId, text) {
  if (rateLimited) throw new Error('429 observed; no further model requests')
  await client.call('session/prompt', {
    request: {
      requestId: `p6-d3o-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      sessionId, mode: 'queue', content: [{ type: 'text', text }],
    },
  })
}

// ── 一个组：新 main 会话 + bots.json + 按类目跑回合；帧全量落 jsonl（完成即写） ──

async function runGroup(client, entry, rep, smoke) {
  const gid = `${entry.id}-${rep}`
  const groupDeadline = Date.now() + T_GROUP
  const work = join(ROOT, 'work', gid)
  mkdirSync(work, { recursive: true })
  const { sessionId: M } = await client.call('session/create', { request: { cwd: work } })
  writeBotsJson(M, undefined) // 本组权威：mainBotId=M、worker 空表（旧组 worker 出表，回报互不串扰）
  currentGroup = { mainId: M, workers: [] }

  const { stream, snapshot } = await client.follow(M, { assistantStream: true, awaitSnapshot: true })
  const frames = [...snapshotFramesOf(snapshot)]
  const header = snapshot?.header ?? null
  void (async () => { for await (const f of stream) { frames.push(f); if (detect429([f])) { rateLimited = true; rateLimitDetails += JSON.stringify(f.event.data) } } })().catch((e) => frames.push({ type: 'd3o-error', message: String(e?.message ?? e) }))

  // smoke：主脚本按 sessionId 写（P5-03 fake 游标 per-session）
  if (smoke) {
    const scripts = join(ROOT, 'dsh', 'fake', 'scripts')
    const args = JSON.stringify({ name: '冒烟工', prompt: '建 a.txt 写 hi' })
    const createStep = {
      paceMs: 5,
      chunks: [
        { type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: 'On it — 派个 worker。' }, { type: 'block-end', index: 0, block: { type: 'text', text: 'On it — 派个 worker。' } },
        { type: 'block-start', index: 1, blockType: 'tool-call' }, { type: 'tool-call-delta', index: 1, id: 'p620-c1', name: 'create_bot', argumentsDelta: args },
        { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'p620-c1', name: 'create_bot', arguments: args } },
        { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'tool-calls' } },
      ],
    }
    writeFileSync(join(scripts, `${M}.json`), JSON.stringify({ calls: [createStep, smokeScripts.text('派出去了，等它回报。'), smokeScripts.text('收到回报：a.txt 建好了。')] }))
  }

  const timeouts = []
  const turnsText = Array.isArray(entry.turns) ? entry.turns : [entry.prompt]
  let t1Ok = true
  await promptTurn(client, M, turnsText[0]).catch((e) => { timeouts.push(`prompt1:${String(e?.message ?? e)}`); t1Ok = false })
  let w1 = { ok: false }
  if (t1Ok) w1 = await waitMainTurn(frames, turnsText[0], groupDeadline)
  if (!w1.ok) timeouts.push('turn1')

  let turn2DelayMs = null
  let workerStillRunningAtTurn2 = null
  if (w1.ok && !rateLimited && entry.kind !== 'direct' && entry.kind !== 'chat') {
    const settleWorkers = (n, budgetMs) => waitWorkersEnded(currentGroup.workers, n, groupDeadline, budgetMs)
    const settleReport = async () => { const r = await waitReportConsumed(frames, groupDeadline); if (!r.ok) timeouts.push('report'); return r.ok }
    // 无 worker（模型未派工）则不烧 worker/回报预算——回报只可能来自本组
    // worker（bots.json 每组重写，ownWorkerIds 只认当前主）；组照常收尾，
    // 路由未派工由 score.mjs 记 FAIL，outcome 仍 turn/end。
    const settleAll = async (n) => {
      if (currentGroup.workers.length === 0) return
      if (!(await settleWorkers(n, T_WORKER)).ok) timeouts.push(n === 2 ? 'worker2' : 'workers')
      await settleReport()
    }
    if (entry.kind === 'attach') {
      await settleAll(1)
      let t2Ok = true
      await promptTurn(client, M, turnsText[1]).catch((e) => { timeouts.push(`prompt2:${String(e?.message ?? e)}`); t2Ok = false })
      if (t2Ok && !(await waitMainTurn(frames, turnsText[1], groupDeadline)).ok) timeouts.push('turn2')
      await settleAll(2)
    } else if (entry.kind === 'stop') {
      workerStillRunningAtTurn2 = currentGroup.workers.map((w) => !w.frames.some((f) => f?.type === 'event' && f.event?.type === 'turn/end'))
      const t2Start = Date.now()
      let t2Ok = true
      await promptTurn(client, M, turnsText[1]).catch((e) => { timeouts.push(`prompt2:${String(e?.message ?? e)}`); t2Ok = false })
      if (t2Ok && !(await waitMainTurn(frames, turnsText[1], groupDeadline)).ok) timeouts.push('turn2')
      turn2DelayMs = Date.now() - t2Start
      await settleAll(1)
    } else { // single / parallel
      await settleAll(1)
    }
  }

  // outcome：超时 > turn-error > runtime-exit > turn/end
  const hasTurnError = frames.some((f) => f?.type === 'event' && f.event?.type === 'turn/end' && f.event?.data?.reason?.kind === 'error')
  const outcome = timeouts.length > 0 ? 'timeout' : hasTurnError ? 'turn-error' : (runtimeExited ? 'runtime-exit' : 'turn/end')

  await sleep(300)
  try { stream.cancel() } catch { /* 已关 */ }
  for (const w of currentGroup.workers) { try { w.stream.cancel() } catch { /* 已关 */ } }
  await sleep(150)

  const recRows = recorderRows(M)
  const rawPath = reserveName(join(EVID, 'raw', `${gid}.jsonl`))
  const metaLine = {
    type: 'd3o-meta', ts: new Date().toISOString(), promptId: entry.id, kind: entry.kind, rep,
    sessionId: M, cwd: work, agentPreset: header?.agentPreset ?? null,
    model: recRows[0]?.model ?? null, provider: recRows[0]?.provider ?? null,
    toolNames: recRows[0]?.toolNames ?? null, llmBase: llmBaseUsed,
    outcome, frameCount: frames.length, timeouts, retryCount: groupRetryCount, rateLimited,
    retryAfterMs: rateLimited ? retry429Delay(rateLimitDetails, groupRetryCount) : null,
    ...(turn2DelayMs !== null ? { turn2DelayMs } : {}), ...(workerStillRunningAtTurn2 !== null ? { workerStillRunningAtTurn2 } : {}),
    workers: currentGroup.workers.map((w, i) => ({ sessionId: w.sessionId, name: w.name, raw: `${gid}.w${i + 1}.jsonl` })),
  }
  const lines = [JSON.stringify(metaLine)]
  if (header) lines.push(JSON.stringify({ type: 'snapshot-header', header }))
  for (const f of frames) lines.push(JSON.stringify(f))
  writeFileSync(rawPath, lines.join('\n') + '\n')
  for (const [i, w] of currentGroup.workers.entries()) {
    const wMeta = { type: 'd3o-worker-meta', ts: new Date().toISOString(), promptId: entry.id, rep, retryCount: groupRetryCount, workerId: w.sessionId, name: w.name, assignPrompt: w.prompt, createdBy: M, frameCount: w.frames.length }
    const wLines = [JSON.stringify(wMeta)]
    for (const f of w.frames) wLines.push(JSON.stringify(f))
    writeFileSync(reserveName(join(EVID, 'raw', `${gid}.w${i + 1}.jsonl`)), wLines.join('\n') + '\n')
  }
  const workersOut = metaLine.workers
  currentGroup = null
  return { entry, rep, sessionId: M, outcome, frameCount: frames.length, workers: workersOut, rawPath, timeouts }
}

// snapshotFrames 由 client.mjs 动态 import（runGroup 用；包一层便于替换）。
let snapshotFramesOf = (snapshot) => []

// ── smoke 断言（接线验证：通道往返 / assign 首条 / 回报投递+消化 / 工具表 / raw 形状） ──

function smokeAssert(summary) {
  const g = summary[0]
  const fails = []
  const ok = (cond, label) => { if (!cond) fails.push(label) }
  if (g === undefined) { console.error('SMOKE FAIL：没有组记录'); return 1 }
  if (g.rawPath === null || !fileExists(g.rawPath)) { console.error(`SMOKE FAIL：组没有 raw 记录（outcome=${g.outcome}）`); return 1 }
  const lines = readFileSync(g.rawPath, 'utf8').split('\n').filter((l) => l.trim() !== '')
  const meta = JSON.parse(lines[0])
  const frames = lines.slice(1).map((l) => JSON.parse(l))
  const events = frames.filter((f) => f.type === 'event').map((f) => f.event)
  const callIds = events.filter((e) => e.type === 'tool/call' && e.data?.name === 'create_bot').map((e) => e.data.callId)
  ok(callIds.length === 1, `主帧恰 1 次 create_bot 调用（实际 ${callIds.length}）`)
  const createResult = events.find((e) => e.type === 'tool/result' && callIds.includes(e.data?.message?.toolCallId))
  ok(createResult !== undefined && createResult.data.message.isError !== true, `create_bot 工具结果成功（实际 ${createResult ? String(createResult.data.message.isError) : '无结果'}）`)
  const wRaw = join(EVID, 'raw', `${g.entry.id}-${g.rep}.w1.jsonl`)
  ok(fileExists(wRaw), 'worker raw 存在')
  if (fileExists(wRaw)) {
    const wl = readFileSync(wRaw, 'utf8').split('\n').filter((l) => l.trim() !== '')
    const wMeta = JSON.parse(wl[0])
    const wEvents = wl.slice(1).map((l) => JSON.parse(l)).filter((f) => f.type === 'event').map((f) => f.event)
    const firstUser = wEvents.find((e) => e.type === 'user/message')
    ok(firstUser?.data?.id?.startsWith('pbots-assign:') === true, `worker 首条 user/message 是 pbots-assign:*（实际 ${firstUser?.data?.id ?? '无'}）`)
    ok((firstUser?.data?.source?.kind ?? '') === 'pbots-main', 'assign 来源 pbots-main')
    ok(wEvents.some((e) => e.type === 'turn/end'), 'worker 有 turn/end')
    ok(wMeta.createdBy === meta.sessionId, 'worker meta.createdBy = 主会话')
    const recW = recorderRows(wMeta.workerId)[0]
    ok(recW != null && !recW.toolNames.includes('create_bot'), `worker 工具表不含 create_bot（实际含 ${String(recW?.toolNames?.includes('create_bot'))}）`)
  }
  const reportIdx = frames.findIndex((f) => f.type === 'event' && f.event?.type === 'user/message' && f.event.data?.source?.kind === 'pbots-worker')
  ok(reportIdx >= 0, '主帧有 pbots-worker 回报')
  ok(reportIdx >= 0 && frames.slice(reportIdx + 1).some((f) => f.type === 'event' && f.event?.type === 'turn/end'), '回报回合被消化（其后有 turn/end）')
  const recM = recorderRows(meta.sessionId)[0]
  ok(recM != null && ['create_bot', 'send_to_bot', 'stop_bot'].every((t) => recM.toolNames.includes(t)), `主 bot 工具表含三件协调者工具（bot 类实际 ${String(recM?.toolNames?.filter((t) => t.includes('bot')).join(','))}）`)

  if (fails.length > 0) {
    console.error(`SMOKE FAIL (${fails.length}):`)
    for (const f of fails) console.error(`  - ${f}`)
    return 1
  }
  console.log('SMOKE PASS：通道往返 / assign 首条 / 回报投递+消化 / 主工具表含协调者 / worker 工具表不含 / raw 形状')
  return 0
}

/** run-meta 落盘（累积合并：断点续跑保留早前批次记录）。返回路径。 */
function writeRunMeta(summary, { smoke, model, llmBase, litellm }) {
  const metaPath = join(EVID, 'raw', 'run-meta.json')
  let prevEntries = []
  try { prevEntries = JSON.parse(readFileSync(metaPath, 'utf8')).entries ?? [] } catch { /* 首写 */ }
  const merged = new Map(prevEntries.map((e) => [`${e.id}-${e.rep}`, e]))
  for (const s of summary) {
    merged.set(`${s.entry.id}-${s.rep}`, {
      id: s.entry.id, rep: s.rep, kind: s.entry.kind, outcome: s.outcome, sessionId: s.sessionId ?? null,
      raw: s.rawPath === null ? null : `${s.entry.id}-${s.rep}.jsonl`,
      workers: (s.workers ?? []).map((w) => ({ sessionId: w.sessionId, name: w.name })),
    })
  }
  writeFileSync(metaPath, JSON.stringify({
    ts: new Date().toISOString(), mode: smoke ? 'smoke' : 'real', model, llmBase, litellm,
    groupDelayMs: GROUP_DELAY_MS, entries: [...merged.values()].sort((a, b) => (a.id === b.id ? a.rep - b.rep : a.id < b.id ? -1 : 1)),
  }, null, 2) + '\n')
  return metaPath
}

// ── 采集主体（--smoke 与真模型共用） ──

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--check')) return check()
  const smoke = argv.includes('--smoke')
  const keep = argv.includes('--keep')
  const force = argv.includes('--force')
  const onlyIdx = argv.findIndex((a) => a.startsWith('--only'))
  let only = null
  if (onlyIdx >= 0) {
    const inline = /^--only=(.*)$/.exec(argv[onlyIdx])?.[1]
    only = (inline ?? (argv[onlyIdx + 1] ?? '')).split(',').map((s) => s.trim()).filter((s) => s !== '' && !s.startsWith('--'))
    if (only.length === 0) only = null
  }

  const { connect, snapshotFrames } = await import(pathToFileURL(join(SDK, 'examples', 'lib', 'client.mjs')).href)
  snapshotFramesOf = snapshotFrames

  const KEY = smoke ? 'smoke' : (process.env.P2SDK_LLM_API_KEY || process.env.LITELLM_MASTER_KEY || '')
  if (!smoke && !KEY) { console.error('真模型需要 P2SDK_LLM_API_KEY（或 LITELLM_MASTER_KEY）；key 不会打印或落盘'); return 1 }
  const llmBase = process.env.P2SDK_LLM_BASE_URL || 'http://127.0.0.1:4001'
  const model = process.env.P2SDK_LLM_MODEL || DEFAULT_MODEL
  llmBaseUsed = llmBase

  // LiteLLM route 可达性探测（real only；key 不落盘）。
  let litellm = null
  if (!smoke) {
    try {
      const res = await fetch(`${llmBase.replace(/\/+$/, '')}/v1/models`, { headers: { authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(5000) })
      const j = await res.json()
      const ids = (j.data ?? []).map((m) => m.id)
      litellm = { ok: res.ok, hasModel: ids.includes(model), modelCount: ids.length }
      if (!litellm.hasModel) { console.error(`LiteLLM 没有模型 ${model}（共 ${ids.length} 个）`); return 1 }
    } catch (e) { console.error(`LiteLLM 探测失败: ${String(e?.message ?? e)}`); return 1 }
  }

  const cases = smoke ? [{ id: 'smoke1', kind: 'single', prompt: '冒烟：建一个 a.txt，内容一行 hi，然后告诉我结果。' }] : loadPrompts()
  const reps = smoke ? 1 : Number(process.env.P622_REPS || 3)

  const rec = recorderOverlay()
  rmSync(ROOT, { recursive: true, force: true })
  for (const d of ['home', 'dsh', 'handoff', 'data', 'work']) mkdirSync(join(ROOT, d), { recursive: true })
  mkdirSync(join(EVID, 'raw'), { recursive: true })
  writeBotsJson('p620-boot', undefined) // f2 fail closed：首会话前 bots.json 健康

  // smoke overlay：fake provider（agent-default-model 指到 p2fake）。
  let smokeOverlay = ''
  if (smoke) {
    const dir = join(ROOT, 'smoke-overlay.yml')
    writeFileSync(dir, `\
# P6-20 smoke overlay (fake provider; scripts at $DSH_HOME/fake/scripts)
- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: '${pathToFileURL(FAKE_PLUGIN).href}'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: p2fake
                contextWindow: 131072
`)
    smokeOverlay = `:${dir}`
  }

  const env = {
    PATH: process.env.PATH,
    HOME: join(ROOT, 'home'),
    P2SDK_PROVIDER: smoke ? 'mock' : 'real',
    P2SDK_HOME: join(ROOT, 'dsh'),
    P2SDK_HANDOFF: join(ROOT, 'handoff'),
    P2SDK_PORT: '0',
    P2SDK_PATCH: `${ORCH_YML}:${rec.overlay}${smokeOverlay}`,
    P2SDK_READY_TIMEOUT_MS: '180000',
    PBOTS_DATA_DIR: join(ROOT, 'data'),
    // LEARNINGS 2026-11-04：start.ts 不透传 PBOTS_DATA_DIR，orch identity 必须
    // 显式 P2SDK_ORCH_DATA_DIR（P2SDK_ 前缀能穿 childEnv allowlist）。
    P2SDK_ORCH_DATA_DIR: join(ROOT, 'data'),
    DSH_TELEMETRY_MODE: 'DISABLED',
    P2SDK_LLM_BASE_URL: llmBase,
    P2SDK_LLM_MODEL: model,
  }
  if (!smoke) env.P2SDK_LLM_API_KEY = KEY

  console.log(`[d3o] spawn start.mjs mode=${smoke ? 'smoke(fake)' : 'real'} model=${model}`)
  const child = spawn(process.execPath, [join(SDK, 'scripts', 'start.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
  child.stdout.on('data', (c) => process.stdout.write(`[sdk] ${c}`))
  child.stderr.on('data', (c) => { stderr += c; if (/\b429\b|rate.?limit|too many requests/i.test(c)) { rateLimited = true; rateLimitDetails += c } process.stderr.write(`[sdk] ${c}`) })
  child.on('exit', () => { runtimeExited = true })
  const dshPid = () => Number(/^p2sdk: dsh pid (\d+)$/m.exec(stderr)?.[1] ?? 0) || 0

  let mainClient = null
  let answerClient = null
  let orchStream = null
  const answered = new Set()
  let autoAnswerTimer = null
  const summary = []
  let runFailed = false

  const cleanup = async () => {
    if (autoAnswerTimer) clearInterval(autoAnswerTimer)
    try { orchStream?.cancel() } catch { /* 已关 */ }
    try { mainClient?.close() } catch { /* 已关 */ }
    try { answerClient?.close() } catch { /* 已关 */ }
    if (child.exitCode === null && !runtimeExited) {
      child.kill('SIGTERM')
      const until = Date.now() + 8000
      while (child.exitCode === null && Date.now() < until) await sleep(200)
    }
    const dp = dshPid()
    if (dp > 0) {
      try { process.kill(dp, 0); process.kill(dp, 'SIGTERM') } catch { /* 已退出 */ }
      const until = Date.now() + 8000
      while (Date.now() < until) { try { process.kill(dp, 0); await sleep(200) } catch { break } }
      try { process.kill(dp, 0); process.kill(dp, 'SIGKILL') } catch { /* 已退出 */ }
    }
    rmSync(rec.dir, { recursive: true, force: true })
    if (!keep && !runFailed) rmSync(ROOT, { recursive: true, force: true })
    else console.log(`[d3o] 运行时目录保留：${ROOT}（手工清理：rm -rf ${ROOT}）`)
  }
  process.on('SIGINT', () => {
    runFailed = true
    void cleanup().then(() => {
      try { writeRunMeta(summary, { smoke, model, llmBase, litellm }) } catch { /* 尽力 */ }
      process.exit(130)
    })
  })

  // 本进程扮演 main：⑤ 通道订阅（live 测试 subscribe 同款；串行处理请求）。
  const handleCreate = async (item) => {
    if (item.mainBotId !== currentGroup?.mainId) {
      console.error(`[d3o] 通道请求 mainBotId 失配：${item.mainBotId}（当前组 ${currentGroup?.mainId ?? '无'}）`)
      await mainClient.call(ORCH_RESPOND, { request: { requestId: item.requestId, error: { code: 'p620/main-mismatch', message: 'no active group for this mainBotId' } } }).catch(() => {})
      return
    }
    // 镜像 ui/main/m3-meta/orchestrate.ts createWorkerBot：mint → createdBy 先
    // 落盘 → session/create(sessionId, cwd) → rename → respond。
    const botId = `session-${randomUUID()}`
    const workspace = join(ROOT, 'data', 'workspaces', botId)
    mkdirSync(workspace, { recursive: true })
    writeBotsJson(item.mainBotId, (bots) => ({ ...bots, [botId]: { createdBy: item.mainBotId } }))
    await mainClient.call('session/create', { request: { sessionId: botId, cwd: workspace } })
    let warn
    try { await mainClient.call('session/rename', { request: { sessionId: botId, title: item.name } }) } catch (e) { warn = `rename failed: ${String(e?.message ?? e)}` }
    const { stream, snapshot } = await mainClient.follow(botId, { assistantStream: true, awaitSnapshot: true })
    const worker = { sessionId: botId, name: item.name, prompt: item.prompt, frames: [...snapshotFramesOf(snapshot)], stream }
    void (async () => { for await (const f of stream) { worker.frames.push(f); if (detect429([f])) { rateLimited = true; rateLimitDetails += JSON.stringify(f.event.data) } } })().catch(() => {})
    currentGroup.workers.push(worker)
    console.log(`[d3o] worker created #${currentGroup.workers.length}`)
    await mainClient.call(ORCH_RESPOND, { request: { requestId: item.requestId, value: { sessionId: botId, ...(warn !== undefined ? { warn } : {}) } } })
  }

  try {
    // ready 判据同 D3：handoff base-url 文件（0600）先于 ready 行落盘。
    const handoffBase = join(ROOT, 'handoff', 'base-url')
    let booted = false
    const bootDeadline = Date.now() + 180_000
    while (Date.now() < bootDeadline) {
      if (runtimeExited) throw new Error(`runtime 提前退出（code ${child.exitCode}）\n${stderr.slice(-2000)}`)
      if (fileExists(handoffBase)) { booted = true; break }
      await sleep(300)
    }
    if (!booted) throw new Error(`runtime 180s 内未 ready\n${stderr.slice(-2000)}`)
    const baseUrl = readFileSync(handoffBase, 'utf8').trim()
    const token = readFileSync(join(ROOT, 'handoff', 'launch-token'), 'utf8').trim()
    mainClient = await connect({ baseUrl, token })
    answerClient = await connect({ baseUrl, token, interactions: 'answer' })

    // ⑤ 通道订阅
    orchStream = await mainClient.socket.open(ORCH_REQUESTS, {})
    void (async () => {
      const it = orchStream[Symbol.asyncIterator]()
      const first = await it.next()
      if (first.done || first.value?.ready !== true) { console.error(`[d3o] orch stream 未 ready: ${JSON.stringify(first.value ?? null)}`); return }
      for (;;) {
        const nx = await it.next()
        if (nx.done) return
        const item = nx.value
        if (item?.ready === true) continue
        if (item?.kind === 'create-bot') await handleCreate(item).catch((e) => console.error(`[d3o] handleCreate 失败: ${String(e?.message ?? e)}`))
      }
    })().catch(() => { /* SDK 退出时流断开属预期 */ })

    // $events 自动作答：审批 allowed-once；提问选第一项（防 worker 挂死）。
    const eframes = []
    const estream = await answerClient.socket.open('$events', {})
    void (async () => { for await (const f of estream) eframes.push(f) })().catch(() => {})
    for (let i = 0; i < 100 && !eframes.some((f) => f.type === 'ready'); i++) await sleep(100)
    const clientId = eframes.find((f) => f.type === 'ready')?.clientId ?? ''
    let questionsAnswered = 0
    autoAnswerTimer = setInterval(() => {
      for (let i = 0; i < eframes.length; i++) {
        const f = eframes[i]
        if (f?.type !== 'waterfall' || !f.eventId || answered.has(f.eventId)) continue
        if (f.event === 'approval/request') {
          answered.add(f.eventId)
          void answerClient.call('$events/result', { clientId, eventId: f.eventId, outcome: { kind: 'result', value: 'allowed-once' } })
            .catch((e) => console.error(`[d3o] 审批作答失败 ${f.eventId}: ${String(e?.message ?? e)}`))
        } else if (f.event === 'user-questions/request') {
          answered.add(f.eventId)
          questionsAnswered += 1
          const qs = f.request?.questions ?? []
          const answers = qs.map((q) => {
            const label = q.options?.[0]?.label
            return label !== undefined ? { id: q.id, selected: [label] } : { id: q.id, selected: [], custom: '请按你的判断继续完成' }
          })
          console.log(`[d3o] 自动作答提问 ${f.eventId}（${qs.length} 问，第一项）`)
          void answerClient.call('$events/result', { clientId, eventId: f.eventId, outcome: { kind: 'result', value: { answers } } })
            .catch((e) => console.error(`[d3o] 提问作答失败 ${f.eventId}: ${String(e?.message ?? e)}`))
        }
      }
    }, 200)

    // smoke：worker 走 default.json（通道铸的 id 不可知）；主脚本构造器供 runGroup。
    if (smoke) {
      const scripts = join(ROOT, 'dsh', 'fake', 'scripts')
      mkdirSync(scripts, { recursive: true })
      const text = (t) => ({
        paceMs: 5,
        chunks: [
          { type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: t }, { type: 'block-end', index: 0, block: { type: 'text', text: t } },
          { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'stop' } },
        ],
      })
      smokeScripts = { text }
      writeFileSync(join(scripts, 'default.json'), JSON.stringify({ calls: [text('干完了：a.txt 已建，内容 hi')] }))
      console.log('[d3o] smoke 脚本就绪（worker 走 default.json）')
    }

    // ── 组循环（串行 + 组间延迟；raw 已有即跳过 → 断点续跑） ──
    let consecutiveErrors = 0
    const pending = []
    for (const entry of cases) for (let rep = 1; rep <= reps; rep++) pending.push({ entry, rep })
    const selected = only === null ? pending : pending.filter((t) => only.includes(t.entry.id))
    const todo = process.env.P622_SENTINEL_ONCE === '1' ? selected.filter((t) => !['direct', 'chat'].includes(t.entry.kind) || t.rep === 1) : selected
    const exactGroups = process.env.P622_GROUPS?.split(',')
    for (const t of todo) {
      if (exactGroups && !exactGroups.includes(`${t.entry.id}-${t.rep}`)) continue
      groupRetryCount = 0
      const gid = `${t.entry.id}-${t.rep}`
      if (!force && fileExists(join(EVID, 'raw', `${gid}.jsonl`))) { console.log(`[d3o] 跳过已有 ${gid}`); continue }
      if (runtimeExited) { console.error('[d3o] runtime 已退出，收尾'); runFailed = true; break }
      let r
      try {
        while (true) {
          rateLimited = false
          rateLimitDetails = ''
          r = await runGroup(mainClient, t.entry, t.rep, smoke)
          if (!rateLimited) break
          const delay = retry429Delay(rateLimitDetails, groupRetryCount)
          if (delay === null) break
          groupRetryCount++
          console.log(`[d3o] ${gid} short-429 retry=${groupRetryCount}/3 delayMs=${delay}`)
          await sleep(delay)
        }
      } catch (e) {
        r = { entry: t.entry, rep: t.rep, outcome: 'group-error', error: String(e?.message ?? e), timeouts: [], workers: [], frameCount: 0, rawPath: null }
        console.error(`[d3o] ${gid} 异常: ${r.error}`)
      }
      summary.push(r)
      writeRunMeta(summary, { smoke, model, llmBase, litellm })
      console.log(`[d3o] ${gid} outcome=${r.outcome} mainFrames=${r.frameCount} workers=${r.workers.length} approvals=${answered.size} questions=${questionsAnswered} timeouts=${(r.timeouts ?? []).join('|') || '-'}`)
      if (rateLimited) { console.error('[d3o] 429 detected: long retry-after or bounded retries exhausted; stop'); runFailed = true; break }
      const errored = r.outcome === 'turn-error' || r.outcome === 'runtime-exit' || r.outcome === 'group-error'
      consecutiveErrors = errored ? consecutiveErrors + 1 : 0
      if (consecutiveErrors >= 3) { console.error('[d3o] 连续 3 组出错（疑似限流/断链），提前收尾；已完成组均已落盘'); break }
      if (t !== todo[todo.length - 1]) await sleep(GROUP_DELAY_MS)
    }
    const done = new Set([...summary.map((s) => `${s.entry.id}-${s.rep}`), ...todo.filter((t) => !force && fileExists(join(EVID, 'raw', `${t.entry.id}-${t.rep}.jsonl`))).map((t) => `${t.entry.id}-${t.rep}`)])
    const left = todo.filter((t) => !done.has(`${t.entry.id}-${t.rep}`)).map((t) => `${t.entry.id}-${t.rep}`)
    if (left.length > 0) console.log(`[d3o] 未完成组：${left.join(' ')}`)

    // run-meta（累积合并：断点续跑保留早前批次记录）
    const metaPath = writeRunMeta(summary, { smoke, model, llmBase, litellm })
    console.log(`[d3o] run-meta → ${metaPath}`)

    if (smoke) return smokeAssert(summary)
    return 0
  } catch (e) {
    runFailed = true
    throw e
  } finally {
    await cleanup()
  }
}

main().then((code) => process.exit(code ?? 0), (e) => { console.error(`[d3o] FATAL: ${e?.stack ?? e}`); process.exit(1) })
