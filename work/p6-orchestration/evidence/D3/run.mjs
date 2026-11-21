#!/usr/bin/env node
// P6-02 D3 事件采集器（PLAN p6-orchestration P6-02 交付 3/3）。
//
// 直接 spawn app/sdk/scripts/start.mjs 起真实 SDK —— 不 import
// tests/support/runtime.ts（它硬编码 P2SDK_PROVIDER='mock' 且属 P5-H1 改区）；
// 客户端只读复用 app/sdk/examples/lib/client.mjs。
//
// 用法：
//   node run.mjs --check                          静态自检（不起 runtime）：
//     prompts.json 冻结集形状；p6-reply-style.yml 与 approval.yml 的
//     preset-standard 工具表逐 id 一致；plugin-manager/market 仍 disabled；
//     persona 段落 sha256。
//   node run.mjs --mock [--only id[,id...]]       mock 干跑（验收 ④）：1 条 +
//     standard 对照会话，断言 raw jsonl 含 turn/start…turn/end、header.
//     agentPreset='p6-reply'、元数据齐、p6-reply 与 standard 工具表逐 id 一致
//     且不含 plugin_manager。
//   node run.mjs [--only id[,id...]] [--dev]      真模型采集（默认 LiteLLM
//     glm-5.3-flash；key 取 P2SDK_LLM_API_KEY 或 LITELLM_MASTER_KEY，仅进子进程
//     env、绝不打印/落盘）。默认 d3 10 条 ×3 = 30 回合（P6-04 全量）；
//     --only 限定条目 ×1；--dev 用 dev 集。
//
// 全记录（BRIEF §6 D3）：每回合原始 follow 帧（含 opening snapshot 展开）写
// raw/<id>-<rep>.jsonl；重跑/失败都保留 —— 目标文件已存在时旧文件改名
// .prevN，新记录写主名。bash 调用触发 shell-ask 审批卡，本脚本经 $events
// 以 interactions=answer 客户端自动作答 allowed-once（真实链路，不放宽策略）。
//
// 运行时布局（沙箱内，用后即删）：/tmp/bot-p6-d3/{home,dsh,handoff,data,work/<id>-<rep>}。
// 会话 cwd 独立于 HOME/DSH_HOME（bwrap wrapper 拒绝 cwd 落在 --home 树内）。
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..')
const SDK = join(REPO_ROOT, 'app', 'sdk')
const EVID = HERE
const P6_YML = join(SDK, 'profile', 'patches', 'p6-reply-style.yml')
const APPROVAL_YML = join(SDK, 'profile', 'patches', 'approval.yml')
const ROOT = '/tmp/bot-p6-d3'
const DEFAULT_MODEL = 'glm-5.3-flash'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex')

// ── 静态解析（行级，零依赖；手法同 guard-plugin-manager.test.ts drift 用例） ──

/** 顶层或 insert 块内的 preset 覆盖行所辖块：起于 `- id: <rowId>`（0 或 4 空格缩进），止于同级下一行 / EOF（中间的空行与更深缩进行都属于本块）。 */
function presetBlock(text, rowId) {
  const rows = text.split('\n')
  const s = rows.findIndex((l) => l === `- id: ${rowId}` || l === `    - id: ${rowId}`)
  if (s < 0) return null
  const nextRow = rows[s].startsWith(' ') ? '    - id: ' : '- id: '
  let e = rows.length
  for (let k = s + 1; k < rows.length; k++) {
    if (rows[k].startsWith(nextRow)) { e = k; break }
  }
  return rows.slice(s, e)
}

/** 块首行（preset 覆盖行）缩进；其 plugins 顶层子行 = 缩进+6，plugin 自身属性行 = +8。 */
function blockBaseIndent(block) {
  return block === null ? 0 : /^(\s*)/.exec(block[0])[1].length
}

/** plugins 顶层子行的 id 序列（相对块首行 +6 缩进；cordis:group config 内 +10 嵌套行不收）。 */
function pluginIds(block) {
  const n = blockBaseIndent(block) + 6
  const re = new RegExp(`^ {${n}}- id: (\\S+)\\s*$`)
  return (block ?? [])
    .map((l) => re.exec(l)?.[1])
    .filter(Boolean)
}

/** 块内某个 plugin 行是否带紧随的 `disabled: true`（相对缩进 +8）。 */
function pluginDisabledTrue(block, pluginId) {
  const rows = block ?? []
  if (rows.length === 0) return false
  const base = blockBaseIndent(rows)
  const s = rows.findIndex((l) => l === `${' '.repeat(base + 6)}- id: ${pluginId}`)
  if (s < 0) return false
  for (let k = s + 1; k < rows.length; k++) {
    if (new RegExp(`^ {${base + 6}}- id: `).test(rows[k])) break
    if (rows[k] === `${' '.repeat(base + 8)}disabled: true`) return true
  }
  return false
}

/** `prefix: |` 起的 literal block 全文（dedent；plan-mode section 同法复用）。 */
function literalBlock(rows, startIdx) {
  const headIndent = /^(\s*)/.exec(rows[startIdx])[1].length
  const contentIndent = headIndent + 2
  const out = []
  for (let i = startIdx + 1; i < rows.length; i++) {
    const l = rows[i]
    if (l.trim() === '') { out.push(''); continue }
    if (/^(\s*)/.exec(l)[1].length < contentIndent) break
    out.push(l.slice(contentIndent))
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out.join('\n')
}

/** p6-reply 的 persona prefix（literal block）与其追加段落（首个空行之后）+ sha256。 */
function personaSection() {
  const block = presetBlock(readFileSync(P6_YML, 'utf8'), 'preset-p6-reply')
  if (block === null) throw new Error(`p6-reply-style.yml 没有 preset-p6-reply 行`)
  const idx = block.findIndex((l) => /^ {12,}prefix: \|$/.test(l))
  if (idx < 0) throw new Error('preset-p6-reply 的 persona 没有 `prefix: |` literal block')
  const prefix = literalBlock(block, idx)
  const cut = prefix.indexOf('\n\n')
  const base = cut >= 0 ? prefix.slice(0, cut) : prefix
  const section = cut >= 0 ? prefix.slice(cut + 2) : ''
  return { base, section, sha256: sha256(section) }
}

// ── --check：静态自检 ──

function loadPrompts() {
  const data = JSON.parse(readFileSync(join(EVID, 'prompts.json'), 'utf8'))
  if (!Array.isArray(data.d3) || !Array.isArray(data.dev)) throw new Error('prompts.json 缺 d3/dev 数组')
  return data
}

function check() {
  const fails = []
  const ok = (cond, label) => { if (!cond) fails.push(label) }

  const data = loadPrompts()
  const d3 = data.d3
  ok(d3.length === 10, `d3 恰 10 条（实际 ${d3.length}）`)
  ok(d3.filter((e) => e.kind === 'multi').length === 5, 'd3 恰 5 条 multi')
  ok(d3.filter((e) => e.kind === 'simple').length === 5, 'd3 恰 5 条 simple')
  ok(new Set(d3.map((e) => e.id)).size === d3.length, 'd3 id 唯一')
  ok(d3.every((e) => typeof e.prompt === 'string' && e.prompt.trim() !== ''), 'd3 每条 prompt 非空')
  ok(d3.every((e) => e.expect && e.expect.ack && e.expect.result), 'd3 每条有 expect.ack/result 要点')

  const yml = readFileSync(P6_YML, 'utf8')
  ok(!yml.split('\n').some((l) => l.includes('id: preset-standard')), 'yml 不含 preset-standard（不覆盖 standard 行）')
  const p6 = presetBlock(yml, 'preset-p6-reply')
  ok(p6 !== null, 'yml 有 preset-p6-reply insert 行')
  const std = presetBlock(readFileSync(APPROVAL_YML, 'utf8'), 'preset-standard')
  ok(std !== null, 'approval.yml 有 preset-standard 覆盖块')
  const a = pluginIds(p6)
  const b = pluginIds(std)
  ok(a.join(',') === b.join(','), `工具表逐 id 一致（p6 ${a.length} 个 vs standard ${b.length} 个：${a.join(',')} | ${b.join(',')}`)
  ok(pluginDisabledTrue(p6, 'tool-plugin-manager'), 'tool-plugin-manager 仍 disabled: true')
  ok(pluginDisabledTrue(p6, 'tool-plugin-market'), 'tool-plugin-market 仍 disabled: true')

  const { base, section, sha256: s } = personaSection()
  ok(base.includes('{{model}}') && base.startsWith('You are a coding agent'), 'persona 前缀 = standard 基础句')
  ok(section.trim() !== '', 'persona 追加段落非空')
  ok(readFileSync(join(REPO_ROOT, 'work', 'p6-orchestration', 'fixtures', 'prompts.md'), 'utf8').includes('冻结'), 'fixtures/prompts.md 存在')

  console.log(`p6-reply persona 段落 sha256: ${s}`)
  if (fails.length > 0) {
    console.error(`--check FAIL (${fails.length}):`)
    for (const f of fails) console.error(`  - ${f}`)
    return 1
  }
  console.log('--check PASS')
  return 0
}

// ── runtime 采集 ──

/** llm/stream 记录器 overlay（运行时生成，mkdtemp；工具表 + 采样参数记录，不记消息与凭证）。 */
function recorderOverlay() {
  const dir = mkdtempSync(join(tmpdir(), 'bot-p6-d3-rec-'))
  const overlay = join(dir, 'recorder.yml')
  writeFileSync(join(dir, 'recorder.mjs'), `\
// P6-02 D3 recorder: per-request model / sampling / tool names at llm/stream.
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'p6-d3-recorder'

export function apply(ctx) {
  ctx.on('llm/stream', (options, next) => {
    const home = process.env.DSH_HOME
    if (home !== undefined) {
      const pick = (k) => (options[k] === undefined ? null : options[k])
      appendFileSync(join(home, 'd3-llm.jsonl'), JSON.stringify({
        ts: Date.now(),
        sessionId: options.sessionId === undefined ? 'null' : String(options.sessionId),
        model: pick('model'), provider: pick('provider'),
        temperature: pick('temperature'), topP: pick('topP'), top_p: pick('top_p'),
        toolNames: (options.tools ?? []).map((t) => t.name).sort(),
      }) + '\\n')
    }
    return next()
  })
}
`)
  writeFileSync(overlay, `\
- insert:
    - id: p6-d3-recorder
      name: '${pathToFileURL(join(dir, 'recorder.mjs')).href}'
`)
  return { dir, overlay }
}

/** 目标路径占用时把旧文件改名 .prevN，新写入用主名（全记录：重跑都留）。 */
function reserveName(path) {
  let n = 2
  let candidate = `${path}.prev${n}`
  while (fileExists(candidate)) candidate = `${path}.prev${++n}`
  try { renameSync(path, candidate) } catch { /* 不存在：直接用主名 */ }
  return path
}

function fileExists(p) { try { readFileSync(p); return true } catch { return false } }

/** 读 $DSH_HOME/d3-llm.jsonl 中某 sessionId 的记录行（无则空数组）。 */
function recorderRows(home, sessionId) {
  const rows = []
  if (!fileExists(join(home, 'd3-llm.jsonl'))) return rows
  for (const line of readFileSync(join(home, 'd3-llm.jsonl'), 'utf8').split('\n')) {
    if (line.trim() === '') continue
    try {
      const r = JSON.parse(line)
      if (r.sessionId === sessionId) rows.push(r)
    } catch { /* 忽略撕裂行 */ }
  }
  return rows
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--check')) return check()

  const mode = argv.includes('--mock') ? 'mock' : 'real'
  const useDev = argv.includes('--dev')
  // --only=a,b 与 --only a,b 两种形式都收。
  const onlyIdx = argv.findIndex((a) => a.startsWith('--only'))
  let only = null
  if (onlyIdx >= 0) {
    const inline = /^--only=(.*)$/.exec(argv[onlyIdx])?.[1]
    only = (inline ?? (argv[onlyIdx + 1] ?? '')).split(',').map((s) => s.trim()).filter((s) => s !== '' && !s.startsWith('--'))
    if (only.length === 0) only = null
  }
  const data = loadPrompts()
  const pool = useDev ? data.dev : data.d3
  const entries = only ? pool.filter((e) => only.includes(e.id)) : pool
  if (entries.length === 0) { console.error('没有匹配的条目'); return 1 }
  const reps = only ? 1 : (useDev ? 1 : 3)

  const { connect, snapshotFrames } = await import(pathToFileURL(join(SDK, 'examples', 'lib', 'client.mjs')).href)

  const KEY = mode === 'real' ? (process.env.P2SDK_LLM_API_KEY || process.env.LITELLM_MASTER_KEY || '') : ''
  if (mode === 'real' && !KEY) {
    console.error('real 模式需要 P2SDK_LLM_API_KEY（或 LITELLM_MASTER_KEY）；key 不会被打印或落盘')
    return 1
  }
  const llmBase = process.env.P2SDK_LLM_BASE_URL || 'http://127.0.0.1:4001'
  const model = process.env.P2SDK_LLM_MODEL || DEFAULT_MODEL

  const { base: personaBase, sha256: sectionSha } = personaSection()

  // LiteLLM route 可达性探测（real only；不落 key）。
  let litellm = null
  if (mode === 'real') {
    try {
      const res = await fetch(`${llmBase.replace(/\/+$/, '')}/v1/models`, { headers: { authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(5000) })
      const j = await res.json()
      const ids = (j.data ?? []).map((m) => m.id)
      litellm = { ok: res.ok, hasModel: ids.includes(model), modelCount: ids.length }
    } catch (e) { litellm = { ok: false, hasModel: false, error: String(e?.message ?? e) } }
  }

  const rec = recorderOverlay()
  rmSync(ROOT, { recursive: true, force: true })
  for (const d of ['home', 'dsh', 'handoff', 'data', 'work']) mkdirSync(join(ROOT, d), { recursive: true })
  mkdirSync(join(EVID, 'raw'), { recursive: true })

  const env = {
    PATH: process.env.PATH,
    HOME: join(ROOT, 'home'),
    P2SDK_PROVIDER: mode,
    P2SDK_HOME: join(ROOT, 'dsh'),
    P2SDK_HANDOFF: join(ROOT, 'handoff'),
    P2SDK_PORT: '0',
    P2SDK_PATCH: `${P6_YML}:${rec.overlay}`,
    P2SDK_READY_TIMEOUT_MS: '180000',
    PBOTS_DATA_DIR: join(ROOT, 'data'),
    DSH_TELEMETRY_MODE: 'DISABLED',
    P2SDK_LLM_BASE_URL: llmBase,
    P2SDK_LLM_MODEL: model,
  }
  if (mode === 'real') env.P2SDK_LLM_API_KEY = KEY

  console.log(`[d3] spawn start.mjs provider=${mode} model=${model} preset=p6-reply`)
  const child = spawn(process.execPath, [join(SDK, 'scripts', 'start.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
  child.stdout.on('data', (c) => process.stdout.write(`[sdk] ${c}`))
  child.stderr.on('data', (c) => { stderr += c; process.stderr.write(`[sdk] ${c}`) })
  const dshPid = () => Number(/^p2sdk: dsh pid (\d+)$/m.exec(stderr)?.[1] ?? 0) || 0

  let mainClient = null
  let answerClient = null
  const answered = new Set()
  let autoAnswerTimer = null
  const summary = []

  const cleanup = async () => {
    if (autoAnswerTimer) clearInterval(autoAnswerTimer)
    try { mainClient?.close() } catch { /* 已关 */ }
    try { answerClient?.close() } catch { /* 已关 */ }
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      const until = Date.now() + 8000
      while (child.exitCode === null && Date.now() < until) await sleep(200)
    }
    const dp = dshPid()
    if (dp > 0) {
      try { process.kill(dp, 0); process.kill(dp, 'SIGTERM'); } catch { /* 已退出 */ }
      const until = Date.now() + 8000
      while (Date.now() < until) { try { process.kill(dp, 0); await sleep(200) } catch { break } }
      try { process.kill(dp, 0); process.kill(dp, 'SIGKILL') } catch { /* 已退出 */ }
    }
    rmSync(ROOT, { recursive: true, force: true })
    rmSync(rec.dir, { recursive: true, force: true })
  }
  process.on('SIGINT', () => { void cleanup().then(() => process.exit(130)) })

  try {
    // ready 判据：handoff 插件在 `[p2sdk] ready` 行写出前落 base-url 文件（0600）；
    // stdout 只回显不缓存，所以用文件而非 ready 行做闸门。
    const handoffBase = join(ROOT, 'handoff', 'base-url')
    let booted = false
    const bootDeadline = Date.now() + 180_000
    while (Date.now() < bootDeadline) {
      if (child.exitCode !== null) throw new Error(`runtime 提前退出（code ${child.exitCode}）\n${stderr.slice(-2000)}`)
      if (fileExists(handoffBase)) { booted = true; break }
      await sleep(300)
    }
    if (!booted) throw new Error(`runtime 180s 内未 ready\n${stderr.slice(-2000)}`)

    const baseUrl = readFileSync(handoffBase, 'utf8').trim()
    const token = readFileSync(join(ROOT, 'handoff', 'launch-token'), 'utf8').trim()
    mainClient = await connect({ baseUrl, token })
    answerClient = await connect({ baseUrl, token, interactions: 'answer' })
    const eframes = []
    const estream = await answerClient.socket.open('$events', {})
    void (async () => { for await (const f of estream) eframes.push(f) })().catch(() => {})
    // 等 $events ready（拿 clientId），随后轮询自动作答 approval/request → allowed-once。
    for (let i = 0; i < 100 && !eframes.some((f) => f.type === 'ready'); i++) await sleep(100)
    const clientId = eframes.find((f) => f.type === 'ready')?.clientId ?? ''
    autoAnswerTimer = setInterval(() => {
      for (let i = 0; i < eframes.length; i++) {
        const f = eframes[i]
        if (f?.type === 'waterfall' && f.event === 'approval/request' && !answered.has(f.eventId) && f.eventId) {
          answered.add(f.eventId)
          void answerClient.call('$events/result', { clientId, eventId: f.eventId, outcome: { kind: 'result', value: 'allowed-once' } })
            .catch((e) => console.error(`[d3] 审批作答失败 ${f.eventId}: ${String(e?.message ?? e)}`))
        }
      }
    }, 200)

    const turns = []
    for (const e of entries) for (let rep = 1; rep <= reps; rep++) turns.push({ entry: e, rep })
    for (const t of turns) {
      const r = await runTurn(mainClient, t.entry, t.rep)
      summary.push(r)
      console.log(`[d3] ${r.entry.id}#${r.rep} outcome=${r.outcome} frames=${r.frames.length} → ${r.rawPath}`)
    }

    // mock 干跑的自检（验收 ④）：turn/start…turn/end、preset、元数据、工具表对照。
    if (mode === 'mock') {
      const fails = []
      const first = summary[0]
      const types = first.frames.map((f) => f.type === 'event' && f.event?.type).filter(Boolean)
      if (!types.includes('turn/start')) fails.push('raw 帧缺 turn/start')
      if (!types.includes('turn/end')) fails.push('raw 帧缺 turn/end')
      if (first.header?.agentPreset !== 'p6-reply') fails.push(`header.agentPreset != p6-reply（实际 ${first.header?.agentPreset}）`)
      if (!first.rec?.model && !first.rec?.toolNames) fails.push('recorder 元数据缺失')
      if (!first.metaOk) fails.push('元数据字段不齐（sectionSha/model）')
      // standard 对照会话：工具表逐 id 一致且不含 plugin_manager。
      const stdTurn = await standardProbe(mainClient)
      const p6tools = first.rec?.toolNames ?? []
      const stdTools = stdTurn.rec?.toolNames ?? []
      if (p6tools.join(',') !== stdTools.join(',')) fails.push(`工具表不一致（p6 ${p6tools.length} vs std ${stdTools.length}）`)
      if (p6tools.includes('plugin_manager')) fails.push('p6-reply 工具表含 plugin_manager')
      console.log(`[d3] mock 自检：p6 工具 ${p6tools.length} 个 / standard ${stdTools.length} 个 / asked=${answered.size}`)
      if (fails.length > 0) { for (const f of fails) console.error(`  - ${f}`); throw new Error(`mock 干跑自检 FAIL`) }
      console.log('[d3] mock 自检 PASS')
    }

    const runMeta = {
      ts: new Date().toISOString(), mode, model, llmBase, litellm,
      presetSectionSha256: sectionSha, personaBaseFirstLine: personaBase.split('\n')[0],
      entries: summary.map((s) => ({ id: s.entry.id, rep: s.rep, outcome: s.outcome, sessionId: s.sessionId, raw: s.rawPath })),
    }
    const metaPath = reserveName(join(EVID, 'raw', 'run-meta.json'))
    writeFileSync(metaPath, JSON.stringify(runMeta, null, 2) + '\n')
    console.log(`[d3] run-meta → ${metaPath}`)
    return 0
  } finally {
    await cleanup()
  }

  /** 一个采集回合：新会话 + 显式 p6-reply + prompt + 等本会话 turn/end；帧全量落 jsonl。 */
  async function runTurn(client, entry, rep) {
    const work = join(ROOT, 'work', `${entry.id}-${rep}`)
    mkdirSync(work, { recursive: true })
    const { sessionId } = await client.call('session/create', { request: { cwd: work, agentPreset: 'p6-reply' } })
    const { stream, snapshot } = await client.follow(sessionId, { assistantStream: true, awaitSnapshot: true })
    const frames = [...snapshotFrames(snapshot)]
    const header = snapshot?.header ?? null
    let ended = false
    const drained = (async () => {
      for await (const f of stream) {
        frames.push(f)
        if (f.type === 'event' && f.event?.type === 'turn/end') { ended = true; break }
      }
    })().catch((e) => frames.push({ type: 'd3-error', message: String(e?.message ?? e) }))
    await client.call('session/prompt', {
      request: {
        requestId: `p6-d3-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        sessionId, mode: 'queue', content: [{ type: 'text', text: entry.prompt }],
      },
    })
    const timeoutMs = entry.kind === 'multi' ? 900_000 : 240_000
    const deadline = Date.now() + timeoutMs
    while (!ended && Date.now() < deadline && child.exitCode === null) await sleep(500)
    const outcome = ended ? 'turn/end' : (child.exitCode !== null ? 'runtime-exit' : 'timeout')
    stream.cancel()
    await sleep(150)
    void drained

    const recRows = recorderRows(join(ROOT, 'dsh'), sessionId)
    const rec = recRows[0] ?? null
    const metaOk = Boolean(sectionSha) && Boolean(header?.agentPreset)
    const rawPath = reserveName(join(EVID, 'raw', `${entry.id}-${rep}.jsonl`))
    const metaLine = {
      type: 'd3-meta', ts: new Date().toISOString(), promptId: entry.id, kind: entry.kind, rep,
      sessionId, cwd: work, agentPreset: header?.agentPreset ?? null,
      model: rec?.model ?? model, provider: rec?.provider ?? null,
      temperature: rec?.temperature ?? null, topP: rec?.topP ?? rec?.top_p ?? null,
      llmBase, presetSectionSha256: sectionSha, outcome, frameCount: frames.length + 1,
      toolNames: rec?.toolNames ?? null, metaOk,
    }
    const lines = [JSON.stringify(metaLine)]
    if (header) lines.push(JSON.stringify({ type: 'snapshot-header', header }))
    for (const f of frames) lines.push(JSON.stringify(f))
    writeFileSync(rawPath, lines.join('\n') + '\n')
    return { entry, rep, sessionId, outcome, frames, header, rec, metaOk, rawPath }
  }

  /** mock 干跑的 standard 对照回合（默认 preset，warm 一回合拿工具表记录）。 */
  async function standardProbe(client) {
    const work = join(ROOT, 'work', 'std-probe')
    mkdirSync(work, { recursive: true })
    const { sessionId } = await client.call('session/create', { request: { cwd: work } })
    const { stream, snapshot } = await client.follow(sessionId, { assistantStream: true, awaitSnapshot: true })
    const frames = [...snapshotFrames(snapshot)]
    let ended = false
    void (async () => { for await (const f of stream) { frames.push(f); if (f.type === 'event' && f.event?.type === 'turn/end') { ended = true; break } } })().catch(() => {})
    await client.call('session/prompt', {
      request: { requestId: `p6-d3-std-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: '工具表对照探针' }] },
    })
    const deadline = Date.now() + 60_000
    while (!ended && Date.now() < deadline) await sleep(300)
    stream.cancel()
    const rec = recorderRows(join(ROOT, 'dsh'), sessionId)[0] ?? null
    return { sessionId, header: snapshot?.header ?? null, rec }
  }
}

main().then((code) => process.exit(code ?? 0), (e) => { console.error(`[d3] FATAL: ${e?.stack ?? e}`); process.exit(1) })
