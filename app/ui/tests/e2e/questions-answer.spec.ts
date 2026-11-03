// P5-28 提问作答 e2e（PLAN p5-parity P5-28 ①③ + ② renderer 生产路径抽验）。
// ① fake 经 ask_user_question 发两批问题 → renderer 生产路径（window.pbots.api → M1 → dsh）
//    合法 answers 透传，工具结果含同批 id；第二批经扩展后的 testAnswerEvent（main peer 结构化作答注入，VERIFY-P5-07 跟进）。
// ② 漏答 id → pbots/invalid-args（不透传）。
// ③ 重连（reload）后同 eventId 再答 → 拒绝（不重复提交）。
// fake 脚本协议与 helpers 同 m2-deadline.spec.ts（来源 app/sdk/tests/support/fake/harness.ts）。
import { expect, test, type Page } from 'playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'

interface QuestionItem { id: string; question?: string; options?: Array<{ label?: string }> }

function sendPrompt(client: SdkRuntime['client'], sessionId: string, prompt: string): Promise<unknown> {
  const requestId = `p2sdk-p528-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
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

/** 等待含 marker 问题 id 的 user-questions/request waterfall（renderer 原帧 items，P5-33 卡片前的观测面）。 */
async function waitQuestionWaterfall(page: Page, sessionId: string, marker: string, timeout = 30_000): Promise<{ eventId: string; questions: QuestionItem[] }> {
  await page.waitForFunction(
    ({ sid, marker: m }) => {
      const items = (window as unknown as { __pbotsDev?: { events: { items: Array<{ type?: string; event?: string; agentId?: string; eventId?: string; request?: { questions?: Array<{ id?: string }> } }> } } }).__pbotsDev?.events.items
      return items?.some((it) => it.type === 'waterfall' && it.event === 'user-questions/request'
        && it.agentId === sid && it.request?.questions?.some((q) => q.id === m)) === true
    },
    { sid: sessionId, marker },
    { timeout },
  )
  const hit = await page.evaluate(({ sid, marker: m }) => {
    const items = (window as unknown as { __pbotsDev: { events: { items: Array<{ type?: string; event?: string; agentId?: string; eventId?: string; request?: { questions?: QuestionItem[] } }> } } }).__pbotsDev.events.items
    const found = items.find((it) => it.type === 'waterfall' && it.event === 'user-questions/request'
      && it.agentId === sid && it.request?.questions?.some((q) => q.id === m))
    return { eventId: found?.eventId, questions: found?.request?.questions ?? [] }
  }, { sid: sessionId, marker })
  expect(typeof hit.eventId).toBe('string')
  return { eventId: hit.eventId as string, questions: hit.questions }
}

/** renderer 生产路径作答（contextBridge → pbots:api → M1 校验 → dsh）。 */
function answerViaRenderer(page: Page, clientId: string, eventId: string, answers: unknown): Promise<{ ok: boolean; error?: { code: string; message: string } }> {
  return page.evaluate(({ cid, eid, ans }) =>
    (window as unknown as { pbots: { api(method: string, args?: unknown): Promise<{ ok: boolean; error?: { code: string; message: string } }> } })
      .pbots.api('$events/result', { clientId: cid, eventId: eid, outcome: { kind: 'result', value: { answers: ans } } }),
    { cid: clientId, eid: eventId, ans: answers })
}

function askCall(questions: Array<Record<string, unknown>>): object {
  const id = `p2sdk-p528-${Math.random().toString(16).slice(2, 8)}`
  const argumentsJson = JSON.stringify({ questions })
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id, name: 'ask_user_question', argumentsDelta: argumentsJson.slice(0, 5) },
      { type: 'tool-call-delta', index: 0, id, name: 'ask_user_question', argumentsDelta: argumentsJson.slice(5) },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'ask_user_question', arguments: argumentsJson } },
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

/** session/events 里是否存在含全部 marker 的非错误 tool/result（marker 取只出现在答案里的值，如 custom 文本）。 */
async function toolResultHas(rt: SdkRuntime, sessionId: string, markers: string[]): Promise<boolean> {
  const events = (await rt.client.call('session/events', {
    request: { address: { kind: 'session', sessionId }, maxMessages: 200 },
  })) as { records: Array<{ event?: { type?: string } }> }
  return events.records.some((r) => r.event?.type === 'tool/result'
    && markers.every((m) => JSON.stringify(r).includes(m))
    && !JSON.stringify(r).includes('"isError":true'))
}

test('P5-28 ①合法 answers 经生产路径透传（工具结果含同批 id）②漏答 id → invalid-args ③重连再答 → 拒绝', async () => {
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath() })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const clientId = await waitEventsReady(shell.page)
    const cwd = mkdtempSync(join(tmpdir(), 'bot-P5-28-ws-'))
    const { sessionId } = (await rt.client.call('session/create', { request: { cwd } })) as { sessionId: string }

    // 一个 prompt 驱动三段脚本：批1（q1/q2）→ 批2（q3）→ 收尾文本
    rt.writeScriptCalls(sessionId, [
      askCall([
        { id: 'q1', question: '路径?', header: '路径', options: [{ label: '/a', description: 'A 方案' }, { label: '/b' }] },
        { id: 'q2', question: '备注?' },
      ]),
      askCall([{ id: 'q3', question: '确认?' }]),
      textCall('收尾'),
    ])
    await sendPrompt(rt.client, sessionId, 'turn-1')

    // 第一批问题到达（renderer 原帧观测面）
    const first = await waitQuestionWaterfall(shell.page, sessionId, 'q1')
    expect(first.questions.map((q) => q.id).sort()).toEqual(['q1', 'q2'])

    // ② renderer 生产路径：漏答 q2 → pbots/invalid-args（参数错，不透传）
    const bad = await answerViaRenderer(shell.page, clientId, first.eventId, [{ id: 'q1', selected: ['/a'] }])
    expect(bad.ok).toBe(false)
    expect(bad.error?.code).toBe('pbots/invalid-args')

    // ① 合法作答：answers 原样经 M1 透传 → 工具结果含同批 id（note-42 只出现在答案里）
    const good = await answerViaRenderer(shell.page, clientId, first.eventId, [
      { id: 'q1', selected: ['/a'] },
      { id: 'q2', selected: [], custom: 'note-42' },
    ])
    expect(good.ok).toBe(true)
    await expect.poll(() => toolResultHas(rt, sessionId, ['q1', 'q2', 'note-42']), { timeout: 30_000 }).toBe(true)

    // 第二批（q3）经扩展后的 testAnswerEvent 注入（main peer 结构化作答；VERIFY-P5-07 跟进项）
    const second = await waitQuestionWaterfall(shell.page, sessionId, 'q3')
    await shell.app.evaluate(
      (_electron: unknown, a: { cid: string; eid: string }) => (globalThis as unknown as {
        __pbotsM2: { testAnswerEvent(cid: string, eid: string, v: { answers: Array<{ id: string; selected: string[]; custom?: string }> }): Promise<unknown> }
      }).__pbotsM2.testAnswerEvent(a.cid, a.eid, { answers: [{ id: 'q3', selected: [], custom: 'via-hook' }] }),
      { cid: clientId, eid: second.eventId },
    )
    await expect.poll(() => toolResultHas(rt, sessionId, ['q3', 'via-hook']), { timeout: 30_000 }).toBe(true)

    // ③ 重连（reload）后对已作答 eventId 再答 → 拒绝（ledger 已下账，不重复提交）
    await shell.page.reload()
    const reloadedClientId = await waitEventsReady(shell.page)
    expect(reloadedClientId).not.toBe(clientId)
    const again = await answerViaRenderer(shell.page, reloadedClientId, first.eventId, [
      { id: 'q1', selected: ['/a'] },
      { id: 'q2', selected: [], custom: 'note-42' },
    ])
    expect(again.ok).toBe(false)
    expect(again.error?.code).toBe('pbots/invalid-args')

    // 收尾：三段脚本走完，turn 正常结束（提问链路不卡死会话）
    await expect.poll(async () => {
      const events = (await rt.client.call('session/events', {
        request: { address: { kind: 'session', sessionId }, maxMessages: 200 },
      })) as { records: Array<{ event?: { type?: string } }> }
      return events.records.some((r) => r.event?.type === 'turn/end')
    }, { timeout: 30_000 }).toBe(true)
  } finally {
    await shell.stop()
    await rt.stop()
  }
}, 180_000)
