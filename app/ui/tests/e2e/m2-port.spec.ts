// U-12 M2 e2e：真 main/preload/page 通道（决策 4）+ 真 dsh runtime（fake LLM）。
// ① 转交时序（并发不串线/失败不带端口/10s 超时/readyState）④ tap 计数与 ledger
// ⑤ D4① 重载、D4② 断链重连（testDropSocket 注入）：未决 waterfall 带新 clientId 补发、批准后执行。
// fake 脚本协议与 helpers 来源：app/sdk/tests/support/fake/harness.ts、
// app/sdk/tests/e2e/events-replay.test.ts（bashCall/textCall/sendPrompt/createSession 同源）。
import { expect, test, type ElectronApplication, type Page } from 'playwright/test'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell, UI_ROOT } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'

/** Queue-mode prompt（来源：app/sdk/tests/support/fake/harness.ts sendPrompt 同款）。 */
function sendPrompt(client: SdkRuntime['client'], sessionId: string, prompt: string): Promise<unknown> {
  const requestId = `p2sdk-u12-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  return client.call('session/prompt', {
    request: { requestId, sessionId, mode: 'queue', content: [{ type: 'text', text: prompt }] },
  })
}

const PRELOAD = join(UI_ROOT, 'out', 'preload', 'index.cjs')

interface Shell { app: ElectronApplication; page: Page; stop(): Promise<void> }

async function launchM2Shell(rt: SdkRuntime): Promise<Shell> {
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  return { app: shell.app, page: shell.page, stop: shell.stop }
}

/** 等页面模块脚本跑完（__pbotsDev 就位）。 */
async function waitDev(page: Page, timeout = 10_000): Promise<void> {
  await page.waitForFunction(
    () => typeof (window as unknown as { __pbotsDev?: unknown }).__pbotsDev === 'object',
    undefined,
    { timeout },
  )
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

/** Scripted bash tool call（events-replay.test.ts 同款）。 */
function bashCall(command: string): object {
  const id = `p2sdk-u12-${Math.random().toString(16).slice(2, 8)}`
  const argumentsJson = JSON.stringify({ command, description: 'U-12 m2-port approval probe' })
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

/** 建默认 preset 会话（bash + shell-ask，SPIKE §7）并返回 cwd（副作用 canary 必须在会话 cwd 内）。 */
async function createApprovalSession(rt: SdkRuntime): Promise<{ sessionId: string; cwd: string }> {
  const cwd = mkdtempSync(join(tmpdir(), 'bot-U-12-ws-'))
  const { sessionId } = (await rt.client.call('session/create', { request: { cwd } })) as { sessionId: string }
  return { sessionId, cwd }
}

/** 等页面 $events 视图里出现该 session 的 approval/request waterfall。 */
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

test('① 成功转交 + 两并发 requestId 不串线 + readyState 0→1 + tap 计数可读（④）', async () => {
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath() })
  const shell = await launchM2Shell(rt)
  try {
    // boot 端口：$events ready（真 preload 转交路径）
    const bootClientId = await waitEventsReady(shell.page)

    // 第二个并发 requestId：session/follow 流
    const cwd = mkdtempSync(join(tmpdir(), 'bot-U-12-ws-'))
    const { sessionId } = (await rt.client.call('session/create', { request: { cwd } })) as { sessionId: string }
    rt.writeScriptCalls(sessionId, [textCall('回三段'), textCall('收尾')])
    const rid = await shell.page.evaluate(() => (window as unknown as { __pbotsDev: { newSocket(): { requestId: string } } }).__pbotsDev.newSocket().requestId)
    await shell.page.waitForFunction((r: string) => {
      const sockets = (window as unknown as { __pbotsDev: { sockets: Array<{ requestId: string; readyStates: number[] }> } }).__pbotsDev.sockets
      return sockets.find((s) => s.requestId === r)?.readyStates.includes(1)
    }, rid, { timeout: 10_000 })
    const followStreamId = await shell.page.evaluate(({ r, sid }: { r: string; sid: string }) => {
      const sockets = (window as unknown as { __pbotsDev: { sockets: Array<{ requestId: string; openStream(e: string, a?: unknown): { streamId: string } }> } }).__pbotsDev.sockets
      return sockets.find((s) => s.requestId === r)!.openStream('session/follow', { request: { address: { kind: 'session', sessionId: sid }, assistantStream: true } }).streamId
    }, { r: rid, sid: sessionId })

    // follow 开流快照先到（收到端口才 OPEN 已由 readyStates [0,1] 证）
    await shell.page.waitForFunction(
      ({ r }) => {
        const s = (window as unknown as { __pbotsDev: { sockets: Array<{ requestId: string; frames: unknown[] }> } }).__pbotsDev.sockets.find((x) => x.requestId === r)
        return (s?.frames.length ?? 0) > 0
      },
      { r: rid },
      { timeout: 10_000 },
    )
    await sendPrompt(rt.client, sessionId, '走起')
    // 流式 chunk 到齐 + 定稿
    await shell.page.waitForFunction(
      ({ r, want }) => {
        const s = (window as unknown as { __pbotsDev: { sockets: Array<{ requestId: string; frames: unknown[] }> } }).__pbotsDev.sockets.find((x) => x.requestId === r)
        const frames = (s?.frames ?? []).map((f) => (typeof f === 'string' ? JSON.parse(f) : f)) as Array<{ type?: string; value?: { type?: string; frame?: { type?: string } } }>
        const chunks = frames.filter((f) => f.type === 'item' && f.value?.type === 'assistant-stream' && f.value.frame?.type === 'chunk')
        return chunks.length >= want
      },
      { r: rid, want: 1 },
      { timeout: 20_000 },
    )

    // 不串线：boot 的 $events 帧不进 follow 的 frames，反之亦然
    const cross = await shell.page.evaluate(
      ({ r }) => {
        const carrier = (window as unknown as { __pbotsDev: { events: { items: unknown[] }; sockets: Array<{ requestId: string; frames: unknown[] }> } }).__pbotsDev
        const followFrames = carrier.sockets.find((x) => x.requestId === r)!.frames.map((f) => (typeof f === 'string' ? JSON.parse(f) : f)) as Array<{ value?: { type?: string } }>
        const eventsItems = carrier.events.items as Array<{ type?: string }>
        return {
          followGotEventsReady: followFrames.some((f) => f.value?.type === 'ready'),
          eventsGotSnapshot: eventsItems.some((it) => it.type === 'snapshot'),
        }
      },
      { r: rid },
    )
    expect(cross).toEqual({ followGotEventsReady: false, eventsGotSnapshot: false })
    expect(bootClientId).not.toEqual('')

    // readyState 时间线与 relay 端口数（页面侧观察）
    const handle = await shell.page.evaluate((r: string) => {
      const sockets = (window as unknown as { __pbotsDev: { sockets: Array<{ requestId: string; readyStates: number[]; relays: Array<{ ok: boolean; ports: number }> }> } }).__pbotsDev.sockets
      return sockets.find((x) => x.requestId === r)
    }, rid)
    expect(handle.readyStates[0]).toBe(0)
    expect(handle.readyStates[1]).toBe(1)
    expect(handle.relays).toEqual([{ ok: true, ports: 1 }])

    // ④ tap 计数经 electronApp.evaluate 读出（不新开 IPC 通道）：follow 流下行 item 计数 > 0
    const followCount = await shell.app.evaluate(
      (_electron: unknown, sid: string) => (globalThis as unknown as { __pbotsM2: { stats: { downlink: { items: Record<string, number> } } } }).__pbotsM2.stats.downlink.items[sid],
      followStreamId,
    )
    expect(followCount).toBeGreaterThanOrEqual(1)
    const ledgerId = await shell.app.evaluate(() => (globalThis as unknown as { __pbotsM2: { ledger: { readyClientId?: string } } }).__pbotsM2.ledger.readyClientId)
    expect(ledgerId).toBe(bootClientId)
  } finally {
    await shell.stop()
    await rt.stop()
  }
})

test('① 失败不带端口：dsh 未配置 → {ok:false,error}，readyState=3', async () => {
  const shell = await launchShell() // 无 PBOTS_DSH_HANDOFF
  try {
    await waitDev(shell.page)
    const rid = await shell.page.evaluate(() => (window as unknown as { __pbotsDev: { newSocket(): { requestId: string } } }).__pbotsDev.newSocket().requestId)
    await shell.page.waitForFunction((r: string) => {
      const sockets = (window as unknown as { __pbotsDev: { sockets: Array<{ requestId: string; readyStates: number[] }> } }).__pbotsDev.sockets
      return sockets.find((s) => s.requestId === r)?.readyStates.includes(3)
    }, rid, { timeout: 5_000 })
    const handle = await shell.page.evaluate((r: string) => {
      const sockets = (window as unknown as { __pbotsDev: { sockets: Array<{ requestId: string; error?: string; relays: Array<{ ok: boolean; ports: number }> }> } }).__pbotsDev.sockets
      return sockets.find((x) => x.requestId === r)
    }, rid)
    expect(handle.error).toContain('dsh connection not configured')
    expect(handle.relays).toEqual([{ ok: false, ports: 0 }]) // 失败不带端口
    const transfers = await shell.app.evaluate(() => (globalThis as unknown as { __pbotsM2: { stats: { transfers: number } } }).__pbotsM2.stats.transfers)
    expect(transfers).toBe(0)
  } finally { await shell.stop() }
})

test('① 10s 超时：socket 一直不就绪 → readyState=3 派发 error（真 10s 计时）', async () => {
  const handoff = mkdtempSync(join(tmpdir(), 'bot-U-12-badhandoff-'))
  writeFileSync(join(handoff, 'base-url'), 'http://127.0.0.1:9/')
  writeFileSync(join(handoff, 'launch-token'), 'nope')
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: handoff } })
  try {
    await waitDev(shell.page)
    const rid = await shell.page.evaluate(() => (window as unknown as { __pbotsDev: { newSocket(): { requestId: string } } }).__pbotsDev.newSocket().requestId)
    await shell.page.waitForFunction((r: string) => {
      const sockets = (window as unknown as { __pbotsDev: { sockets: Array<{ requestId: string; readyStates: number[] }> } }).__pbotsDev.sockets
      return sockets.find((s) => s.requestId === r)?.readyStates.includes(3)
    }, rid, { timeout: 15_000 })
    const handle = await shell.page.evaluate((r: string) => {
      const sockets = (window as unknown as { __pbotsDev: { sockets: Array<{ requestId: string; error?: string; relays: Array<{ ports: number }> }> } }).__pbotsDev.sockets
      return sockets.find((x) => x.requestId === r)
    }, rid)
    expect(handle.error).toContain('timed out')
    expect(handle.relays.filter((r2) => r2.ports > 0)).toEqual([]) // 任何时点都不带端口
    const timeouts = await shell.app.evaluate(() => (globalThis as unknown as { __pbotsM2: { stats: { timeouts: number } } }).__pbotsM2.stats.timeouts)
    expect(timeouts).toBeGreaterThanOrEqual(1)
  } finally { await shell.stop() }
})

test('④ ipc 来源校验：非主窗口的 pbots:mux-port 被拒，不转交', async () => {
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath() })
  const shell = await launchM2Shell(rt)
  try {
    await waitEventsReady(shell.page)
    const before = await shell.app.evaluate(() => (globalThis as unknown as { __pbotsM2: { stats: { transfers: number; rejectedSenders: number } } }).__pbotsM2.stats)
    const created = shell.app.waitForEvent('window', { timeout: 10_000 })
    await shell.app.evaluate(({ BrowserWindow }, preload: string) => {
      const w = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false } })
      void w.loadURL('pbots-app://app/')
    }, PRELOAD)
    const page2 = await created
    await page2.waitForFunction(() => typeof (window as unknown as { pbots?: unknown }).pbots !== 'undefined', undefined, { timeout: 10_000 })
    await page2.evaluate(() => {
      ;(window as unknown as { __pbotsMuxSeen?: string[] }).__pbotsMuxSeen = []
      window.addEventListener('message', (e) => {
        const data = e.data as { pbotsMux?: string } | null
        if (data != null && typeof data === 'object' && typeof data.pbotsMux === 'string') {
          ;(window as unknown as { __pbotsMuxSeen: string[] }).__pbotsMuxSeen.push(data.pbotsMux)
        }
      })
      ;(window as unknown as { pbots: { requestMuxPort(id: string): void } }).pbots.requestMuxPort('from-second-window')
    })
    await page2.waitForTimeout(800)
    const after = await shell.app.evaluate(() => (globalThis as unknown as { __pbotsM2: { stats: { transfers: number } } }).__pbotsM2.stats)
    expect(after.transfers).toBe(before.transfers) // +4：精确等值（拒绝不产生新转移；boot 会话已稳定）
    const seen = await page2.evaluate(() => (window as unknown as { __pbotsMuxSeen?: string[] }).__pbotsMuxSeen ?? [])
    expect(seen).toEqual([]) // 第二窗口收不到任何转交消息（index.ts assertSender 拒绝）
    await shell.app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows().slice(1)) w.destroy()
    })
  } finally {
    await shell.stop()
    await rt.stop()
  }
})

test('④⑤ ledger 记 ready clientId 与未决 eventId；D4① 重载后未决 waterfall 带新 clientId 重新下发，批准后执行', async () => {
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath() })
  const shell = await launchM2Shell(rt)
  try {
    await waitEventsReady(shell.page)
    const { sessionId, cwd } = await createApprovalSession(rt)
    const canary = join(cwd, 'canary-reload')
    rt.writeScriptCalls(sessionId, [bashCall(`touch ${canary}`), textCall('收尾')])
    await sendPrompt(rt.client, sessionId, 'turn-1')
    const { eventId } = await waitWaterfall(shell.page, sessionId)

    // ④ main 侧 ledger 已记录（经 tap 旁听）
    const pending = await shell.app.evaluate(
      (_electron: unknown, eid: string) => (globalThis as unknown as { __pbotsM2: { ledger: { pendingEvents(): Array<{ eventId: string }> } } })
        .__pbotsM2.ledger.pendingEvents().some((e) => e.eventId === eid),
      eventId,
    )
    expect(pending).toBe(true)

    // D4①：重载 renderer → 新 clientId、同 eventId 补发 → 批准后执行
    const oldClientId = await shell.page.evaluate(() => (window as unknown as { __pbotsDev: { events: { clientId?: string } } }).__pbotsDev.events.clientId)
    await shell.page.reload()
    const newClientId = await waitEventsReady(shell.page)
    expect(newClientId).not.toBe(oldClientId)
    const replayed = await waitWaterfall(shell.page, sessionId)
    expect(replayed.eventId).toBe(eventId)

    // 作答必须与 $events 流同 Peer（gateway 校验）：经 main 自己的连接发（= 未来 M1 的路径）
    await shell.app.evaluate(
      (_electron: unknown, a: { cid: string; eid: string }) => (globalThis as unknown as { __pbotsM2: { testAnswerEvent(cid: string, eid: string, v: 'allowed-once'): Promise<unknown> } }).__pbotsM2.testAnswerEvent(a.cid, a.eid, 'allowed-once'),
      { cid: newClientId, eid: eventId },
    )
    await expect.poll(() => existsSync(canary), { timeout: 30_000 }).toBe(true)
    // U-16 起 main 常驻 $events 订阅也是被 deliver 方：作答方（页面 clientId）在 settle 时先移除，
    // gateway 只向其余被 deliver 方推 {type:'cancel',eventId}——main 订阅收到即自动下账（真协议路径）。
    // 此前「条目仍在」的断言随之失效；M1 validateResult 下账路径（U-15 ③）不受影响。
    const pendingAfter = await shell.app.evaluate(
      (_electron: unknown, eid: string) => (globalThis as unknown as { __pbotsM2: { ledger: { pendingEvents(): Array<{ eventId: string }> } } })
        .__pbotsM2.ledger.pendingEvents().some((e) => e.eventId === eid),
      eventId,
    )
    expect(pendingAfter).toBe(false)
  } finally {
    await shell.stop()
    await rt.stop()
  }
})

test('⑤ D4② 断开 mux socket 再重连：未决 waterfall 带新 clientId 重新下发，批准后执行', async () => {
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath() })
  const shell = await launchM2Shell(rt)
  try {
    await waitEventsReady(shell.page)
    const { sessionId, cwd } = await createApprovalSession(rt)
    const canary = join(cwd, 'canary-drop')
    rt.writeScriptCalls(sessionId, [bashCall(`touch ${canary}`), textCall('收尾')])
    await sendPrompt(rt.client, sessionId, 'turn-1')
    const { eventId } = await waitWaterfall(shell.page, sessionId)
    const oldClientId = await shell.page.evaluate(() => (window as unknown as { __pbotsDev: { events: { clientId?: string } } }).__pbotsDev.events.clientId)

    // 断链注入：terminate main 的 mux socket → die → 关全部 port → DshConnection 重连
    await shell.app.evaluate(() => (globalThis as unknown as { __pbotsM2: { testDropSocket(): void } }).__pbotsM2.testDropSocket())

    // 页面 W 收 close → debug boot 300ms 后重开 → 新 clientId；重连期间不转交死 socket（单测已证）
    await shell.page.waitForFunction(
      (old: string) => {
        const c = (window as unknown as { __pbotsDev: { events: { clientId?: string } } }).__pbotsDev.events
        return c.clientId !== undefined && c.clientId !== old
      },
      oldClientId as string,
      { timeout: 30_000 },
    )
    const newClientId = await shell.page.evaluate(() => (window as unknown as { __pbotsDev: { events: { clientId?: string } } }).__pbotsDev.events.clientId)
    const replayed = await waitWaterfall(shell.page, sessionId)
    expect(replayed.eventId).toBe(eventId)

    // 作答必须与 $events 流同 Peer（gateway 校验）：经 main 自己的连接发（= 未来 M1 的路径）
    await shell.app.evaluate(
      (_electron: unknown, a: { cid: string; eid: string }) => (globalThis as unknown as { __pbotsM2: { testAnswerEvent(cid: string, eid: string, v: 'allowed-once'): Promise<unknown> } }).__pbotsM2.testAnswerEvent(a.cid, a.eid, 'allowed-once'),
      { cid: newClientId, eid: eventId },
    )
    await expect.poll(() => existsSync(canary), { timeout: 30_000 }).toBe(true)
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
