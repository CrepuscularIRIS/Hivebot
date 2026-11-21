// U-16 M2 e2e：D4③ 无人应答 deadline——main 代答（方案 A，spike S5：上游 300s 零终态）。
// T1 超时路径：交互客户端断开（关窗口，main 常驻存活）满 deadline → main 经自己的连接代答
//    rejected → 工具不执行（canary 不存在 + tool/result isError）+ 台账下账；观察窗口有界可证伪
//    （窗口到期仍 pending 即 poll 超时 FAIL）。
// T2 宽限路径：renderer 在场（挂载）超 deadline 不代答；重载重连接手 + approved → canary 出现，
//    全程代答计数 === 0。
// fake 脚本协议与 helpers 同 m2-port.spec.ts（来源 app/sdk/tests/support/fake/harness.ts）。
import { expect, test, type Page } from 'playwright/test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '../support/tmp-sweep.ts'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'

function sendPrompt(client: SdkRuntime['client'], sessionId: string, prompt: string): Promise<unknown> {
  const requestId = `p2sdk-u16-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  return client.call('session/prompt', {
    request: { requestId, sessionId, mode: 'queue', content: [{ type: 'text', text: prompt }] },
  })
}

async function waitEventsReady(page: Page, timeout = 20_000): Promise<string> {
  await page.waitForFunction(
    () => (window as unknown as { __pbotsDev?: { events: { clientId?: string } } }).__pbotsDev?.events.clientId !== undefined,
    undefined,
    { timeout },
  )
  const clientId = await page.evaluate(() =>
    (window as unknown as { __pbotsDev: { events: { clientId?: string } } }).__pbotsDev.events.clientId)
  expect(typeof clientId).toBe('string')
  return clientId as string
}

async function waitWaterfall(page: Page, sessionId: string, timeout = 20_000): Promise<{ eventId: string }> {
  await page.waitForFunction(
    (sid) => {
      const items = (window as unknown as { __pbotsDev: { events: { items: Array<{ type?: string; event?: string; agentId?: string; eventId?: string }> } } }).__pbotsDev.events.items
      return items.some((it) => it.type === 'waterfall' && it.event === 'approval/request' && it.agentId === sid)
    },
    sessionId,
    { timeout },
  )
  const hit = await page.evaluate((sid) =>
    (window as unknown as { __pbotsDev: { events: { items: Array<{ type?: string; event?: string; agentId?: string; eventId?: string }> } } })
      .__pbotsDev.events.items.find((it) => it.type === 'waterfall' && it.event === 'approval/request' && it.agentId === sid),
    sessionId)
  return { eventId: hit.eventId as string }
}

function bashCall(command: string): object {
  const id = `p2sdk-u16-${Math.random().toString(16).slice(2, 8)}`
  const argumentsJson = JSON.stringify({ command, description: 'U-16 deadline approval probe' })
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

function textCall(text: string): object {
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text },
      { type: 'block-end', index: 0, block: { type: 'text', text } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 1 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
    paceMs: 10,
  }
}

async function createApprovalSession(rt: SdkRuntime): Promise<{ sessionId: string; cwd: string }> {
  const cwd = tmkdir('bot-U-16-ws-')
  const { sessionId } = (await rt.client.call('session/create', { request: { cwd } })) as { sessionId: string }
  return { sessionId, cwd }
}

/** main 侧 deadline 观测面（不新开 IPC 通道，经 __pbotsM2）。 */
function m2Deadline(app: import('playwright').ElectronApplication): Promise<{
  answers: number; answeredEvents: string[]; pending: string[]
}> {
  return app.evaluate(() => {
    const m2 = (globalThis as unknown as { __pbotsM2: { stats: { deadline: { answers: number; answeredEvents: string[] } }; ledger: { pendingEvents(): Array<{ eventId: string }> } } }).__pbotsM2
    return { answers: m2.stats.deadline.answers, answeredEvents: m2.stats.deadline.answeredEvents, pending: m2.ledger.pendingEvents().map((e) => e.eventId) }
  })
}

test('②超时+③观察窗口：交互客户端断开满 deadline → main 代答 rejected 恰 1 次、工具不执行、零副作用、台账下账', async () => {
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath() })
  const deadlineMs = 2_500
  const shell = await launchShell({
    env: {
      PBOTS_DSH_HANDOFF: rt.handoff,
      PBOTS_HOLD_ON_CLOSE: '1', // 关窗口后 main 存活（spike S4(4) 同款）
      PBOTS_APPROVAL_DEADLINE_MS: String(deadlineMs),
    },
  })
  try {
    await waitEventsReady(shell.page)
    const { sessionId, cwd } = await createApprovalSession(rt)
    const canary = join(cwd, 'canary-timeout')
    rt.writeScriptCalls(sessionId, [bashCall(`touch ${canary}`), textCall('收尾')])
    await sendPrompt(rt.client, sessionId, 'turn-1')
    const { eventId } = await waitWaterfall(shell.page, sessionId)

    let view = await m2Deadline(shell.app)
    expect(view.pending).toContain(eventId)
    expect(view.answers).toBe(0)

    // 交互客户端断开：关闭唯一窗口（renderer 的 $events 端口随之卸载；main 常驻订阅不受影响）
    await shell.page.close()

    // ③ 观察窗口 = 2×deadline + 余量，有界可证伪：到期仍 pending / 未代答 → poll 超时即 FAIL
    await expect.poll(() => m2Deadline(shell.app).then((v) => v.answers), {
      timeout: 2 * deadlineMs + 15_000,
    }).toBe(1)
    view = await m2Deadline(shell.app)
    expect(view.answeredEvents).toEqual([eventId]) // +4 精确值
    expect(view.pending).toEqual([])               // 作答后下账（gateway cancel → main 常驻订阅）

    // 终态：rejected 的 tool/result（isError）+ turn/end（session 侧记录）
    await expect.poll(async () => {
      const events = (await rt.client.call('session/events', {
        request: { address: { kind: 'session', sessionId }, maxMessages: 200 },
      })) as { records: Array<{ event?: { type?: string } }> }
      const toolErr = events.records.some((r) => r.event?.type === 'tool/result' && JSON.stringify(r).includes('"isError":true'))
      const turnEnd = events.records.some((r) => r.event?.type === 'turn/end')
      return toolErr && turnEnd
    }, { timeout: 30_000 }).toBe(true)

    // 零副作用：工具不执行，canary 全程不存在
    expect(existsSync(canary), 'rejected 代答后 canary 必须不存在').toBe(false)
  } finally {
    await shell.stop()
    await rt.stop()
  }
}, 120_000)

test('②宽限：renderer 在场超 deadline 不代答；重载重连接手并 approved → canary 出现、代答计数恒 0', async () => {
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath() })
  const deadlineMs = 5_000
  const shell = await launchShell({
    env: {
      PBOTS_DSH_HANDOFF: rt.handoff,
      PBOTS_APPROVAL_DEADLINE_MS: String(deadlineMs),
    },
  })
  try {
    await waitEventsReady(shell.page)
    const { sessionId, cwd } = await createApprovalSession(rt)
    const canary = join(cwd, 'canary-grace')
    rt.writeScriptCalls(sessionId, [bashCall(`touch ${canary}`), textCall('收尾')])
    await sendPrompt(rt.client, sessionId, 'turn-1')
    const { eventId } = await waitWaterfall(shell.page, sessionId)

    // 在场（挂载）超过 deadline：main 不代答（D4③ 是「交互客户端断开」的场景）
    await shell.page.waitForTimeout(deadlineMs + 1_500)
    expect(await m2Deadline(shell.app).then((v) => v.answers)).toBe(0)

    // 重连（重载）：新 clientId、同 eventId 补发（D4① 语义），窗口内接手
    await shell.page.reload()
    const newClientId = await waitEventsReady(shell.page)
    const replayed = await waitWaterfall(shell.page, sessionId)
    expect(replayed.eventId).toBe(eventId)

    // 接手并批准：经 main 自己的连接作答（与 $events 流同 Peer）
    await shell.app.evaluate(
      (_electron: unknown, a: { cid: string; eid: string }) => (globalThis as unknown as { __pbotsM2: { testAnswerEvent(cid: string, eid: string, v: 'allowed-once'): Promise<unknown> } }).__pbotsM2.testAnswerEvent(a.cid, a.eid, 'allowed-once'),
      { cid: newClientId, eid: eventId },
    )
    await expect.poll(() => existsSync(canary), { timeout: 30_000 }).toBe(true)

    expect(await m2Deadline(shell.app).then((v) => v.answers)).toBe(0) // 全程零代答
    expect(await m2Deadline(shell.app).then((v) => v.answeredEvents)).toEqual([])
  } finally {
    await shell.stop()
    await rt.stop()
  }
}, 120_000)
