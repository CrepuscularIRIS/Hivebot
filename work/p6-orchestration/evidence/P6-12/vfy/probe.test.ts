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
import { afterAll, beforeAll, describe, expect, it } from '/tmp/bot-wt/P6-12/app/sdk/node_modules/vitest/dist/index.js'
import { launchRuntime, type Runtime } from '/tmp/bot-wt/P6-12/app/sdk/tests/support/runtime.ts'
import { tmkdir } from '/tmp/bot-wt/P6-12/app/sdk/tests/support/tmp-sweep.ts'
import { connect, type DshClient } from '/tmp/bot-wt/P6-12/app/sdk/examples/lib/client.mjs'

const PKG_ROOT = '/tmp/bot-wt/P6-12/app/sdk'

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
      name: '${pathToFileURL('/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-12/vfy/instrument-inspect.mjs').href}'
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


  it('verifier bad path: worker BLOCKED while main gated must not interrupt, report only after main end', { timeout: 180_000 }, async () => {
    const M = await newSession(), W = await newSession()
    writeBots(M, { [W]: { createdBy: M } })
    // Reject the worker assignment at pre-step, producing a real blocked terminal.
    // Match id is not known yet, so observe send result while W's text is gated,
    // then block a second step with a worker continuation isn't equivalent.
    // Instead use a test-only reject hook that matches all worker messages.
    await control({ op: 'arm-reject', key: 'bad-worker', sessionId: W, matchId: '*' })
    writeScript(W, [text('must not run')])
    writeScript(M, [sendCall('bad-send', W, 'blocked worker task'), gatedText('vfy-busy'), text('received blocked report')])
    await prompt(M, 'delegate blocked task')
    await untilTrue(async () => (await readLog(W)).some(e => e.type === 'turn/end' && e.reason === 'blocked'), 'worker blocked')
    await sleep(3200)
    const before = await readLog(M)
    expect(turnEnds(before)).toHaveLength(0)
    expect(reports(before)).toHaveLength(0)
    expect((await control({ op: 'resolve', sessionId: M })).status).toBe('running')
    openGate('vfy-busy')
    await untilTrue(async () => turnEnds(await readLog(M)).length >= 2, 'main then report turn finish')
    await sleep(2500)
    const after = await readLog(M)
    expect(reports(after)).toHaveLength(1)
    expect(reports(after)[0].items).toHaveLength(1)
    expect(reports(after)[0].items[0]).toMatchObject({ kind: 'end', outcome: 'error', reason: 'blocked', workerId: W })
    expect(reports(after)[0].seq).toBeGreaterThan(turnEnds(after)[0].seq)
    writeFileSync('/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-12/vfy/bad-path.json', JSON.stringify({before,after},null,2))
    console.log('BAD_PATH evidence', JSON.stringify({ beforeEnds: turnEnds(before).length, beforeReports: reports(before).length, mainEnd: turnEnds(after)[0].seq, report: reports(after)[0] }))
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
    expect(rt.readStderr()).toContain('[p612-vfy] withdraw failed:')
    expect(rt.readStderr()).toContain('cannot reenter while another append is being published')
    expect(rt.readStderr()).toContain('[p612-vfy] withdraw succeeded')
    writeFileSync('/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-12/vfy/withdraw-observed.txt', rt.readStderr().split('\n').filter(l => /p612-vfy|withdrew/.test(l)).join('\n'))
    writeFileSync('/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-12/vfy/cancel-events.json', JSON.stringify(finalLog,null,2))
    console.log('WITHDRAW evidence', rt.readStderr().split('\n').filter(l => /p612-vfy|withdrew/.test(l)).join('\n'))
    console.log('CANCEL trace', JSON.stringify(finalLog.filter(e => ['turn/start','turn/end','user/message','agent/inbox/spliced'].includes(e.type))))
    const landed = (reports(finalLog)[0].items ?? []).map((i: any) => i.key)
    expect(landed).toEqual([`${assignmentId}:end`])
  })


})
