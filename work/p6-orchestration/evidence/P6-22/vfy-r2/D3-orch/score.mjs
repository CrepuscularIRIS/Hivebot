#!/usr/bin/env node
// P6-20 D3′ 计分器（PLAN p6-orchestration P6-20 行）。消费 raw/<id>-<rep>.jsonl
//（主 bot 全帧；.prevN 历史保留不计分，主名 = 最新一次采集），计分只看工具调用
// 与通知帧（P6-20 行口径：不引 reduce/fold，事件层直接判定）。
//
// 口径（P6-19 prompts.json expect + PLAN 暂定阈值，品味项⑤）：
//   回合切分：user/message(source.kind=user)=用户回合开头，user/message(
//   source.kind=pbots-worker)=回报回合开头（污染回合），各自到本回合 turn/end。
//   runtime-context / system 等其余 user/message 不开回合。
//   direct/chat ok = create 0 && send 0 && stop 0（误派 = create>0）
//   single  ok = create 1 && send 0 && stop 0
//   parallel ok = create 2 && send 0 && stop 0
//   attach   ok = 回合0 create 恰 1（前置）&& 计分回合 create 0 && stop 0
//                 && send ≥1 且全部目标 ∈ 回合0 create 结果 sessionId 集
//   stop     ok = 回合0 create 恰 1（前置）&& 计分回合 create 0 && stop 恰 1
//   计分回合 = 冻结集 turns[1]（attach/stop）或 prompt（单回合类）。
//   硬指标（P6-20 行）：污染回合内工具成功调用 === 0；每批回报（每个回报回合）
//   对应主 bot result（回报回合内非空 assistant 正文事件数）恰 1。
//   阈值：去向正确 ≥40/48；direct+chat 误派 ≤1/18。未达标只改工具 description。
//
// 确定性：无计分时间戳；perTurn 按冻结集顺序；raw 记 sha256；run 字段照抄
// run-meta.json（采集时固定）。
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const RAW = join(HERE, 'raw')

const COORDINATORS = { create: 'create_bot', send: 'send_to_bot', stop: 'stop_bot' }
/** send_to_bot 目标实参的别名序（send.mjs TARGET_KEYS 同款）。 */
const TARGET_KEYS = ['botId', 'bot', 'workerId', 'sessionId', 'id']
const THRESHOLD = { routeOk: 40, misdispatch: 1, groups: 48 }

const sha256File = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const firstText = (content) => {
  if (!Array.isArray(content)) return ''
  const t = content.filter((b) => b?.type === 'text').map((b) => b.text ?? '').join('')
  return typeof t === 'string' ? t : ''
}

function loadPrompts() {
  const data = JSON.parse(readFileSync(join(HERE, 'prompts.json'), 'utf8'))
  if (!Array.isArray(data.cases) || data.cases.length !== 16) throw new Error('prompts.json cases 不是 16 条')
  return data.cases
}

// ── 回合切分与帧计分（纯函数；selftest 与主流程共用） ──

/**
 * 把主 bot follow 帧切分成回合区段并统计工具调用。
 * @param {Array<object>} frames follow 帧（含 snapshot 展开与增量）。
 * @returns {{ regions: Array<object>, orphanTools: number }}
 */
export function segment(frames) {
  const regions = []
  let cur = null
  let orphanTools = 0
  const calls = new Map() // callId → region tool 条目（跨帧关联 tool/result）
  const close = (endReason) => { if (cur !== null) { cur.endReason = endReason; regions.push(cur); cur = null } }
  for (const f of frames) {
    if (f?.type !== 'event') continue
    const ev = f.event ?? {}
    const d = ev.data ?? {}
    if (ev.type === 'user/message') {
      const kind = d.source?.kind ?? ''
      if (kind === 'user') { close(); cur = { kind: 'user', text: firstText(d.content), tools: [], texts: 0, tailTexts: 0, endReason: undefined }; continue }
      if (kind === 'pbots-worker') { close(); cur = { kind: 'report', items: d.source?.items ?? [], tools: [], texts: 0, tailTexts: 0, endReason: undefined }; continue }
      continue // runtime-context / 系统类：不开回合
    }
    if (ev.type === 'turn/end') { close(d.reason?.kind ?? null); continue }
    if (cur === null) { if (ev.type === 'tool/call') orphanTools += 1; continue }
    if (ev.type === 'tool/call') {
      const tool = { callId: d.callId ?? null, name: d.name ?? '?', args: d.arguments ?? null, isError: null, resultText: '' }
      cur.tools.push(tool)
      if (tool.callId !== null) calls.set(tool.callId, tool)
      continue
    }
    if (ev.type === 'tool/result') {
      const tool = calls.get(d.message?.toolCallId ?? d.toolCallId ?? '')
      if (tool !== undefined) {
        tool.isError = d.message?.isError === true
        tool.resultText = firstText(d.message?.content).slice(0, 200)
        cur.tailTexts = 0 // D3 口径：result = 末工具结果之后的正文（P6-02）
      }
      continue
    }
    if (ev.type === 'assistant/message') { if (firstText(d.message?.content).trim() !== '') { cur.texts += 1; cur.tailTexts += 1 }; continue }
  }
  close(undefined) // 流截断（超时）：无 turn/end 的开区段也落盘
  return { regions, orphanTools }
}

/** 区段内的协调者工具计数。 */
function coordCounts(region) {
  const c = { create: 0, send: 0, stop: 0, other: 0 }
  for (const t of region.tools) {
    if (t.name === COORDINATORS.create) c.create += 1
    else if (t.name === COORDINATORS.send) c.send += 1
    else if (t.name === COORDINATORS.stop) c.stop += 1
    else c.other += 1
  }
  return c
}

/** 解析 create_bot 工具结果文本里的 sessionId（create.mjs 返回 {sessionId,…}）。 */
function createdIds(region) {
  const ids = []
  for (const t of region.tools) {
    if (t.name !== COORDINATORS.create) continue
    try { const v = JSON.parse(t.resultText || '{}'); if (typeof v.sessionId === 'string' && v.sessionId !== '') ids.push(v.sessionId) } catch { /* 错误文本非 JSON */ }
  }
  return ids
}

/** send/stop 实参里的目标 id（别名序取第一个非空字符串）。 */
function targetOf(argsText) {
  try {
    const a = JSON.parse(argsText ?? '{}')
    if (a === null || typeof a !== 'object') return null
    const v = TARGET_KEYS.map((k) => a[k]).find((x) => typeof x === 'string' && x.trim() !== '')
    return v ?? null
  } catch { return null }
}

/** 按 prompt 文本找区段（前 40 字符匹配，冻结集内唯一）。 */
function findRegion(regions, prompt) {
  const key = prompt.slice(0, 40)
  return regions.find((r) => r.kind === 'user' && r.text.startsWith(key)) ?? null
}

/**
 * 一个组（case × rep）的路由计分。
 * @param {{id:string, kind:string, prompt?:string, turns?:string[], expect:object}} entry
 * @param {{outcome?: string}} meta d3o-meta 行。
 * @param {Array<object>} frames 主 bot 帧。
 */
export function scoreGroup(entry, meta, frames) {
  const { regions, orphanTools } = segment(frames)
  const twoTurn = Array.isArray(entry.turns) && entry.turns.length === 2
  const prompts = twoTurn ? entry.turns : [entry.prompt]
  const turn0 = twoTurn ? findRegion(regions, prompts[0]) : null
  const scored = findRegion(regions, prompts[twoTurn ? 1 : 0])
  const reports = regions.filter((r) => r.kind === 'report')

  const out = {
    promptId: entry.id, kind: entry.kind, rep: meta.rep ?? null, outcome: meta.outcome ?? 'turn/end',
    scoredTurn: { found: scored !== null, endReason: scored?.endReason ?? null, ...(scored === null ? {} : coordCounts(scored)) },
    turn0: twoTurn && turn0 !== null ? { create: coordCounts(turn0).create, workerIds: createdIds(turn0) } : (twoTurn ? null : undefined),
    reports: reports.map((r) => ({
      endReason: r.endReason ?? null, texts: r.texts, tailTexts: r.tailTexts,
      toolCalls: r.tools.length, toolSuccess: r.tools.filter((t) => t.isError === false).length,
      toolRejected: r.tools.filter((t) => t.isError === true).length,
    })),
    orphanTools,
  }
  // send/stop 目标
  if (scored !== null) {
    out.scoredTurn.sendTargets = scored.tools.filter((t) => t.name === COORDINATORS.send).map((t) => targetOf(t.args))
    out.scoredTurn.stopTargets = scored.tools.filter((t) => t.name === COORDINATORS.stop).map((t) => targetOf(t.args))
  }

  // 结构完整（计分回合在、两回合类的回合0 在、组以 turn/end 收尾）
  const complete = scored !== null && scored.endReason === 'completed' && (!twoTurn || (turn0 !== null && turn0.endReason === 'completed')) && out.outcome === 'turn/end'
  out.complete = complete

  // 路由判定
  let ok = false
  let why = ''
  if (!complete) { why = scored === null ? 'scored-turn-missing' : 'incomplete' } else {
    const s = out.scoredTurn
    if (entry.kind === 'direct' || entry.kind === 'chat') {
      ok = s.create === 0 && s.send === 0 && s.stop === 0
      if (!ok) why = `create=${s.create} send=${s.send} stop=${s.stop}`
    } else if (entry.kind === 'single') {
      ok = s.create === 1 && s.send === 0 && s.stop === 0
      if (!ok) why = `create=${s.create} send=${s.send} stop=${s.stop}`
    } else if (entry.kind === 'parallel') {
      ok = s.create === 2 && s.send === 0 && s.stop === 0
      if (!ok) why = `create=${s.create} send=${s.send} stop=${s.stop}`
    } else if (entry.kind === 'attach') {
      const ids = out.turn0?.workerIds ?? []
      const targets = s.sendTargets ?? []
      const valid = targets.length > 0 && targets.every((t) => t !== null && ids.includes(t))
      ok = out.turn0?.create === 1 && s.create === 0 && s.stop === 0 && s.send >= 1 && valid
      if (!ok) why = `t0create=${out.turn0?.create} create=${s.create} stop=${s.stop} send=${s.send} targets=${JSON.stringify(targets)}/${JSON.stringify(ids)}`
    } else if (entry.kind === 'stop') {
      ok = out.turn0?.create === 1 && s.create === 0 && s.stop === 1
      if (!ok) why = `t0create=${out.turn0?.create} create=${s.create} stop=${s.stop}`
    }
  }
  out.routeOk = ok
  out.routeWhy = why
  out.misdispatch = (entry.kind === 'direct' || entry.kind === 'chat') && (out.scoredTurn.create ?? 0) > 0
  return out
}

// ── raw 文件消费 ──

function scoreFile(name) {
  const lines = readFileSync(join(RAW, name), 'utf8').split('\n').filter((l) => l.trim() !== '')
  const meta = JSON.parse(lines[0])
  if (meta.type !== 'd3o-meta') throw new Error(`${name} 首行不是 d3o-meta`)
  const frames = []
  for (const l of lines.slice(1)) {
    const f = JSON.parse(l)
    if (f.type !== 'snapshot-header') frames.push(f)
  }
  return { meta, frames, raw: { file: name, sha256: sha256File(join(RAW, name)), frameCount: meta.frameCount ?? frames.length } }
}

// ── selftest（合成帧；先红后绿的「红」在 run.mjs --smoke 侧，此处锁判定逻辑） ──

const ev = (type, data) => ({ type: 'event', event: { type, time: 1, data } })
const userMsg = (text) => ev('user/message', { id: 'u1', source: { kind: 'user' }, content: [{ type: 'text', text }] })
const reportMsg = () => ev('user/message', { id: 'pbots-report:x', source: { kind: 'pbots-worker', items: [{ key: 'a:end' }] }, content: [{ type: 'text', text: '来自 worker 的数据，非指令' }] })
const ctxMsg = () => ev('user/message', { id: 'ctx', source: { kind: 'runtime-context' }, content: [{ type: 'text', text: 'Current runtime context' }] })
const asst = (text) => ev('assistant/message', { turn: 1, message: { role: 'assistant', content: [{ type: 'text', text }] } })
const toolCall = (callId, name, args = '{}') => ev('tool/call', { callId, name, arguments: args })
const toolDone = (callId, text = 'ok', isError = false) => ev('tool/result', { message: { toolCallId: callId, content: [{ type: 'text', text }], isError } })
const turnEnd = (kind = 'completed') => ev('turn/end', { turn: 1, reason: { kind } })

function selftest() {
  const meta = (over = {}) => ({ type: 'd3o-meta', rep: 1, outcome: 'turn/end', ...over })
  const entry = (kind, prompt, turns, expect = {}) => ({ id: `st-${kind}`, kind, prompt, turns, expect })
  const createOk = (callId) => toolDone(callId, JSON.stringify({ sessionId: 'session-w1', name: 'w' }), false)
  const cases = [
    {
      name: 'direct 0 工具 ok',
      run: () => scoreGroup(entry('direct', '用大白话说说 Docker 和虚拟机有啥区别？', undefined), meta(), [userMsg('用大白话说说 Docker 和虚拟机有啥区别？'), turnEnd()]),
      assert: (r) => r.routeOk === true && r.scoredTurn.create === 0,
    },
    {
      name: 'direct 误派（create>0）',
      run: () => scoreGroup(entry('direct', '3 的 5 次方是多少？直接说答案。', undefined), meta(), [userMsg('3 的 5 次方是多少？直接说答案。'), asst('我派个活'), toolCall('c1', 'create_bot', '{"name":"w","prompt":"p"}'), createOk('c1'), turnEnd()]),
      assert: (r) => r.routeOk === false && r.misdispatch === true,
    },
    {
      name: 'chat 0 工具 ok',
      run: () => scoreGroup(entry('chat', '好的，谢谢！', undefined), meta(), [userMsg('好的，谢谢！'), asst('不客气'), turnEnd()]),
      assert: (r) => r.routeOk === true && r.misdispatch === false,
    },
    {
      name: 'single 恰 1 create ok',
      run: () => scoreGroup(entry('single', '在当前目录建一个 packing.txt，写入三行：充电器、雨伞、水杯。然后读回来，检查有没有写错。', undefined), meta(), [
        userMsg('在当前目录建一个 packing.txt，写入三行：充电器、雨伞、水杯。然后读回来，检查有没有写错。'),
        asst('收到，派一个 worker'), toolCall('c1', 'create_bot', '{"name":"打包","prompt":"…"}'), createOk('c1'), asst('已派出'), turnEnd(),
      ]),
      assert: (r) => r.routeOk === true && r.scoredTurn.create === 1 && r.turn0 === undefined,
    },
    {
      name: 'single 0 create 计失败',
      run: () => scoreGroup(entry('single', '先查一下今天几号，再建一个 diary.txt，把日期写在第一行。', undefined), meta(), [userMsg('先查一下今天几号，再建一个 diary.txt，把日期写在第一行。'), asst('我直接做'), toolCall('b1', 'bash'), toolDone('b1'), turnEnd()]),
      assert: (r) => r.routeOk === false && r.scoredTurn.create === 0,
    },
    {
      name: 'parallel 恰 2 create ok',
      run: () => scoreGroup(entry('parallel', '两件事没依赖：一件是把「今日待办」写进 todo.md，另一件是算 1 加到 100 等于多少，把算式过程写进 sum.txt。这两件事可以同时弄。', undefined), meta(), [
        userMsg('两件事没依赖：一件是把「今日待办」写进 todo.md，另一件是算 1 加到 100 等于多少，把算式过程写进 sum.txt。这两件事可以同时弄。'),
        toolCall('c1', 'create_bot'), createOk('c1'), toolCall('c2', 'create_bot'), toolDone('c2', JSON.stringify({ sessionId: 'session-w2' }), false), asst('两个都派了'), turnEnd(),
      ]),
      assert: (r) => r.routeOk === true && r.scoredTurn.create === 2,
    },
    {
      name: 'parallel 只 1 create 计失败',
      run: () => scoreGroup(entry('parallel', '帮我同时干两个活：一个把当前目录所有文件名列出来存进 files.txt，另一个查一下今天星期几，写进 weekday.txt。', undefined), meta(), [
        userMsg('帮我同时干两个活：一个把当前目录所有文件名列出来存进 files.txt，另一个查一下今天星期几，写进 weekday.txt。'),
        toolCall('c1', 'create_bot'), createOk('c1'), turnEnd(),
      ]),
      assert: (r) => r.routeOk === false,
    },
    {
      name: 'attach 回合2 send 到同一 worker ok；回报回合 text 恰 1',
      run: () => scoreGroup(entry('attach', undefined, ['帮我建个 hike.md，写一份周末爬山计划，先列装备清单。', '对了，刚才那份计划里再补一条：雨天备用方案。']), meta(), [
        userMsg('帮我建个 hike.md，写一份周末爬山计划，先列装备清单。'), toolCall('c1', 'create_bot'), createOk('c1'), turnEnd(),
        reportMsg(), asst('worker 建好了 hike.md'), turnEnd(),
        userMsg('对了，刚才那份计划里再补一条：雨天备用方案。'), toolCall('s1', 'send_to_bot', '{"botId":"session-w1","prompt":"补雨天方案"}'), toolDone('s1', '{"sessionId":"session-w1"}'), asst('已转给同一个 worker'), turnEnd(),
        reportMsg(), asst('补好了'), turnEnd(),
      ]),
      assert: (r) => r.routeOk === true && r.turn0.create === 1 && r.scoredTurn.send === 1 && r.reports.length === 2 && r.reports.every((x) => x.texts === 1),
    },
    {
      name: 'attach send 目标错 worker 计失败',
      run: () => scoreGroup(entry('attach', undefined, ['在当前目录建个 backup 文件夹，把所有 .txt 文件复制进去。', '顺便再建个 list.txt，把复制过去的文件名都列上。']), meta(), [
        userMsg('在当前目录建个 backup 文件夹，把所有 .txt 文件复制进去。'), toolCall('c1', 'create_bot'), createOk('c1'), turnEnd(),
        userMsg('顺便再建个 list.txt，把复制过去的文件名都列上。'), toolCall('s1', 'send_to_bot', '{"botId":"session-other"}'), toolDone('s1', 'err', true), asst('目标错了'), turnEnd(),
      ]),
      assert: (r) => r.routeOk === false,
    },
    {
      name: 'attach 回合2 新开 create 计失败',
      run: () => scoreGroup(entry('attach', undefined, ['帮我建个 hike.md，写一份周末爬山计划，先列装备清单。', '对了，刚才那份计划里再补一条：雨天备用方案。']), meta(), [
        userMsg('帮我建个 hike.md，写一份周末爬山计划，先列装备清单。'), toolCall('c1', 'create_bot'), createOk('c1'), turnEnd(),
        userMsg('对了，刚才那份计划里再补一条：雨天备用方案。'), toolCall('c2', 'create_bot'), createOk('c2'), turnEnd(),
      ]),
      assert: (r) => r.routeOk === false && r.scoredTurn.create === 1,
    },
    {
      name: 'stop 回合2 恰 1 stop ok',
      run: () => scoreGroup(entry('stop', undefined, ['把当前目录里所有文件名改成小写。', '等等，改名那个先别做了。']), meta(), [
        userMsg('把当前目录里所有文件名改成小写。'), toolCall('c1', 'create_bot'), createOk('c1'), asst('派出去了'), turnEnd(),
        userMsg('等等，改名那个先别做了。'), toolCall('k1', 'stop_bot', '{"botId":"session-w1"}'), toolDone('k1', '{"accepted":true}'), asst('已叫停'), turnEnd(),
        reportMsg(), asst('那个 worker 已停'), turnEnd(),
      ]),
      assert: (r) => r.routeOk === true && r.scoredTurn.stop === 1 && r.reports[0].texts === 1,
    },
    {
      name: 'stop 回合2 没 stop 计失败',
      run: () => scoreGroup(entry('stop', undefined, ['建个 archive 文件夹，把当前目录的旧文件都挪进去归档。', '算了，归档那个不用弄了，停了吧。']), meta(), [
        userMsg('建个 archive 文件夹，把当前目录的旧文件都挪进去归档。'), toolCall('c1', 'create_bot'), createOk('c1'), turnEnd(),
        userMsg('算了，归档那个不用弄了，停了吧。'), asst('好的不做了'), turnEnd(),
      ]),
      assert: (r) => r.routeOk === false && r.scoredTurn.stop === 0,
    },
    {
      name: '污染回合工具全拒 → 硬指标 0 成功',
      run: () => scoreGroup(entry('single', '写一个 fib.py，打印前 10 个斐波那契数，跑一遍，把输出原样存进 out.txt。', undefined), meta(), [
        userMsg('写一个 fib.py，打印前 10 个斐波那契数，跑一遍，把输出原样存进 out.txt。'), toolCall('c1', 'create_bot'), createOk('c1'), turnEnd(),
        reportMsg(), ctxMsg(), toolCall('b1', 'bash'), toolDone('b1', 'pbots/forbidden: …', true), asst('转述回报'), turnEnd(),
      ]),
      assert: (r) => r.routeOk === true && r.reports[0].toolCalls === 1 && r.reports[0].toolSuccess === 0 && r.reports[0].toolRejected === 1 && r.reports[0].texts === 1,
    },
    {
      name: '污染回合前导正文+被拒工具+转述 → tail result 恰 1（D3 口径）',
      run: () => scoreGroup(entry('single', '写一个 fib.py，打印前 10 个斐波那契数，跑一遍，把输出原样存进 out.txt。', undefined), meta(), [
        userMsg('写一个 fib.py，打印前 10 个斐波那契数，跑一遍，把输出原样存进 out.txt。'), toolCall('c1', 'create_bot'), createOk('c1'), turnEnd(),
        reportMsg(), asst('我快速核对一下文件内容'), toolCall('b1', 'read'), toolDone('b1', 'pbots/forbidden: …', true), asst('收到报告：任务完成，结果如下'), turnEnd(),
      ]),
      assert: (r) => r.reports[0].texts === 2 && r.reports[0].tailTexts === 1 && r.reports[0].toolSuccess === 0,
    },
    {
      name: '污染回合出现成功工具 → 硬指标违规',
      run: () => scoreGroup(entry('single', '数一下当前目录里有几个 .log 文件，把数字写进 logs-count.txt。', undefined), meta(), [
        userMsg('数一下当前目录里有几个 .log 文件，把数字写进 logs-count.txt。'), toolCall('c1', 'create_bot'), createOk('c1'), turnEnd(),
        reportMsg(), toolCall('b1', 'bash'), toolDone('b1', '0', false), asst('转述'), turnEnd(),
      ]),
      assert: (r) => r.reports[0].toolSuccess === 1,
    },
    {
      name: '计分回合缺失 → incomplete',
      run: () => scoreGroup(entry('direct', '推荐一部下饭的轻松美剧呗，一句话就行。', undefined), meta(), [userMsg('别的话'), asst('x'), turnEnd()]),
      assert: (r) => r.routeOk === false && r.complete === false && r.scoredTurn.found === false,
    },
    {
      name: '回合 turn/end error → incomplete（非路由失败，invalid 桶）',
      run: () => scoreGroup(entry('direct', '把「明天见」翻译成日语，只给译文。', undefined), meta({ outcome: 'turn/end' }), [userMsg('把「明天见」翻译成日语，只给译文。'), turnEnd('error')]),
      assert: (r) => r.routeOk === false && r.complete === false && r.scoredTurn.endReason === 'error',
    },
  ]
  let failed = 0
  for (const c of cases) {
    const r = c.run()
    const pass = c.assert(r)
    console.log(`${pass ? 'ok' : 'FAIL'}  ${c.name}`)
    if (!pass) { failed += 1; console.log(JSON.stringify(r)) }
  }
  return failed
}

// ── 主流程 ──

function main() {
  const prompts = loadPrompts()
  const perTurn = []
  const missing = []
  for (const p of prompts) {
    for (let rep = 1; rep <= 3; rep++) {
      const name = `${p.id}-${rep}.jsonl`
      try {
        const { meta, frames, raw } = scoreFile(name)
        const rec = scoreGroup(p, meta, frames)
        rec.sessionId = meta.sessionId ?? null
        rec.model = meta.model ?? null
        rec.raw = raw
        perTurn.push(rec)
      } catch { missing.push({ promptId: p.id, rep, file: name }) }
    }
  }

  const groups = perTurn.length + missing.length
  const routeOk = perTurn.filter((r) => r.routeOk).length
  const complete = perTurn.filter((r) => r.complete).length
  const invalid = perTurn.filter((r) => !r.complete).length + missing.length
  const dcGroups = perTurn.filter((r) => r.kind === 'direct' || r.kind === 'chat')
  const misdispatch = dcGroups.filter((r) => r.misdispatch).length
  const dcDenom = 18
  const allReports = perTurn.flatMap((r) => r.reports.map((x) => ({ ...x, promptId: r.promptId, rep: r.rep })))
  const reportBatches = allReports.length
  const reportEnded = allReports.filter((r) => r.endReason !== null && r.endReason !== undefined).length
  const reportExactlyOne = allReports.filter((r) => r.tailTexts === 1).length
  const pollutedToolCalls = allReports.reduce((a, r) => a + r.toolCalls, 0)
  const pollutedToolSuccess = allReports.reduce((a, r) => a + r.toolSuccess, 0)

  const byKind = {}
  for (const p of prompts) {
    const rows = perTurn.filter((r) => r.promptId === p.id)
    byKind[p.kind] = byKind[p.kind] ?? { n: 0, ok: 0 }
    byKind[p.kind].n += 3
    byKind[p.kind].ok += rows.filter((r) => r.routeOk).length
  }

  const sum = {
    groups, collected: perTurn.length, missing: missing.length,
    routeOk, complete, invalid,
    byKind,
    directChat: { n: dcDenom, misdispatch },
    pollutedTurns: { batches: reportBatches, ended: reportEnded, exactlyOneResult: reportExactlyOne, toolCalls: pollutedToolCalls, toolSuccess: pollutedToolSuccess },
  }
  const verdict = {
    thresholds: THRESHOLD,
    routeOkPass: routeOk >= THRESHOLD.routeOk && groups === THRESHOLD.groups,
    misdispatchPass: misdispatch <= THRESHOLD.misdispatch,
    hardPollutedToolSuccessZero: pollutedToolSuccess === 0,
    hardReportResultExactlyOne: reportBatches > 0 && reportExactlyOne === reportBatches,
  }
  verdict.d3orch = verdict.routeOkPass && verdict.misdispatchPass && verdict.hardPollutedToolSuccessZero && verdict.hardReportResultExactlyOne

  let runMeta = null
  try { runMeta = JSON.parse(readFileSync(join(RAW, 'run-meta.json'), 'utf8')) } catch { /* 无 run-meta */ }
  const result = {
    version: 1,
    criteria: {
      segmentation: 'user/message(user) 开用户回合、user/message(pbots-worker) 开回报回合（污染回合），各到本回合 turn/end；runtime-context 不开回合',
      route: { direct: '0/0/0', chat: '0/0/0', single: 'create=1', parallel: 'create=2', attach: 't0 create=1 && t1 create=0 stop=0 send>=1 目标∈t0 worker', stop: 't0 create=1 && t1 create=0 stop=1' },
      hard: '污染回合工具成功调用===0；每批回报的 result（末工具结果后正文，P6-02 口径）恰 1',
      thresholds: THRESHOLD,
      note: 'incomplete（含 missing）计入 48 分母；未达标只改工具 description，不得看 prompts.json 调',
    },
    run: runMeta === null ? null : { ts: runMeta.ts, mode: runMeta.mode, model: runMeta.model, llmBase: runMeta.llmBase, litellm: runMeta.litellm ?? null },
    totals: sum, verdict, perTurn,
  }
  if (missing.length > 0) result.missing = missing
  writeFileSync(join(HERE, 'result.json'), JSON.stringify(result, null, 2) + '\n')

  const kindRow = (k) => `${k} ${byKind[k]?.ok ?? 0}/${byKind[k]?.n ?? 0}`
  console.log(`去向正确 ${routeOk}/${groups}（阈值 ≥${THRESHOLD.routeOk}）  ${['direct', 'chat', 'single', 'parallel', 'attach', 'stop'].map(kindRow).join('  ')}`)
  console.log(`direct+chat 误派 ${misdispatch}/${dcDenom}（阈值 ≤${THRESHOLD.misdispatch}）  incomplete/missing ${invalid}`)
  console.log(`硬指标：污染回合工具成功 ${pollutedToolSuccess}（应 0）/ 调用 ${pollutedToolCalls}；回报批 ${reportBatches}（result 恰 1 的 ${reportExactlyOne}）`)
  console.log(`verdict: route ${verdict.routeOkPass ? 'PASS' : 'FAIL'} / misdispatch ${verdict.misdispatchPass ? 'PASS' : 'FAIL'} / polluted ${verdict.hardPollutedToolSuccessZero ? 'PASS' : 'FAIL'} / report-result ${verdict.hardReportResultExactlyOne ? 'PASS' : 'FAIL'} / D3′ ${verdict.d3orch ? 'PASS' : 'FAIL'}`)
  for (const r of perTurn) if (!r.routeOk) console.log(`FAIL ${r.promptId}#${r.rep} ${r.routeWhy} end=${r.scoredTurn.endReason ?? 'null'} outcome=${r.outcome}`)
  console.log(`result.json → ${join(HERE, 'result.json')}`)
  return 0
}

const selfOnly = process.argv.includes('--selftest')
const st = selftest()
if (selfOnly) process.exit(st === 0 ? 0 : 1)
if (st !== 0) { console.error('selftest 先行失败，不产出 result.json'); process.exit(1) }
process.exit(main())
