// P6-03 · 三段式位置折叠 DOM 验收（p6-orchestration BRIEF §2.2 / §6 D1·D2；PLAN P6-03）：
// fake 事件流 → reduce → foldTurns（P6-01）→ shim entries.ts → 0.18 transcript DOM。
// D1 主链 A→t1→B→t2→C→t3→E：进行中气泡 ≤1 + tool running；结束后恰 2 气泡（A、E）、B/C 为收起的 thinking 行、
// 展开见全文、E 不重复；reload 重放同断言（折叠是渲染期规则，持久会话格式 1a 前后一字未变 → 旧会话等价）。
// 无工具问答恰 1 气泡；D2 兜底格 (b)(c)(d)(e)(f) 的 DOM 对应（(a) 即 D1 尾段；(e) 另两枚举与 (g) 页首片段在
// tests/unit/fold——fake 造不出 interrupted/cancelled，(g) 要窗口外历史分页）。
// 前置：pnpm build（LEARNINGS 2026-11-03：run-e2e 不重建 dist）。
import { expect, test, type Page } from 'playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  api, assistantRows, createBots, devState, evidenceOut, launchProduct, MAIN_TITLE, openBot, openOutline, permissionDock, send, textCall, toolRows, transcript,
} from '../support/ui.ts'

const OUT = evidenceOut('P6-03')
const thinkingRows = (page: Page) => transcript(page).locator('.sand-outline-item[data-kind="thinking"]')
const notices = (page: Page) => transcript(page).locator('.sand-transcript-row[role="note"]')
const bubbleTexts = (page: Page) => assistantRows(page).locator('.sand-message-prose').allInnerTexts()

/** 一次模型调用：可选 reasoning + 正文（可 gate）+ 一个 tool-call（finish tool-calls → 回合继续）。 */
function stepCall(opts: { text?: string[]; reasoning?: string; tool?: { name: string; input: object; id: string }; gateId?: string; finish?: object }): object {
  const chunks: object[] = []
  let i = 0
  if (opts.reasoning !== undefined) {
    chunks.push({ type: 'block-start', index: i, blockType: 'reasoning' }, { type: 'reasoning-delta', index: i, text: opts.reasoning },
      { type: 'block-end', index: i, block: { type: 'reasoning', text: opts.reasoning } })
    i += 1
  }
  if (opts.text !== undefined) {
    chunks.push({ type: 'block-start', index: i, blockType: 'text' }, ...opts.text.map((text) => ({ type: 'text-delta', index: i, text })),
      { type: 'block-end', index: i, block: { type: 'text', text: opts.text.join('') } })
    i += 1
  }
  if (opts.tool !== undefined) {
    const args = JSON.stringify(opts.tool.input)
    chunks.push({ type: 'block-start', index: i, blockType: 'tool-call' }, { type: 'tool-call-delta', index: i, id: opts.tool.id, name: opts.tool.name, argumentsDelta: args },
      { type: 'block-end', index: i, block: { type: 'tool-call', id: opts.tool.id, name: opts.tool.name, arguments: args } })
  }
  chunks.push({ type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, opts.finish ?? { type: 'finish', reason: { kind: opts.tool === undefined ? 'stop' : 'tool-calls' } })
  return { chunks, paceMs: 60, ...(opts.gateId !== undefined ? { gateAfterChunk: 1, gateId: opts.gateId } : {}) }
}

/** 本配置下 bash 出审批卡（工具停在 running）：点 Allow once，等卡收起。
 * L-7 R6（2026-11-04）起工作区内 read 不再出卡（policy-state 写端未交付 = 未 provision
 * = 文件工具不门控）——read 步骤直接执行，不再需要本 helper；仅 bash 步骤仍走它。 */
async function allowOnce(page: Page): Promise<void> {
  await expect(permissionDock(page)).toBeVisible({ timeout: 30_000 })
  await permissionDock(page).locator('button', { hasText: 'Allow once' }).click()
  await expect(permissionDock(page)).toHaveCount(0, { timeout: 20_000 })
}

/** 会话工作区（host 路径，devState 可读）里放好被读文件 → read 放行后结果 done。 */
async function workspace(page: Page, sid: string): Promise<(id: string) => { name: string; input: object; id: string }> {
  await expect.poll(async () => (await devState(page)).views[sid]?.cwd ?? null, { timeout: 20_000 }).not.toBeNull()
  const cwd = (await devState(page)).views[sid]!.cwd!
  return (id) => {
    writeFileSync(join(cwd, `${id}.txt`), `${id} content\n`)
    return { name: 'read', input: { file_path: join(cwd, `${id}.txt`) }, id }
  }
}

const openGate = (home: string, id: string): void => {
  mkdirSync(join(home, 'gates'), { recursive: true })
  writeFileSync(join(home, 'gates', id), '')
}

async function bothThemes(page: Page, name: string): Promise<void> {
  for (const mode of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: mode })
    await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
    await page.screenshot({ path: join(OUT, `${name}-${mode}.png`) })
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

const A = 'A：收到，我先看看环境再动手。'
const B = 'B：第一步结果正常，接着读配置。\nB 第二行：配置里有三个键。'
const C = 'C：配置读完，最后核对一次。'
const E = 'E：全部完成，共检查 3 处，没有问题。'

/** D1 回合结束态（首次与 reload 重放共用）——T22：主 transcript 只剩 user/A/E；
 * 过程（B、C、三个工具）在 outline 面板（assertD1Outline），主聊天对过程零渲染。 */
async function assertD1Ended(page: Page): Promise<void> {
  await expect(assistantRows(page)).toHaveCount(2, { timeout: 30_000 })
  expect(await bubbleTexts(page)).toEqual([A, E])
  // T22 否定式（0.79.3 COORD Qz / APP LF）：主 transcript 无 thinking 行 / 工具行 / B、C 正文
  await expect(thinkingRows(page)).toHaveCount(0)
  await expect(transcript(page).locator('.sand-outline-item[data-kind="tool-call"]')).toHaveCount(0)
  const body = await transcript(page).innerText()
  expect(body).not.toContain('B：第一步结果正常')
  expect(body).not.toContain('C：配置读完')
  // E 只出现一次
  expect(body.split('E：全部完成').length - 1).toBe(1)
}

/** D1 的 outline 面板断言（面板开着时调用；reload 后需重开面板）。 */
async function assertD1Outline(page: Page): Promise<void> {
  await expect(toolRows(page)).toHaveCount(3, { timeout: 30_000 })
  await expect(toolRows(page).last()).toHaveAttribute('data-status', 'done')
  // A、B、C、E 都是 outline 的 assistant-text 行（T21 实证：view.items 的 assistant 不分首中尾）
  const rows = page.locator('.sand-outline-panel .sand-outline-item[data-kind="assistant-text"]')
  await expect(rows).toHaveCount(4)
}

/** 展开 outline 里的 B、C 两行（中间轮正文在面板可见全文；review M2：C 的收起/展开/全文 oracle 不得丢）。 */
async function expandAll(page: Page): Promise<void> {
  const rowOf = (text: string) => page.locator('.sand-outline-panel .sand-outline-item[data-kind="assistant-text"]', { hasText: text }).first()
  for (const [head, full] of [['B：第一步结果正常', 'B 第二行：配置里有三个键'], ['C：配置读完，最后核对一次。', 'C：配置读完，最后核对一次。']] as const) {
    const row = rowOf(head)
    await expect(row.locator('button.sand-outline-item__row')).toHaveAttribute('aria-expanded', 'false')
    await row.locator('button.sand-outline-item__row').click()
    await expect(row.locator('.sand-outline-item__detail')).toContainText(full)
  }
}


test('D1 主链：进行中气泡 ≤1 + tool running；结束恰 2 气泡、B/C 收起、展开见全文、E 不重复；reload 重放；亮暗', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const sid = (await devState(page)).meta.mainBotId!
    expect(sid).toBeTruthy()
    const readTool = await workspace(page, sid)
    const gate = `p603-d1-${Date.now()}`
    rt.writeScriptCalls(sid, [
      stepCall({ text: [A], tool: { name: 'bash', input: { command: 'echo p603', description: 'P6-03 probe' }, id: 'p603-t1' } }),
      stepCall({ text: ['B：第一步结果正常，', '接着读配置。\nB 第二行：配置里有三个键。'], tool: readTool('p603-t2'), gateId: gate }),
      stepCall({ text: [C], tool: readTool('p603-t3') }),
      textCall([E]),
    ])
    await send(page, '检查一下环境配置')

    // 进行中 ①：t1 等审批 → 主 transcript 工具行 =0（T22）；工具态在 outline（pending）
    await expect(permissionDock(page)).toBeVisible({ timeout: 30_000 })
    await expect(transcript(page).locator('.sand-outline-item[data-kind="tool-call"]')).toHaveCount(0)
    await expect(assistantRows(page)).toHaveCount(1)
    await openOutline(page, MAIN_TITLE) // 面板开一次，之后全靠 outline 事件实时更新（T21 ②）
    await expect(toolRows(page)).toHaveCount(1)
    await expect(toolRows(page).first()).toHaveAttribute('data-status', 'pending')
    await bothThemes(page, 'd1-running-tool')
    await allowOnce(page) // t1

    // 进行中 ②：B 流式到一半（gate）→ 主 transcript 无 live 行、气泡仍 ≤1（T22：中间轮流不显示）；
    // 过程在 outline 可见（live-stream 尾条，T21 outline.ts 流式映射）
    await expect(page.locator('.sand-outline-panel .sand-outline-item', { hasText: 'B：第一步结果正常，' }).first()).toBeVisible({ timeout: 30_000 })
    expect(await assistantRows(page).count()).toBeLessThanOrEqual(1)
    await expect(transcript(page).locator('.sand-transcript-row[data-entry-id="live-stream"]')).toHaveCount(0)
    await bothThemes(page, 'd1-running-stream')
    openGate(rt.home, gate)
    // L-7 R6：t2/t3 是工作区内 read——不再出卡，直接执行完毕
    await expect.poll(async () => (await devState(page)).views[sid]?.endReason, { timeout: 30_000 }).toBe('completed')
    await assertD1Ended(page)
    await assertD1Outline(page)
    await bothThemes(page, 'd1-ended-collapsed')
    await expandAll(page)
    await bothThemes(page, 'd1-ended-expanded')

    // 重放：reload 后从持久会话重建（与 1a 之前建的会话同一路径）
    await page.reload()
    await expect(page.locator('.sand-agent-item').first()).toBeVisible({ timeout: 60_000 })
    await assertD1Ended(page)
    // reload 后 main bot 行标题随会话预览变化——取实际 aria-label 再开面板
    const rowLabel = await page.locator('.sand-agent-item').first().getAttribute('aria-label') ?? MAIN_TITLE
    await openOutline(page, rowLabel)
    await assertD1Outline(page)
    await expandAll(page)
  } finally {
    await env.stop()
  }
})

test('无工具问答恰 1 气泡；D2 (b)(c)(d)(e)(f) 的 DOM 对应；亮暗', async () => {
  test.setTimeout(240_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const ids = await createBots(page, ['F-Q', 'F-B', 'F-C', 'F-D', 'F-E', 'F-F'].map((title) => ({ title, preset: 'p2-alpha' })))
    const [q, b, c, d, e, f] = ids as [string, string, string, string, string, string]
    const ended = (sid: string, reason: string) =>
      expect.poll(async () => (await devState(page)).views[sid]?.endReason, { timeout: 30_000 }).toBe(reason)
    let readTool: Awaited<ReturnType<typeof workspace>>

    // 无工具：恰 1 气泡、0 thinking、0 tool
    rt.writeScriptCalls(q, [textCall(['简单问题的完整回答。'])])
    await openBot(page, 'F-Q')
    await send(page, '一加一等于几')
    await ended(q, 'completed')
    await expect(assistantRows(page)).toHaveCount(1)
    expect(await bubbleTexts(page)).toEqual(['简单问题的完整回答。'])
    await expect(thinkingRows(page)).toHaveCount(0)
    await expect(transcript(page).locator('.sand-outline-item[data-kind="tool-call"]')).toHaveCount(0)

    // (b) ack→工具→尾段→turn/end error：恰 1 条 danger notice（reduce 产出），尾段不升气泡
    await openBot(page, 'F-B')
    readTool = await workspace(page, b)
    rt.writeScriptCalls(b, [
      stepCall({ text: ['收到，先读文件。'], tool: readTool('p603-b1') }),
      // P5-41.f1 ③：dsh FinishReason 契约 error = { kind, failure: LlmFailure{code,message} }（dsh-llm types.d.ts FinishReasonMap）。
      // 旧脚本写成 { kind, message } 缺 failure → dsh-llm-retry / agent-loop 读 failure.code 抛 TypeError，
      // 用户看到「Cannot read properties of undefined (reading 'code')」而不是注入文本——丢失层 = fake 脚本违约，不是 fold / shim / 0.18
      stepCall({ text: ['尾段写了一半'], finish: { type: 'finish', reason: { kind: 'error', failure: { code: 'PROVIDER_ERROR', message: 'P6-03 boom' } } } }),
    ])
    await send(page, '出错格')
    // L-7 R6：read 不再出卡，直接执行
    await expect.poll(async () => (await devState(page)).views[b]?.turnEnded, { timeout: 30_000 }).toBe(true)
    await expect(notices(page)).toHaveCount(1)
    await expect(notices(page).first()).toContainText('回复失败：P6-03 boom') // 注入文本直达用户
    await expect(notices(page).first()).not.toContainText('Cannot read') // 不露 JS 异常
    expect(await bubbleTexts(page)).toEqual(['收到，先读文件。'])
    await bothThemes(page, 'd2-b-error')

    // (c) ack→工具→B→工具→completed 无尾文本：B 升气泡且不在 thinking 行
    await openBot(page, 'F-C')
    readTool = await workspace(page, c)
    rt.writeScriptCalls(c, [
      stepCall({ text: ['收到。'], tool: readTool('p603-c1') }),
      stepCall({ text: ['中间结论 B：两个文件都在。'], tool: readTool('p603-c2') }),
      { chunks: [{ type: 'usage', usage: { inputTokens: 10, outputTokens: 0 } }, { type: 'finish', reason: { kind: 'stop' } }], paceMs: 10 },
    ])
    await send(page, '兜底 c')
    await ended(c, 'completed')
    expect(await bubbleTexts(page)).toEqual(['收到。', '中间结论 B：两个文件都在。'])
    await expect(thinkingRows(page)).toHaveCount(0)
    await expect(transcript(page).locator('.sand-outline-item[data-kind="tool-call"]')).toHaveCount(0) // T22：主 transcript 无工具行
    await openOutline(page, 'F-C')
    await expect(toolRows(page)).toHaveCount(2) // 工具态迁 outline（T21 面板）
    await bothThemes(page, 'd2-c-promote')

    // (d) 全程无正文 completed：1 条「没有文字结果」notice，0 气泡
    await openBot(page, 'F-D')
    readTool = await workspace(page, d)
    rt.writeScriptCalls(d, [
      stepCall({ tool: readTool('p603-d1') }),
      { chunks: [{ type: 'usage', usage: { inputTokens: 10, outputTokens: 0 } }, { type: 'finish', reason: { kind: 'stop' } }], paceMs: 10 },
    ])
    await send(page, '兜底 d')
    await ended(d, 'completed')
    await expect(notices(page)).toHaveCount(1)
    await expect(notices(page).first()).toContainText('已完成，没有文字结果 · 展开查看过程')
    await expect(assistantRows(page)).toHaveCount(0)
    await bothThemes(page, 'd2-d-empty')

    // (e) aborted：ack→工具→尾段流式中 cancel → 恰 1 条「已停止」，尾段不升气泡
    const gate = `p603-e-${Date.now()}`
    await openBot(page, 'F-E')
    readTool = await workspace(page, e)
    rt.writeScriptCalls(e, [
      stepCall({ text: ['收到，开始。'], tool: readTool('p603-e1') }),
      textCall(['尾段写到一半', '被打断'], { gateId: gate }),
    ])
    await send(page, '兜底 e')
    // T22：尾段流式不再落主 transcript 的 live thinking 行——过程在 outline（live-stream 尾条）
    await openOutline(page, 'F-E')
    await expect(page.locator('.sand-outline-panel .sand-outline-item', { hasText: '尾段写到一半' }).first()).toBeVisible({ timeout: 30_000 })
    await expect(thinkingRows(page)).toHaveCount(0)
    expect((await api(page, 'session/cancel', { request: { sessionId: e } })).ok).toBe(true)
    await ended(e, 'aborted')
    await expect(notices(page)).toHaveCount(1)
    await expect(notices(page).first()).toContainText('已停止')
    expect(await bubbleTexts(page)).toEqual(['收到，开始。'])

    // (f) reasoning→工具→completed 无正文：reasoning 仍是 thinking 行、不升气泡，走 (d)
    await openBot(page, 'F-F')
    readTool = await workspace(page, f)
    rt.writeScriptCalls(f, [
      stepCall({ reasoning: '只是推理，不是正文。', tool: readTool('p603-f1') }),
      { chunks: [{ type: 'usage', usage: { inputTokens: 10, outputTokens: 0 } }, { type: 'finish', reason: { kind: 'stop' } }], paceMs: 10 },
    ])
    await send(page, '兜底 f')
    await ended(f, 'completed')
    // T22：reasoning 不进主 transcript——thinking 行只在 outline
    await expect(thinkingRows(page)).toHaveCount(0)
    await openOutline(page, 'F-F')
    await expect(page.locator('.sand-outline-panel .sand-outline-item[data-kind="thinking"]')).toHaveCount(1)
    await expect(page.locator('.sand-outline-panel .sand-outline-item[data-kind="thinking"]')).toContainText('只是推理，不是正文。')
    await expect(assistantRows(page)).toHaveCount(0)
    await expect(notices(page)).toHaveCount(1)
    await expect(notices(page).first()).toContainText('已完成，没有文字结果 · 展开查看过程')
  } finally {
    await env.stop()
  }
})
