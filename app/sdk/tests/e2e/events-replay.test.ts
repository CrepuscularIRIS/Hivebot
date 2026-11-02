// T-15 探明②（work/p3-contract/CONTRACT.md §7 遗留 2，审批卡×renderer 重载）：
// $events 断开后产生的待审批请求，在重连 + 重新 $events 时是否补发。
//
// 流程（任务原文顺序）：挂一路 $events（interactions=answer）→ 断开 mux →
// 制造一个待审批请求（普通 bash 调用，T-12 默认 shell-ask 必问）→ 重连 +
// 重新 $events → 观察待审批卡片是否重发；若重发，再验证补发的卡片可作答。
//
// 上游依据（先读码后验证，测试才是权威）：dsh gateway
// packages/api/gateway/src/index.ts:586-589 —— 新 $events 客户端注册时，把
// pendingRemoteEvents 全量逐条 deliverRemoteEvent；:732-738 —— 客户端断开只
// 清自己的 deliveries，pending 本身不取消。由此推定补发语义是「订阅时刻的
// 全量未决集合快照」，无 cursor；emit 广播不在补发范围（broadcastRemoteEvent
// 只推当前在线客户端）。断开前已投递未作答的请求与断开期间新产生的请求走
// 同一条注册补发路径，本测试取后者（任务指定顺序）。
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { launchFakeRuntime, sendPrompt, waitFor, waitForTurnEnd, type Frame, type FakeRuntime } from '../support/fake/harness.ts'
import type { Runtime } from '../support/runtime.ts'

/** One $events downlink frame (gateway stream-protocol.ts RemoteEventDownlinkFrame). */
interface EventsFrame {
  type: string
  event?: string
  eventId?: string
  agentId?: string
  clientId?: string
  request?: { toolName?: string; callId?: string; reason?: string }
}

/** One answer-mode client's $events subscription. */
interface EventsFeed {
  client: DshClient
  frames: EventsFrame[]
  answer(frame: EventsFrame, value: string): Promise<unknown>
  close(): void
}

async function openEvents(rt: Runtime): Promise<EventsFeed> {
  const client = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const stream = await client.socket.open('$events', {})
  const frames: EventsFrame[] = []
  const drained = (async () => {
    for await (const f of stream) frames.push(f as EventsFrame)
  })()
  const ready = await waitFor(frames as unknown as Frame[], (f) => f.type === 'ready', 5000, '$events ready')
  const clientId = frames[ready].clientId ?? ''
  return {
    client,
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

/** Wait for this session's approval/request waterfall on the feed; the timeout
 * message carries every frame type seen so the red case (no replay) is readable. */
async function waitForWaterfall(feed: EventsFeed, sessionId: string, ms: number): Promise<EventsFrame> {
  const deadline = Date.now() + ms
  for (;;) {
    const hit = feed.frames.find(
      (f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId,
    )
    if (hit) return hit
    if (Date.now() >= deadline) {
      const seen = feed.frames.map((f) => f.type + (f.event ? `:${f.event}` : '')).join(', ')
      throw new Error(
        `no approval/request replay for session ${sessionId} within ${ms}ms; frames seen on reconnected $events: [${seen}]`,
      )
    }
    await new Promise((r) => setTimeout(r, 20))
  }
}

/** Scripted bash tool call (approval.test.ts vocabulary). */
function bashCall(command: string): object {
  const id = `p2sdk-t15-${Math.random().toString(16).slice(2, 8)}`
  const argumentsJson = JSON.stringify({ command, description: 'T-15 pending-approval replay probe' })
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id, name: 'bash', argumentsDelta: argumentsJson.slice(0, 5) },
      { type: 'tool-call-delta', index: 0, id, name: 'bash', argumentsDelta: argumentsJson.slice(5) },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'bash', arguments: argumentsJson } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ],
    paceMs: 10,
  }
}

/** Scripted plain-text answer (the post-tool model call that closes the turn). */
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

it('T-15② a pending approval created while $events was disconnected is replayed to the reconnected $events and stays answerable', async () => {
  const rt: FakeRuntime = await launchFakeRuntime()
  let feed2: EventsFeed | undefined
  try {
    // 挂一路 $events，确认可订阅，然后断开 mux（renderer/main 重载的替身）。
    const feed1 = await openEvents(rt)
    const firstClientId = feed1.frames.find((f) => f.type === 'ready')?.clientId ?? ''
    feed1.close()

    // 断开期间制造一个待审批请求：普通 bash 调用，默认 shell-ask 必问（T-12）。
    const cwd = join(rt.home, 'workspace')
    mkdirSync(cwd, { recursive: true })
    const { sessionId: s } = (await rt.client.call('session/create', { request: { cwd } })) as { sessionId: string }
    const canary = join(cwd, 'canary-t15')
    rt.writeScriptCalls(s, [bashCall(`touch ${canary}`), textCall('被拒绝')])

    const stream = await rt.client.follow(s)
    const frames: Frame[] = []
    const drained = (async () => { for await (const f of stream) frames.push(f) })()
    await sendPrompt(rt.client, s, '摸一下 canary')
    // The request exists server-side: the follow audit stream records approval/asked
    // while NO $events client is connected.
    await waitFor(frames, (f) => f.type === 'event' && f.event?.type === 'approval/asked', 10_000, 'approval/asked while disconnected')

    // 重连 + 重新 $events：THE 探明断言。绿 = 补发存在（全量未决集合）；
    // 红 = 无补发，main 需自缓存未决项（CONTRACT §7.2 的增量方案）。
    feed2 = await openEvents(rt)
    const replayed = await waitForWaterfall(feed2, s, 10_000)
    expect(replayed.request?.toolName, 'the replayed card names the bash tool').toBe('bash')
    expect(replayed.agentId, 'the replayed card carries the calling sessionId').toBe(s)
    const readyIndex = feed2.frames.findIndex((f) => f.type === 'ready')
    const replayIndex = feed2.frames.indexOf(replayed)
    expect(readyIndex, 'ready precedes the replayed waterfall (subscribe-then-replay ordering)').toBeLessThan(replayIndex)
    expect(feed2.frames[readyIndex].clientId, 'the reconnected feed got a fresh clientId').not.toBe(firstClientId)

    // The replayed card is answerable on the new connection; rejection runs nothing.
    await feed2.answer(replayed, 'rejected')
    await waitForTurnEnd(frames, 15_000)
    expect(existsSync(canary), 'rejected replayed card executed nothing').toBe(false)

    stream.cancel()
    void drained
  } finally {
    feed2?.close()
    await rt.stop()
  }
}, 120_000)
