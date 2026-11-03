#!/usr/bin/env node
// P6-04 D3 计分器（PLAN p6-orchestration P6-04）。消费 raw/<id>-<rep>.jsonl（主名 =
// 最新一次采集；.prevN 是历史记录、保留不删但不计分——全记录与「禁止挑选」由
// run.mjs 的 reserveName 落实），帧经 reduce.ts 归约再过 foldTurns（P6-01）计分，
// 判定不另写（PLAN 捷径列：直接 import，不重实现）。
//
// 用法：
//   node score.mjs [--selftest]        计分 raw/ → result.json + stdout 数字表
//   node score.mjs --selftest          只跑内嵌自检（合成帧 → 指标断言）
//
// D3 口径（BRIEF §6 D3 + PLAN P6-04 验收）：
//   multi  ok = 有 ≥1 工作工具 && 首个工作工具前有非空正文（ack）&& 有真 result
//               （末个工作工具之后的正文，(c) 升级的中间文本不算）&& 不走兜底
//               (c)/(d) && endReason=completed && outcome=turn/end。
//               ack-only（有 ack 无 result）计失败；无工作工具计失败。
//   simple ok = 恰 1 个气泡 && 0 工具调用 && 无 (b)/(d)/(e) notice &&
//               endReason=completed && outcome=turn/end。
//   工作工具 = 工具表排除纯呈现/通信类（send_message / present / ask_user_question）
//   ——G1-r1-B MEDIUM「ack 自身也可能是工具调用」的落实。
//   阈值：multi ≥12/15、simple ≥14/15。
// 阈值未达标不修提示词（调词属 dev 轮，不得看 prompts.json）。
//
// 确定性（验收：重跑出同一 result.json）：无生成时间戳，perTurn 按冻结集顺序排序，
// raw 文件记 sha256。
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..')
const RAW = join(HERE, 'raw')

// 类型剥离直接 import（node ≥22.18 默认开启；两文件均为可擦除语法，无运行时依赖）
const { foldTurns } = await import(join(REPO_ROOT, 'app', 'ui', 'renderer', 'fold', 'turn-fold.ts'))
const { initView, reduceFollow } = await import(join(REPO_ROOT, 'app', 'ui', 'renderer', 'plugins', 'session', 'reduce.ts'))

const THRESHOLD = { multi: 12, simple: 14 }
const REPS = 3
/** 非工作工具：纯呈现 / 通信（不构成「干活」；不因其切开 ack 位）。 */
const NON_WORK_TOOLS = new Set(['send_message', 'present', 'ask_user_question'])

const sha256File = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

function loadPrompts() {
  const data = JSON.parse(readFileSync(join(HERE, 'prompts.json'), 'utf8'))
  if (!Array.isArray(data.d3) || data.d3.length !== 10) throw new Error('prompts.json d3 不是 10 条')
  return data.d3
}

/** 一个回合的计分核心：meta = d3-meta 行（可合成），frames = follow 下行帧数组。 */
function scoreTurn(meta, frames) {
  let view = initView(meta.sessionId ?? 'selftest')
  for (const f of frames) view = reduceFollow(view, f)
  const { entries, streamingAs } = foldTurns(view.items, { hasMore: view.hasMore, running: view.running })

  // 回答区 = 首个 user 条目之后（每回合一个新会话、单条 prompt；多 turn 唤醒按整段计，
  // turnCount 记录供人工核查）。
  const userIdx = entries.findIndex((e) => e.kind === 'user')
  const answer = userIdx < 0 ? entries : entries.slice(userIdx + 1)
  const idxOf = new Map(entries.map((e, i) => [e, i]))
  const msgs = answer.filter((e) => e.kind === 'message')
  const tools = answer.filter((e) => e.kind === 'tool-call')
  const work = tools.filter((t) => !NON_WORK_TOOLS.has(t.name))
  const firstWork = work.length > 0 ? idxOf.get(work[0]) : -1
  const lastWork = work.length > 0 ? idxOf.get(work[work.length - 1]) : -1
  const ack = msgs.find((m) => idxOf.get(m) < firstWork) ?? null // 首工作工具前的非空正文（reduce 只出非空 text）
  const tailResult = lastWork >= 0 ? (msgs.find((m) => idxOf.get(m) > lastWork) ?? null) : null // 末工作工具后的正文
  const walkedC = firstWork >= 0 && msgs.some((m) => idxOf.get(m) > firstWork && idxOf.get(m) < lastWork) // (c) 把中间文本升了气泡
  const walkedD = answer.some((e) => e.kind === 'notice' && e.source === 'fold') // (d)「已完成，没有文字结果」
  const endNotice = answer.find((e) => e.kind === 'notice' && e.source === 'reduce' && /^end-\d+$/.test(e.id)) ?? null
  const hasMidText = answer.some((e) => e.kind === 'thinking' && e.from === 'text')
  const completed = meta.outcome === 'turn/end' && view.endReason === 'completed' && endNotice === null && !view.running

  const ok = meta.kind === 'multi'
    ? work.length >= 1 && ack !== null && tailResult !== null && !walkedC && !walkedD && completed
    : msgs.length === 1 && tools.length === 0 && !walkedD && endNotice === null && completed

  const excerpt = (s, n = 100) => (s === null ? null : (s.length > n ? `${s.slice(0, n)}…` : s))
  return {
    promptId: meta.promptId, kind: meta.kind, rep: meta.rep, outcome: meta.outcome ?? 'turn/end',
    sessionId: meta.sessionId ?? null, agentPreset: meta.agentPreset ?? null,
    model: meta.model ?? null, provider: meta.provider ?? null,
    temperature: meta.temperature ?? null, topP: meta.topP ?? null,
    endReason: view.endReason, turnCount: new Set(view.items.filter((i) => i.kind === 'assistant' || i.kind === 'thinking').map((i) => /^t(\d+)-/.exec(i.id)?.[1]).filter(Boolean)).size,
    metrics: {
      ok,
      ack: ack !== null,
      result: tailResult !== null,
      walkC: walkedC,
      walkD: walkedD,
      workTools: work.length,
      toolCalls: tools.length,
      nonWorkTools: tools.filter((t) => NON_WORK_TOOLS.has(t.name)).map((t) => t.name),
      bubbles: msgs.length,
      hasMidText,
      midFolded: hasMidText ? !walkedC : null, // 有中间正文时是否全部保持折叠（未靠 (c) 升泡）
    },
    fold: { entries, streamingAs },
    texts: {
      ack: excerpt(ack?.text ?? null),
      result: excerpt(tailResult?.text ?? null),
      first: excerpt(msgs[0]?.text ?? null), // simple 回合的整条回答 / 首气泡
      endNotice: excerpt(endNotice?.text ?? null),
    },
  }
}

/** 读一个 raw jsonl：首行 d3-meta + 余行帧（snapshot-header 跳过）。 */
function scoreFile(name) {
  const lines = readFileSync(join(RAW, name), 'utf8').split('\n').filter((l) => l.trim() !== '')
  const meta = JSON.parse(lines[0])
  if (meta.type !== 'd3-meta') throw new Error(`${name} 首行不是 d3-meta`)
  const frames = []
  for (const l of lines.slice(1)) {
    const f = JSON.parse(l)
    if (f.type !== 'snapshot-header') frames.push(f)
  }
  const rec = scoreTurn(meta, frames)
  rec.raw = { file: name, sha256: sha256File(join(RAW, name)), frameCount: meta.frameCount ?? frames.length + 1 }
  return rec
}

// ── 合成帧助手（自检） ──
const ev = (type, data) => ({ type: 'event', event: { type, time: 1, data } })
const userMsg = (text) => ev('user/message', { id: 'u1', source: { kind: 'user' }, content: [{ type: 'text', text }] })
const asst = (turn, step, text) => ev('assistant/message', { turn, step, message: { role: 'assistant', content: [{ type: 'text', text }] } })
const toolCall = (callId, name) => ev('tool/call', { callId, name, arguments: '{}' })
const toolDone = (callId) => ev('tool/result', { message: { toolCallId: callId, content: [{ type: 'text', text: 'ok' }], isError: false } })
const turnEnd = (kind) => ev('turn/end', { turn: 1, reason: { kind } })

function selftest() {
  const meta = (over = {}) => ({ type: 'd3-meta', promptId: 'x', rep: 1, outcome: 'turn/end', sessionId: 'st', ...over })
  const cases = [
    {
      name: 'multi 三段式全合规', kind: 'multi',
      frames: [userMsg('t'), ev('turn/start', { turn: 1 }), asst(1, 1, '收到，先建文件再读回'), toolCall('c1', 'bash'), toolDone('c1'), asst(1, 2, '中间说明'), toolCall('c2', 'write'), toolDone('c2'), asst(1, 3, 'todo.txt 已建好'), turnEnd('completed')],
      assert: (r) => r.metrics.ok === true && r.metrics.ack && r.metrics.result && !r.metrics.walkC && !r.metrics.walkD && r.metrics.midFolded === true && r.metrics.bubbles === 2,
    },
    {
      name: 'ack-only（无 result）计失败', kind: 'multi',
      frames: [userMsg('t'), ev('turn/start', { turn: 1 }), asst(1, 1, '收到'), toolCall('c1', 'bash'), toolDone('c1'), turnEnd('completed')],
      assert: (r) => r.metrics.ok === false && r.metrics.ack === true && r.metrics.result === false,
    },
    {
      name: '兜底 (c)（中间文本升泡）计失败', kind: 'multi',
      frames: [userMsg('t'), ev('turn/start', { turn: 1 }), asst(1, 1, '收到'), toolCall('c1', 'bash'), toolDone('c1'), asst(1, 2, '做完了，结果如下'), toolCall('c2', 'write'), toolDone('c2'), turnEnd('completed')],
      assert: (r) => r.metrics.ok === false && r.metrics.walkC === true && r.metrics.result === false && r.metrics.bubbles === 2,
    },
    {
      name: '兜底 (d)（全程无正文）计失败', kind: 'multi',
      frames: [userMsg('t'), ev('turn/start', { turn: 1 }), toolCall('c1', 'bash'), toolDone('c1'), turnEnd('completed')],
      assert: (r) => r.metrics.ok === false && r.metrics.walkD === true && r.metrics.ack === false,
    },
    {
      name: '多步无工具计失败', kind: 'multi',
      frames: [userMsg('t'), ev('turn/start', { turn: 1 }), asst(1, 1, '我建好了'), turnEnd('completed')],
      assert: (r) => r.metrics.ok === false && r.metrics.workTools === 0,
    },
    {
      name: 'send_message 不是工作工具', kind: 'multi',
      frames: [userMsg('t'), ev('turn/start', { turn: 1 }), toolCall('c1', 'send_message'), toolDone('c1'), asst(1, 2, '结果'), turnEnd('completed')],
      assert: (r) => r.metrics.workTools === 0 && r.metrics.nonWorkTools.join() === 'send_message' && r.metrics.ok === false,
    },
    {
      name: 'turn/end error 有尾文也计失败', kind: 'multi',
      frames: [userMsg('t'), ev('turn/start', { turn: 1 }), asst(1, 1, '收到'), toolCall('c1', 'bash'), toolDone('c1'), asst(1, 2, '结果'), turnEnd('error')],
      assert: (r) => r.metrics.ok === false && r.metrics.result === false && r.texts.endNotice !== null,
    },
    {
      name: 'simple 恰 1 气泡合规', kind: 'simple',
      frames: [userMsg('q'), ev('turn/start', { turn: 1 }), asst(1, 1, '42'), turnEnd('completed')],
      assert: (r) => r.metrics.ok === true && r.metrics.bubbles === 1 && r.metrics.toolCalls === 0,
    },
    {
      name: 'simple 两条正文 = 2 气泡计失败', kind: 'simple',
      frames: [userMsg('q'), ev('turn/start', { turn: 1 }), asst(1, 1, '收到'), asst(1, 2, '42'), turnEnd('completed')],
      assert: (r) => r.metrics.ok === false && r.metrics.bubbles === 2,
    },
    {
      name: 'simple 调了工具计失败', kind: 'simple',
      frames: [userMsg('q'), ev('turn/start', { turn: 1 }), toolCall('c1', 'bash'), toolDone('c1'), asst(1, 2, '42'), turnEnd('completed')],
      assert: (r) => r.metrics.ok === false && r.metrics.toolCalls === 1,
    },
    {
      name: '超时（running、无 turn/end）计失败', kind: 'simple', outcomeOverride: 'timeout',
      frames: [userMsg('q'), ev('turn/start', { turn: 1 })],
      assert: (r) => r.metrics.ok === false && r.outcome === 'timeout',
    },
  ]
  let failed = 0
  for (const c of cases) {
    const r = scoreTurn(meta({ kind: c.kind, outcome: c.outcomeOverride ?? 'turn/end' }), c.frames)
    const pass = c.assert(r)
    console.log(`${pass ? 'ok' : 'FAIL'}  ${c.name}`)
    if (!pass) { failed++; console.log(JSON.stringify(r.metrics)) }
  }
  return failed
}

function pct(n, d) { return d === 0 ? null : Math.round((n / d) * 1000) / 10 }

function main() {
  const prompts = loadPrompts()
  const perTurn = []
  const missing = []
  for (const p of prompts) {
    for (let rep = 1; rep <= REPS; rep++) {
      const name = `${p.id}-${rep}.jsonl`
      try { perTurn.push(scoreFile(name)) } catch { missing.push({ promptId: p.id, rep, file: name }) }
    }
  }
  const multi = perTurn.filter((r) => r.kind === 'multi')
  const simple = perTurn.filter((r) => r.kind === 'simple')
  const mOf = (arr, f) => arr.filter(f).length
  const sum = {
    totalTurns: perTurn.length + missing.length, missing: missing.length,
    multi: {
      n: multi.length + missing.filter((m) => m.promptId.startsWith('m')).length,
      pass: mOf(multi, (r) => r.metrics.ok),
      ack: mOf(multi, (r) => r.metrics.ack),
      result: mOf(multi, (r) => r.metrics.result),
      walkC: mOf(multi, (r) => r.metrics.walkC),
      walkD: mOf(multi, (r) => r.metrics.walkD),
      noWorkTool: mOf(multi, (r) => r.metrics.workTools === 0),
      midFolded: mOf(multi.filter((r) => r.metrics.hasMidText), (r) => r.metrics.midFolded === true),
      withMidText: mOf(multi, (r) => r.metrics.hasMidText),
    },
    simple: {
      n: simple.length + missing.filter((m) => m.promptId.startsWith('s')).length,
      pass: mOf(simple, (r) => r.metrics.ok),
      oneBubble: mOf(simple, (r) => r.metrics.bubbles === 1 && r.metrics.toolCalls === 0),
      noTool: mOf(simple, (r) => r.metrics.toolCalls === 0),
    },
  }
  sum.multi.ackRate = pct(sum.multi.ack, multi.length)
  sum.multi.resultRate = pct(sum.multi.result, multi.length)
  sum.multi.passRate = pct(sum.multi.pass, sum.multi.n)
  sum.multi.midFoldRate = pct(sum.multi.midFolded, sum.multi.withMidText)
  sum.simple.oneBubbleRate = pct(sum.simple.oneBubble, simple.length)
  sum.simple.passRate = pct(sum.simple.pass, sum.simple.n)
  const verdict = {
    multiThreshold: THRESHOLD.multi, multiPass: sum.multi.pass >= THRESHOLD.multi && sum.multi.n === 15,
    simpleThreshold: THRESHOLD.simple, simplePass: sum.simple.pass >= THRESHOLD.simple && sum.simple.n === 15,
  }
  verdict.d3 = verdict.multiPass && verdict.simplePass

  let runMeta = null
  try { runMeta = JSON.parse(readFileSync(join(RAW, 'run-meta.json'), 'utf8')) } catch { /* 无 run-meta（如仅冒烟） */ }
  const result = {
    version: 1,
    criteria: {
      multi: '≥1 工作工具 && 首工作工具前非空正文 && 真result(末工作工具后) && 不走(c)/(d) && completed && turn/end',
      simple: '恰1气泡 && 0工具 && 无notice && completed && turn/end',
      nonWorkTools: [...NON_WORK_TOOLS].sort(),
      thresholds: THRESHOLD,
      note: 'ack-only 计失败；无工作工具计失败；.prevN 历史记录保留不计分；missing 计入分母',
    },
    run: runMeta === null ? null : {
      ts: runMeta.ts, mode: runMeta.mode, model: runMeta.model, llmBase: runMeta.llmBase,
      litellm: runMeta.litellm ?? null, presetSectionSha256: runMeta.presetSectionSha256 ?? null,
      temperature: null, topP: null, // dsh 不传采样参数（P6-02 实测；各回合 meta 同为 null）
    },
    totals: sum, verdict, perTurn,
  }
  if (missing.length > 0) result.missing = missing
  const outPath = join(HERE, 'result.json')
  writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n')

  const row = (r) => `${r.promptId}#${r.rep}  ok=${r.metrics.ok ? 'Y' : 'N'} ack=${r.metrics.ack ? 1 : 0} result=${r.metrics.result ? 1 : 0} (c)=${r.metrics.walkC ? 1 : 0} (d)=${r.metrics.walkD ? 1 : 0} tools=${r.metrics.workTools}/${r.metrics.toolCalls} bubbles=${r.metrics.bubbles} end=${r.endReason ?? 'null'} outcome=${r.outcome}`
  console.log(`multi  pass ${sum.multi.pass}/${sum.multi.n}（阈值 ≥${THRESHOLD.multi}）  ack ${sum.multi.ack}/${multi.length}  result ${sum.multi.result}/${multi.length}  (c) ${sum.multi.walkC}  (d) ${sum.multi.walkD}  midFolded ${sum.multi.midFolded}/${sum.multi.withMidText}`)
  console.log(`simple pass ${sum.simple.pass}/${sum.simple.n}（阈值 ≥${THRESHOLD.simple}）  oneBubble ${sum.simple.oneBubble}/${simple.length}  noTool ${sum.simple.noTool}/${simple.length}`)
  console.log(`verdict: multi ${verdict.multiPass ? 'PASS' : 'FAIL'} / simple ${verdict.simplePass ? 'PASS' : 'FAIL'} / D3 ${verdict.d3 ? 'PASS' : 'FAIL'}${missing.length > 0 ? `  （missing ${missing.length}）` : ''}`)
  for (const r of perTurn) if (!r.metrics.ok) console.log(`FAIL ${row(r)}`)
  console.log(`result.json → ${outPath}`)
  return 0
}

const selfOnly = process.argv.includes('--selftest')
const st = selftest()
if (selfOnly) process.exit(st === 0 ? 0 : 1)
if (st !== 0) { console.error('selftest 先行失败，不产出 result.json'); process.exit(1) }
process.exit(main())
