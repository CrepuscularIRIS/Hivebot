// P6-12 真 Loader 用例（PLAN P6-12 验收 ①–⑩ + §11 R2-1 反向）：orchestration.yml
// 挂生产插件（report + taint-guard），fake 模型驱动。覆盖：合批（3 worker 一条
// 通知）、自发回合 0 通知、污染回合全工具拒（bash/write/连接器写/create_bot）
// 与混合回合、R2-1 三反向（审批档位切换/提问迟到答复/schedule 触发不误拒）、
// 真审批 ask 项（eventId=approval/asked.id）→ 作答 → end 项、用户消息先跑、
// 用户停止撤回 + 补投、blocked / max-tokens 照常触发。崩溃恢复（三崩溃点 +
// claim 窗口 + worker 回合中 SIGKILL）在文末独立 describe，多轮 boot 同一 home。
// 口径：fake 游标 per-session 且 boot 归零（P6-09 附 4）——每用例独立 session、
// 重启后全量重写脚本。
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { tmkdir } from '../support/tmp-sweep.ts'
import { connect, type DshClient } from '../../examples/lib/client.mjs'

const PKG_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..')

const home = tmkdir('bot-p612-live-')
const dataDir = join(home, 'data')
mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })
mkdirSync(join(home, 'gates'), { recursive: true })
mkdirSync(dataDir, { recursive: true })

const overlay = join(home, 'p612.yml')
writeFileSync(overlay, `\
# P6-12 overlay (orchestration-report-live.test.ts)
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
    - id: p610-inspect
      name: '${pathToFileURL(join(PKG_ROOT, 'tests', 'support', 'orchestration-create-inspect.mjs')).href}'
`)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const text = (t: string, paceMs = 5) => ({ paceMs, chunks: [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: t },
  { type: 'block-end', index: 0, block: { type: 'text', text: t } },
  { type: 'finish', reason: { kind: 'stop' } },
] })
const gatedText = (gateId: string, finishReason: { kind: string, failure?: object } = { kind: 'stop' }) => ({ gateAfterChunk: 1, gateId, chunks: [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: '.' },
  { type: 'block-end', index: 0, block: { type: 'text', text: '.' } },
  { type: 'finish', reason: finishReason },
] })
const toolCall = (callId: string, name: string, args: object) => ({ chunks: [
  { type: 'block-start', index: 0, blockType: 'tool-call' },
  { type: 'tool-call-delta', index: 0, id: callId, name, argumentsDelta: JSON.stringify(args).slice(0, 5) },
  { type: 'tool-call-delta', index: 0, id: callId, name, argumentsDelta: JSON.stringify(args).slice(5) },
  { type: 'block-end', index: 0, block: { type: 'tool-call', id: callId, name, arguments: JSON.stringify(args) } },
  { type: 'finish', reason: { kind: 'tool-calls' } },
] })
const sendCall = (callId: string, botId: string, prompt: string) => toolCall(callId, 'send_to_bot', { botId, prompt })
const bashCall = (callId: string, command: string) => toolCall(callId, 'bash', { command, description: 'P6-12 canary' })
const createCall = (callId: string, name: string, prompt: string) => toolCall(callId, 'create_bot', { name, prompt })
const connCall = (callId: string, payload: string) => toolCall(callId, 'p612_conn_write', { payload })
const openGate = (gateId: string) => writeFileSync(join(home, 'gates', gateId), '1')

interface LogEvent {
  seq: number; type: string; id?: string; sourceKind?: string; items?: any[]; turn?: number | null
  reason?: string; isError?: boolean; error?: { message?: string } | null; text?: string; callId?: string
}

const writeScript = (sessionId: string, calls: object[]) => {
  writeFileSync(join(home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls }))
}

describe('P6-12 live (real Loader)', () => {
  let rt: Runtime
  let answerer: DshClient
  /** $events frames for approval answering (approval.test.ts openEvents pattern). */
  let eventsFrames: any[] = []

  const control = (request: object) => rt.client.call('p610/control', { request })
  // cwd 显式给 workspace：bash canary 必须落在会话工作区内（/tmp 被沙箱 --tmpfs
  // 遮蔽，LEARNINGS P5-06 ④）
  const workspace = join(home, 'workspace')
  mkdirSync(workspace, { recursive: true })
  const newSession = async (): Promise<string> =>
    ((await rt.client.call('session/create', { request: { agentPreset: 'standard', cwd: workspace } }) as { sessionId: string }).sessionId)
  const writeBots = (mainBotId: string, bots: Record<string, { createdBy: string }>) => {
    writeFileSync(join(dataDir, 'bots.json'), JSON.stringify({ version: 1, mainBotId, recipes: {}, bots }))
  }
  const readLog = async (sessionId: string): Promise<LogEvent[]> =>
    ((await control({ op: 'read', sessionId })) as { events: LogEvent[] }).events
  const prompt = (sessionId: string, t: string, mode = 'queue', id = `p612-${Date.now()}-${Math.random().toString(16).slice(2)}`) =>
    rt.client.call('session/prompt', { request: { requestId: id, sessionId, mode, content: [{ type: 'text', text: t }] } })
  const untilTrue = async (pred: () => Promise<boolean> | boolean, label: string, ms = 60_000) => {
    const deadline = Date.now() + ms
    for (;;) {
      if (await pred()) return
      if (Date.now() > deadline) throw new Error(`${label}: timed out`)
      await sleep(150)
    }
  }
  /** 主 bot 侧落盘的回报消息（user/message, pbots-worker 来源）。 */
  const reports = (log: LogEvent[]) => log.filter((e) => e.type === 'user/message' && e.sourceKind === 'pbots-worker')
  const turnEnds = (log: LogEvent[]) => log.filter((e) => e.type === 'turn/end')
  /** 跑完主 bot 一回合（prompt → turn/end），返回全量日志。 */
  const runTurn = async (sessionId: string, t: string, label: string) => {
    const before = (await readLog(sessionId)).filter((e) => e.type === 'turn/end').length
    await prompt(sessionId, t)
    await untilTrue(async () => (await readLog(sessionId)).filter((e) => e.type === 'turn/end').length > before, `${label}: turn/end`)
    return readLog(sessionId)
  }
  const connWrites = async (): Promise<number> =>
    ((await control({ op: 'conn-count' })) as { connWrites: number }).connWrites
  const waitForApproval = async (sessionId: string) => {
    await untilTrue(() => eventsFrames.some((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId), `approval/request for ${sessionId}`)
    return eventsFrames.find((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId)
  }
  const answerApproval = async (frame: any, value: string) => {
    const ready = eventsFrames.find((f) => f.type === 'ready')
    await answerer.call('$events/result', { clientId: ready?.clientId ?? '', eventId: frame.eventId, outcome: { kind: 'result', value } })
  }
  /** 已批过的 approval eventId（approveNextBash 去重用——waterfall 帧可能重播）。 */
  const answeredIds = new Set<string>()
  /** 干净回合的 bash 会出审批卡（standard preset）——等**新 eventId** 的卡并批准。 */
  const approveNextBash = async (sessionId: string) => {
    for (;;) {
      const frame = eventsFrames.find((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId && !answeredIds.has(f.eventId))
      if (frame) { answeredIds.add(frame.eventId); await answerApproval(frame, 'allowed-once'); return }
      await sleep(100)
    }
  }

  beforeAll(async () => {
    rt = await launchRuntime({ env: {
      P2SDK_PATCH: `${join(PKG_ROOT, 'profile', 'patches', 'orchestration.yml')}:${overlay}`,
      P2SDK_HOME: home, PBOTS_DATA_DIR: dataDir, P2SDK_ORCH_DATA_DIR: dataDir,
    } })
    answerer = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
    const stream = await answerer.socket.open('$events', {})
    void (async () => { for await (const f of stream as any) eventsFrames.push(f as any) })().catch(() => {})
    await sleep(300) // let the ready frame land
  }, 120_000)

  afterAll(async () => {
    try { answerer?.close() } catch { /* already gone */ }
    await rt?.stop()
  })

  it('① 合批：主 bot 回合中 3 worker 结束 → 回合结束后恰 1 条通知含 3 项、恰 1 个消费回合（D6：主 bot 回合不等 worker）', { timeout: 300_000 }, async () => {
    const M = await newSession()
    const ws: string[] = [await newSession(), await newSession(), await newSession()]
    writeBots(M, Object.fromEntries(ws.map((w) => [w, { createdBy: M }])))
    ws.forEach((w, i) => writeScript(w, [text(`干活结果 ${i}`, 1_500)]))
    writeScript(M, [
      // turn1 step1：一个并发批 3 次 send_to_bot
      { chunks: ws.flatMap((w, i) => [
        { type: 'block-start', index: i, blockType: 'tool-call' },
        { type: 'tool-call-delta', index: i, id: `s${i}`, name: 'send_to_bot', argumentsDelta: JSON.stringify({ botId: w, prompt: `task ${i}` }) },
        { type: 'block-end', index: i, block: { type: 'tool-call', id: `s${i}`, name: 'send_to_bot', arguments: JSON.stringify({ botId: w, prompt: `task ${i}` }) } },
      ]).concat([{ type: 'finish', reason: { kind: 'tool-calls' } }]) },
      gatedText('g-batch'), // turn1 step2：等三个 worker 都结束（D6：主 bot 回合挂着）
      text('收到三份结果'), // turn2：回报回合
      text('多余响应'), // 若发生第二次唤醒才会消费到这里
    ])
    await prompt(M, '派三件事')
    await untilTrue(async () => {
      const busy = ws.map((w) => (w))
      let done = 0
      for (const w of busy) if ((await readLog(w)).some((e) => e.type === 'turn/end')) done += 1
      return done === 3
    }, 'three workers finish their turns', 120_000)
    // D6：worker 全结束后、gate 未开时主 bot turn1 仍未结束（回合不因 worker 挂起而结束——是 gate 在挂）
    expect((await readLog(M)).some((e) => e.type === 'turn/end'), 'D6: 主 bot 回合仍进行中（gate 挂着）').toBe(false)
    openGate('g-batch')
    await untilTrue(async () => (await readLog(M)).some((e) => e.type === 'turn/end'), 'main turn1 ends')
    // 2s 窗口 + 投递 + 回合消费
    await untilTrue(async () => reports(await readLog(M)).length === 1, 'one batched report lands')
    const log = await readLog(M)
    const batch = reports(log)[0]
    expect((batch.items ?? []).map((i) => i.kind)).toEqual(['end', 'end', 'end'])
    expect((batch.items ?? []).every((i) => i.outcome === 'completed' && typeof i.result === 'string')).toBe(true)
    expect((batch.items ?? []).every((i) => i.result.length > 0), '决策 17：result 尾正文').toBe(true)
    // 恰 1 次唤醒：turn2 消费回报后 5s 内没有第三个回合
    await untilTrue(async () => turnEnds(await readLog(M)).length >= 2, 'report turn consumed')
    await sleep(5_000)
    const finalLog = await readLog(M)
    expect(turnEnds(finalLog).length, '恰 1 次唤醒（turn2 之外无新回合）').toBe(2)
    expect(reports(finalLog).length).toBe(1)
  })

  it('② 用户在 worker 内自发的回合结束 → 通知数 === 0（决策 14）', { timeout: 240_000 }, async () => {
    const M = await newSession()
    const W = await newSession()
    writeBots(M, { [W]: { createdBy: M } })
    writeScript(W, [text('用户自己让我干的')])
    await prompt(W, '手动跑')
    await untilTrue(async () => (await readLog(W)).some((e) => e.type === 'turn/end'), 'worker turn ends')
    await sleep(3_500) // 覆盖 2s 窗口 + 余量
    expect(reports(await readLog(M)).length).toBe(0)
    expect(turnEnds(await readLog(M)).length).toBe(0)
  })

  it('③ 污染回合：bash / write / 连接器写 / create_bot 全拒、副作用 0；下一纯用户回合工具恢复（D9⑨）', { timeout: 300_000 }, async () => {
    const M = await newSession()
    writeBots(M, {})
    const canary = join(workspace, 'tainted-canary')
    const recover = join(workspace, 'recover-canary')
    writeScript(M, [
      bashCall('t1', `touch ${canary}`),
      toolCall('t2', 'write', { path: canary, content: 'x' }),
      connCall('t3', '写外部系统'),
      createCall('t4', 'w', '任务'),
      text('全被拒了'),
      bashCall('t5', `touch ${recover}`), // 下一纯用户回合：工具应恢复
      text('恢复了'),
    ])
    const connBefore = await connWrites()
    await control({ op: 'inject', sessionId: M }) // pbots-worker 回报唤醒污染回合
    await untilTrue(async () => {
      const log = await readLog(M)
      const calls = log.filter((e) => e.type === 'tool/call').length
      return log.some((e) => e.type === 'turn/end') && calls >= 4 && log.filter((e) => e.type === 'tool/result').length >= calls
    }, 'tainted turn finishes with 4 tool results')
    const log = await readLog(M)
    const results = log.filter((e) => e.type === 'tool/result').slice(0, 4)
    expect(results.every((r) => r.isError === true)).toBe(true)
    const texts = results.map((r) => `${JSON.stringify(r.error ?? {})} ${r.text ?? ''}`).join('\n')
    // bash / write / conn 走 taint-guard（pbots/forbidden）；create_bot when 隐藏 → 落空
    expect(texts).toContain('pbots/forbidden')
    expect(existsSync(canary), '副作用 0：文件不存在').toBe(false)
    expect(await connWrites(), 'fake 连接器调用数 0').toBe(connBefore)
    // 下一纯用户回合：工具恢复（bash touch 成功；standard preset 出审批卡→批）
    const approve = approveNextBash(M)
    const after = await runTurn(M, '继续', 'recover turn')
    await approve
    expect(after.some((e) => e.type === 'tool/call')).toBe(true)
    await untilTrue(() => existsSync(recover), 'recover canary exists')
  })

  it('③ 混合回合：error 终态滞留的 user steer 与回报被同回合认领 → 工具照拒', { timeout: 300_000 }, async () => {
    const M = await newSession()
    writeBots(M, {})
    const canary = join(workspace, 'mixed-canary')
    writeScript(M, [
      gatedText('g-mix', { kind: 'error', failure: { message: 'fake failure', code: 'FAKE' } }), // turn1 → error
      bashCall('m1', `touch ${canary}`), // turn2（混合回合）应被拒
      text('混合回合结束'),
    ])
    await prompt(M, '先干着')
    await untilTrue(async () => (await readLog(M)).some((e) => e.type === 'turn/start'), 'turn1 starts')
    await control({ op: 'inject', sessionId: M }) // followup 排 next-turn（等下一回合）
    await prompt(M, '插一句话', 'steer') // next-step：error 终态会滞留
    openGate('g-mix')
    // error 关闭 driver，滞留消息不自动起回合（P6-09 (c′) M3 同款）——排一条唤醒
    await untilTrue(async () => (await readLog(M)).some((e) => e.type === 'turn/end' && e.reason === 'error'), 'turn1 ends with error')
    await prompt(M, '唤醒')
    await untilTrue(async () => (await readLog(M)).some((e) => e.type === 'tool/result'), 'mixed turn runs the bash call')
    const log = await readLog(M)
    const result = log.find((e) => e.type === 'tool/result')
    expect(result?.isError).toBe(true)
    expect(`${JSON.stringify(result?.error ?? {})} ${result?.text ?? ''}`).toContain('pbots/forbidden')
    expect(existsSync(canary), '混合回合副作用 0').toBe(false)
  })

  it('R2-1 反向：审批档位切换 / 提问迟到答复 / schedule 触发的回合不得拒工具', { timeout: 300_000 }, async () => {
    const M = await newSession()
    writeBots(M, {})
    const canary = join(workspace, 'reverse-canary')
    writeScript(M, [
      bashCall('r1', `touch ${canary}.approval`),
      bashCall('r2', `touch ${canary}.question`),
      bashCall('r3', `touch ${canary}.schedule`),
    ])
    const kinds = ['user-approval', 'user-question-reply', 'schedule']
    for (const [index, kind] of kinds.entries()) {
      const approve = approveNextBash(M)
      await control({ op: 'inject', sessionId: M, kind, id: `p612-rev-${kind}-${Date.now()}` })
      await untilTrue(async () => {
        const log = await readLog(M)
        return log.filter((e) => e.type === 'tool/result').length >= index + 1
      }, `${kind} turn ran a tool`)
      await approve
      const log = await readLog(M)
      const result = log.filter((e) => e.type === 'tool/result').at(-1)
      expect(result?.isError, `${kind} 回合的 bash 不得被拒`).not.toBe(true)
    }
    await untilTrue(() => existsSync(`${canary}.approval`) && existsSync(`${canary}.question`) && existsSync(`${canary}.schedule`), 'all three canaries exist')
  })

  it('④ 待人工：真审批挂起 → 5s 内 1 项 ask（eventId=asked.id）→ 作答 → 完成 → 1 项 end；作答后不重发', { timeout: 300_000 }, async () => {
    const M = await newSession()
    const W = await newSession()
    writeBots(M, { [W]: { createdBy: M } })
    const canary = join(workspace, 'ask-canary')
    writeScript(W, [bashCall('a1', `touch ${canary}`), text('审批过了，完成')])
    writeScript(M, [sendCall('s0', W, '干件需要审批的事'), text('派出去了'), text('收到 ask'), text('收到 end')])
    await prompt(M, '派活')
    await untilTrue(async () => (await readLog(W)).some((e) => e.type === 'turn/start'), 'worker turn starts')
    const askedFrame = await waitForApproval(W)
    // 5s 内主 bot 收到 1 项 ask（主 bot 空闲，2s 窗口）
    const started = Date.now()
    await untilTrue(async () => reports(await readLog(M)).length === 1, 'ask report lands')
    expect(Date.now() - started).toBeLessThan(5_000)
    let log = await readLog(M)
    const askItem = (reports(log)[0].items ?? [])[0]
    const askedId = (await readLog(W)).find((e) => e.type === 'approval/asked')?.id
    expect(askItem).toMatchObject({ kind: 'ask', awaiting: 'approval', eventId: askedId })
    expect(askItem.key).toBe(`${askItem.assignmentId}:ask:${askedId}`)
    // 作答 → worker 完成 → 1 项 end
    await answerApproval(askedFrame, 'allowed-once')
    await untilTrue(async () => (await readLog(W)).some((e) => e.type === 'turn/end'), 'worker turn ends after approval')
    await untilTrue(async () => reports(await readLog(M)).length === 2, 'end report lands')
    log = await readLog(M)
    const endItem = (reports(log)[1].items ?? [])[0]
    expect(endItem).toMatchObject({ kind: 'end', outcome: 'completed' })
    // 已作答后不再发：等 3s，仍恰 2 条
    await sleep(3_000)
    expect(reports(await readLog(M)).length).toBe(2)
  })

  it('⑩ 回报与用户消息同时待处理 → 用户消息的回合先跑（决策 16）', { timeout: 300_000 }, async () => {
    const M = await newSession()
    const W = await newSession()
    writeBots(M, { [W]: { createdBy: M } })
    writeScript(W, [text('结果', 800)])
    writeScript(M, [
      sendCall('p0', W, '一件事'),
      gatedText('g-prio'), // turn1 收尾挂着，期间排队用户消息 + worker 完成
      text('先回了用户'),
      text('再收回报'),
    ])
    await prompt(M, '派活并等我说话')
    await untilTrue(async () => (await readLog(W)).some((e) => e.type === 'turn/end'), 'worker done while main turn gated')
    await prompt(M, '排队的用户消息') // mode queue → next-turn
    openGate('g-prio')
    // 用户回合先跑，回合结束后回报才投、再被消费
    await untilTrue(async () => turnEnds(await readLog(M)).length >= 3, 'user turn + report turn both finish')
    const log = await readLog(M)
    // M 的两条 user 消息：'派活并等我说话'（turn1）与排队的 '排队的用户消息'（turn2）
    const userMsgs = log.filter((e) => e.type === 'user/message' && e.sourceKind === 'user')
    expect(userMsgs.length).toBeGreaterThanOrEqual(2)
    const userSeq = userMsgs[1].seq
    const reportSeq = reports(log)[0].seq
    expect(reportSeq, '回报在用户消息之后被认领（用户回合先跑）').toBeGreaterThan(userSeq)
  })

  it('⑦ 用户停止：aborted 撤回 inbox 待处理回报、5s 不起新回合；用户下一回合纯 user 来源且工具可用；结束后补投恰 1', { timeout: 300_000 }, async () => {
    const M = await newSession()
    const W = await newSession()
    writeBots(M, { [W]: { createdBy: M } })
    const recover = join(workspace, 'stop-recover')
    writeScript(W, [text('结果', 400)])
    writeScript(M, [
      sendCall('q0', W, '一件事'),
      gatedText('g-stop'), // turn1 挂着：期间 worker 完成（攒）+ 手工注入一条回报进 inbox
      bashCall('q1', `touch ${recover}`), // turn2 = 用户回合，工具可用
      text('用户回合结束'),
      text('消费补投的回报'), // turn3
    ])
    await prompt(M, '派活')
    await untilTrue(async () => (await readLog(W)).some((e) => e.type === 'turn/end'), 'worker done')
    await sleep(2_600) // 等 2s 窗口的 flush 跑完（刷新 cachedMainId），再注入与停止
    // 构造「主 bot 回合进行中，一项回报待处理」：真键 A:end 的假 report followup 排队
    const sent = (await readLog(M)).find((e) => e.type === 'tool/result' && e.isError !== true)
    expect(sent, 'send_to_bot 成功').toBeTruthy()
    const { assignmentId } = JSON.parse(sent!.text ?? '{}') as { assignmentId: string }
    await control({ op: 'inject', sessionId: M, id: `pbots-report:stop-${Date.now()}`, items: [{ key: `${assignmentId}:end`, kind: 'end', workerId: W, assignmentId }] })
    // 应用的停止：RPC session/cancel（keepInbox）
    await rt.client.call('session/cancel', { request: { sessionId: M } })
    await untilTrue(async () => (await readLog(M)).some((e) => e.type === 'turn/end' && e.reason === 'aborted'), 'turn1 aborted')
    // 撤回：等 canceled splice 落盘（withdraw 跳出事件发布栈后重试，P6-12 实测）
    await untilTrue(async () => (await readLog(M)).some((e) => e.type === 'agent/inbox/spliced' && e.outcome === 'canceled'), 'canceled splice lands')
    const inbox = (await control({ op: 'resolve', sessionId: M })) as { nextTurn: string[] }
    expect(inbox.nextTurn.filter((id) => id.startsWith('pbots-report:')).length).toBe(0)
    // 5s 内主 bot 不起新回合
    await sleep(5_000)
    expect(turnEnds(await readLog(M)).length).toBe(1)
    // 用户下一回合：纯 user 来源 + bash 可用（审批卡→批）
    const approve = approveNextBash(M)
    const log2 = await runTurn(M, '继续', 'user turn after stop')
    await approve
    expect(log2.some((e) => e.type === 'tool/call')).toBe(true)
    await untilTrue(() => existsSync(recover), 'bash touch works in the clean user turn')
    // 回合结束后补投恰 1（真 assignment 的 end 键）
    await untilTrue(async () => reports(await readLog(M)).length === 1, 're-delivered exactly once')
    const finalLog = await readLog(M)
    const landed = (reports(finalLog)[0].items ?? []).map((i: any) => i.key)
    expect(landed).toEqual([`${assignmentId}:end`])
  })

  it('⑦b 主 bot 回合以 blocked / max-tokens 结束 → 照常触发投递（决策 27③）', { timeout: 300_000 }, async () => {
    // blocked：pre-step reject（P6-09 (b) 同法）
    {
      const M = await newSession()
      const W = await newSession()
      writeBots(M, { [W]: { createdBy: M } })
      writeScript(W, [text('结果', 5)])
      writeScript(M, [sendCall('b0', W, '一件事'), text('派出去了'), text('收到回报')])
      await prompt(M, '派活')
      await untilTrue(async () => (await readLog(W)).some((e) => e.type === 'turn/end'), 'worker done')
      // blocked = pre-step reject：驱动消息自己注入（matchId 可控）
      const msgId = `p612-block-${Date.now()}`
      await control({ op: 'arm-reject', key: 'blk', sessionId: M, matchId: msgId })
      await control({ op: 'inject', sessionId: M, kind: 'schedule', id: msgId })
      await untilTrue(async () => (await readLog(M)).some((e) => e.type === 'turn/end' && e.reason === 'blocked'), 'blocked turn ends')
      await untilTrue(async () => reports(await readLog(M)).length === 1, 'report delivered after blocked turn')
      await control({ op: 'arm-reject', key: 'blk', clear: true })
    }
    // max-tokens：fake finish max-tokens
    {
      const M = await newSession()
      const W = await newSession()
      writeBots(M, { [W]: { createdBy: M } })
      writeScript(W, [text('结果', 5)])
      writeScript(M, [sendCall('mt0', W, '一件事'), gatedText('g-mt', { kind: 'max-tokens' }), text('收到回报')])
      await prompt(M, '派活')
      await untilTrue(async () => (await readLog(W)).some((e) => e.type === 'turn/end'), 'worker done')
      openGate('g-mt')
      await untilTrue(async () => (await readLog(M)).some((e) => e.type === 'turn/end' && e.reason === 'max-tokens'), 'max-tokens turn ends')
      await untilTrue(async () => reports(await readLog(M)).length === 1, 'report delivered after max-tokens turn')
    }
  })
})

// ---- 崩溃恢复（P6-12 验收 ⑤⑥ + P6-09 (f5)/(g) 同法）----
// 同一 home 多轮 boot：每轮造一个真 assignment（M 经 send_to_bot 派 W），在
// 指定崩溃点让自己 spawn 的 SDK 退出（crashAt 进程内 exit / inspect claim-crash
// / SIGKILL dsh 字面 pid），重启后按决策 27 重算断言恰一次。
import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'

interface CrashRt { child: ChildProcess; client: DshClient; dshPid: number | null; output: string }

const crashHome = tmkdir('bot-p612-crash-')
const crashData = join(crashHome, 'data')
mkdirSync(join(crashHome, 'fake', 'scripts'), { recursive: true })
mkdirSync(crashData, { recursive: true })
const fakeOverlay = join(crashHome, 'fake.yml')
writeFileSync(fakeOverlay, `\
# P6-12 crash-suite fake provider overlay
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
    - id: p610-inspect
      name: '${pathToFileURL(join(PKG_ROOT, 'tests', 'support', 'orchestration-create-inspect.mjs')).href}'
`)

/** One boot: own overlay carries this round's crashAt（同 id insert 语义不赌，直接自带插件行）. */
async function crashBoot(crashAt?: string): Promise<CrashRt> {
  const orch = join(crashHome, `orch-${crashAt ?? 'plain'}-${Date.now()}.yml`)
  writeFileSync(orch, `\
# P6-12 crash round overlay (crashAt=${crashAt ?? 'none'})
- insert:
    - id: pbots-orchestration
      name: '${pathToFileURL(join(PKG_ROOT, 'src', 'orchestration', 'main-channel.mjs')).href}'
      config:
        crashAt: '${crashAt ?? ''}'
        dataDir: '${crashData}'
`)
  const handoff = tmkdir('bot-p612-hand-')
  rmSync(join(handoff, 'base-url'), { force: true })
  rmSync(join(handoff, 'launch-token'), { force: true })
  let output = ''
  let dshPid: number | null = null
  const child = spawn(process.execPath, [join(PKG_ROOT, 'scripts', 'start.mjs')], {
    env: {
      ...process.env,
      P2SDK_PROVIDER: 'mock', P2SDK_HOME: crashHome, P2SDK_HANDOFF: handoff,
      P2SDK_PORT: '0', PBOTS_DATA_DIR: crashData, P2SDK_ORCH_DATA_DIR: crashData,
      P2SDK_PATCH: `${fakeOverlay}:${orch}`,
      DSH_TELEMETRY_MODE: 'DISABLED',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout!.setEncoding('utf8')
  child.stderr!.setEncoding('utf8')
  child.stdout!.on('data', (c: string) => { output += c })
  child.stderr!.on('data', (c: string) => {
    output += c
    const m = /p2sdk: dsh pid (\d+)/.exec(c)
    if (m) dshPid = Number(m[1])
  })
  const deadline = Date.now() + 60_000
  for (;;) {
    if (existsSync(join(handoff, 'launch-token'))) break
    if (child.exitCode !== null) throw new Error(`crash boot exited early (${child.exitCode}):\n${output.slice(-2000)}`)
    if (Date.now() > deadline) throw new Error(`crash boot timed out:\n${output.slice(-2000)}`)
    await sleep(200)
  }
  const client = await connect({ baseUrl: readFileSync(join(handoff, 'base-url'), 'utf8').trim(), token: readFileSync(join(handoff, 'launch-token'), 'utf8').trim() })
  return { child, client, get dshPid() { return dshPid }, get output() { return output } }
}

const crashStop = async (rt: CrashRt, kill = false) => {
  if (kill) {
    if (rt.dshPid !== null) process.kill(rt.dshPid, 'SIGKILL') // 本轮自己 spawn 的 dsh 孙进程（字面 PID）
    if (rt.child.exitCode === null) rt.child.kill('SIGKILL')
  } else if (rt.child.exitCode === null) {
    const exited = new Promise((r) => rt.child.once('exit', r))
    rt.child.kill('SIGTERM')
    const timer = setTimeout(() => rt.child.kill('SIGKILL'), 10_000)
    await exited
    clearTimeout(timer)
  }
  try { rt.client.close() } catch { /* already gone */ }
  await sleep(300) // 让 sqlite 侧文件落定（P6-09 killSdk 同款）
}

describe('P6-12 crash & restart (决策 27 恰一次)', () => {
  const cRead = async (rt: CrashRt, sessionId: string): Promise<LogEvent[]> =>
    ((await rt.client.call('p610/control', { request: { op: 'read', sessionId } })) as { events: LogEvent[] }).events
  const cPrompt = (rt: CrashRt, sessionId: string, t: string) =>
    rt.client.call('session/prompt', { request: { requestId: `p612c-${Date.now()}-${Math.random().toString(16).slice(2)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: t }] } })
  const cUntil = async (rt: CrashRt, pred: () => Promise<boolean>, label: string, ms = 60_000) => {
    const deadline = Date.now() + ms
    for (;;) {
      if (await pred()) return
      if (rt.child.exitCode !== null) throw new Error(`${label}: SDK exited unexpectedly:\n${rt.output.slice(-1500)}`)
      if (Date.now() > deadline) throw new Error(`${label}: timed out`)
      await sleep(150)
    }
  }
  /** 一个真 assignment：M 派 W、W 跑完（turn/end 落盘）。返回 { M, W, assignmentId }。 */
  async function makeAssignment(rt: CrashRt, paceMs = 5): Promise<{ M: string, W: string, assignmentId: string }> {
    const M = ((await rt.client.call('session/create', { request: { agentPreset: 'standard' } })) as { sessionId: string }).sessionId
    const W = ((await rt.client.call('session/create', { request: { agentPreset: 'standard' } })) as { sessionId: string }).sessionId
    writeFileSync(join(crashData, 'bots.json'), JSON.stringify({ version: 1, mainBotId: M, recipes: {}, bots: { [W]: { createdBy: M } } }))
    writeFileSync(join(crashHome, 'fake', 'scripts', `${W}.json`), JSON.stringify({ calls: [text('crash-suite 结果', paceMs)] }))
    writeFileSync(join(crashHome, 'fake', 'scripts', `${M}.json`), JSON.stringify({ calls: [sendCall('cs0', W, '一件事')] }))
    await cPrompt(rt, M, '派活')
    await cUntil(rt, async () => {
      const wLog = await cRead(rt, W)
      return wLog.some((e) => e.type === 'turn/end')
    }, 'worker assignment turn ends')
    const mLog = await cRead(rt, M)
    const sent = mLog.find((e) => e.type === 'tool/result' && e.isError !== true)
    const { assignmentId } = JSON.parse(sent?.text ?? '{}') as { assignmentId: string }
    if (!assignmentId) throw new Error(`no assignmentId in send result: ${sent?.text}`)
    return { M, W, assignmentId }
  }
  /** 报告消息里某键出现的次数。 */
  const keyCount = (log: LogEvent[], key: string) =>
    log.filter((e) => e.type === 'user/message' && e.sourceKind === 'pbots-worker')
      .flatMap((e) => e.items ?? []).filter((i: any) => i.key === key).length

  it('(i) crashAt before-send：due 计算后崩 → 重启补投，键恰 1（兼 ⑤ completed 未投递）', { timeout: 300_000 }, async () => {
    const rt1 = await crashBoot('report-before-send')
    const { M, W, assignmentId } = await makeAssignment(rt1)
    // 2s 窗口 → flush → due 非空 → exit(87)
    const exited = new Promise((r) => rt1.child.once('exit', r))
    await exited
    expect(rt1.child.exitCode).toBe(87)
    try { rt1.client.close() } catch { /* gone */ }
    await sleep(300)
    const rt2 = await crashBoot()
    // 重启对账补投 + 主 bot 消费：fake 游标归零，M 的第一响应即回报回合
    writeFileSync(join(crashHome, 'fake', 'scripts', `${M}.json`), JSON.stringify({ calls: [text('重启后收到')] }))
    await cUntil(rt2, async () => keyCount(await cRead(rt2, M), `${assignmentId}:end`) === 1, 're-delivered exactly once', 90_000)
    const log = await cRead(rt2, M)
    expect(keyCount(log, `${assignmentId}:end`)).toBe(1)
    const item = (log.find((e) => e.type === 'user/message' && e.sourceKind === 'pbots-worker')?.items ?? [])[0]
    expect(item).toMatchObject({ kind: 'end', outcome: 'completed', workerId: W })
    await crashStop(rt2)
  })

  it('(ii) crashAt after-send：send 落盘后崩 → 重启不重投，键恰 1', { timeout: 300_000 }, async () => {
    const rt1 = await crashBoot('report-after-send')
    const { M, assignmentId } = await makeAssignment(rt1)
    await new Promise((r) => rt1.child.once('exit', r))
    expect(rt1.child.exitCode).toBe(87)
    try { rt1.client.close() } catch { /* gone */ }
    await sleep(300)
    const rt2 = await crashBoot()
    writeFileSync(join(crashHome, 'fake', 'scripts', `${M}.json`), JSON.stringify({ calls: [text('重启后收到'), text('多余')] }))
    // 崩溃前 splice 已 flush：重启后该消息在 inbox 待处理 → needsWake 唤醒 → 恰一次消费
    await cUntil(rt2, async () => keyCount(await cRead(rt2, M), `${assignmentId}:end`) === 1, 'woke and consumed exactly once', 90_000)
    await sleep(4_000) // 确认无第二次投递
    const log = await cRead(rt2, M)
    expect(keyCount(log, `${assignmentId}:end`)).toBe(1)
    expect(log.filter((e) => e.type === 'user/message' && e.sourceKind === 'pbots-worker').length).toBe(1)
    await crashStop(rt2)
  })

  it('(iii) crashAt before-splice：消息构造后、splice 前崩 → 重启补投恰 1', { timeout: 300_000 }, async () => {
    const rt1 = await crashBoot('report-before-splice')
    const { M, assignmentId } = await makeAssignment(rt1)
    await new Promise((r) => rt1.child.once('exit', r))
    expect(rt1.child.exitCode).toBe(87)
    try { rt1.client.close() } catch { /* gone */ }
    await sleep(300)
    const rt2 = await crashBoot()
    writeFileSync(join(crashHome, 'fake', 'scripts', `${M}.json`), JSON.stringify({ calls: [text('重启后收到')] }))
    await cUntil(rt2, async () => keyCount(await cRead(rt2, M), `${assignmentId}:end`) === 1, 're-delivered exactly once', 90_000)
    expect(keyCount(await cRead(rt2, M), `${assignmentId}:end`)).toBe(1)
    await crashStop(rt2)
  })

  it('claim 窗口（P6-09 (f5-ii)/(g)）：主 bot 认领回报后、user/message 前崩 → 重启补投恰 1', { timeout: 300_000 }, async () => {
    const rt1 = await crashBoot()
    await rt1.client.call('p610/control', { request: { op: 'arm-claim-crash', armed: true } })
    const { M, assignmentId } = await makeAssignment(rt1)
    // flush（无 crashAt）投出 → 主 bot 起回合 claim pbots-report:* → inspect exit(88)
    await new Promise((r) => rt1.child.once('exit', r))
    expect(rt1.child.exitCode).toBe(88)
    try { rt1.client.close() } catch { /* gone */ }
    await sleep(300)
    const rt2 = await crashBoot()
    writeFileSync(join(crashHome, 'fake', 'scripts', `${M}.json`), JSON.stringify({ calls: [text('重启后收到')] }))
    // claim 崩溃窗口：既无 user/message 也不在 inbox → 决策 27 重算判回待投
    await cUntil(rt2, async () => keyCount(await cRead(rt2, M), `${assignmentId}:end`) === 1, 'claim-window key re-delivered exactly once', 90_000)
    expect(keyCount(await cRead(rt2, M), `${assignmentId}:end`)).toBe(1)
    await crashStop(rt2)
  })

  it('⑤ worker 回合中 SIGKILL → 重启恰 1 项 end:stopped', { timeout: 300_000 }, async () => {
    const rt1 = await crashBoot()
    const M = ((await rt1.client.call('session/create', { request: { agentPreset: 'standard' } })) as { sessionId: string }).sessionId
    const W = ((await rt1.client.call('session/create', { request: { agentPreset: 'standard' } })) as { sessionId: string }).sessionId
    writeFileSync(join(crashData, 'bots.json'), JSON.stringify({ version: 1, mainBotId: M, recipes: {}, bots: { [W]: { createdBy: M } } }))
    writeFileSync(join(crashHome, 'fake', 'scripts', `${W}.json`), JSON.stringify({ calls: [text('跑一半', 60_000)] }))
    writeFileSync(join(crashHome, 'fake', 'scripts', `${M}.json`), JSON.stringify({ calls: [sendCall('ks0', W, '一件事')] }))
    await cPrompt(rt1, M, '派活')
    await cUntil(rt1, async () => (await cRead(rt1, W)).some((e) => e.type === 'turn/start'), 'worker turn starts')
    await cUntil(rt1, async () => {
      const mLog = await cRead(rt1, M)
      return mLog.some((e) => e.type === 'tool/result')
    }, 'main bot send returns')
    await crashStop(rt1, true) // SIGKILL 自己 spawn 的 dsh + launcher（字面 PID）
    const rt2 = await crashBoot()
    writeFileSync(join(crashHome, 'fake', 'scripts', `${M}.json`), JSON.stringify({ calls: [text('重启后收到')] }))
    await cUntil(rt2, async () => {
      const log = await cRead(rt2, M)
      return log.some((e) => e.type === 'user/message' && e.sourceKind === 'pbots-worker')
    }, 'stopped report lands after restart', 90_000)
    const log = await cRead(rt2, M)
    const item = (log.find((e) => e.type === 'user/message' && e.sourceKind === 'pbots-worker')?.items ?? [])[0]
    expect(item).toMatchObject({ kind: 'end', outcome: 'stopped' })
    expect(log.filter((e) => e.type === 'user/message' && e.sourceKind === 'pbots-worker').length).toBe(1)
    await crashStop(rt2)
  })
})
