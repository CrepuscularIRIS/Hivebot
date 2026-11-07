// T21 ·「Full conversation」侧板接数据（work/tickets/doing/T21-outline-data.md 验收 2 ①-④）。
// fake 事件流 → fold → shim outline.ts → provider snapshot/事件 → 面板 DOM（.sand-outline-panel）。
// 面板一律走真实菜单打开（侧栏行右键 → Show full conversation）；② 证明 outline 推送是活的
// （面板开着 pending→done 原地变），不靠重开面板。前置：pnpm build（run-e2e 不重建 dist）。
import { expect, test, type Page } from 'playwright/test'
import {
  botItem, createBots, devState, launchProduct, openBot, openOutline, toolRows, permissionDock, send, textCall,
} from '../support/ui.ts'

const panelItems = (page: Page) => page.locator('.sand-outline-panel .sand-outline-item')
const kinds = (page: Page) => panelItems(page).evaluateAll((rows) => rows.map((r) => r.getAttribute('data-kind')))

/** 一次模型调用：可选 reasoning + 正文 + 一个 tool-call（finish tool-calls → 回合继续）。与 p6-fold 同构的最小版。 */
function stepCall(opts: { text?: string[]; reasoning?: string; tool: { name: string; input: object; id: string } }): object {
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
  const args = JSON.stringify(opts.tool.input)
  chunks.push({ type: 'block-start', index: i, blockType: 'tool-call' }, { type: 'tool-call-delta', index: i, id: opts.tool.id, name: opts.tool.name, argumentsDelta: args },
    { type: 'block-end', index: i, block: { type: 'tool-call', id: opts.tool.id, name: opts.tool.name, arguments: args } })
  chunks.push({ type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'tool-calls' } })
  return { chunks, paceMs: 60 }
}

/** bash 出审批卡（工具停在 running）→ Allow once → 等卡收起。 */
async function allowOnce(page: Page): Promise<void> {
  await expect(permissionDock(page)).toBeVisible({ timeout: 30_000 })
  await permissionDock(page).locator('button', { hasText: 'Allow once' }).click()
  await expect(permissionDock(page)).toHaveCount(0, { timeout: 20_000 })
}

const ended = (page: Page, sid: string) =>
  expect.poll(async () => (await devState(page)).views[sid]?.endReason, { timeout: 30_000 }).toBe('completed')

test('① 完成一轮：面板 items 顺序恰 user → thinking(R) → assistant-text(A) → tool-call(done, ls) → assistant-text(E)', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [sid] = await createBots(page, [{ title: 'OL-A' }]) as [string]
    rt.writeScriptCalls(sid, [
      stepCall({ reasoning: 'R 思考中', text: ['A 首答'], tool: { name: 'bash', input: { command: 'ls', description: 'T21 probe' }, id: 't21-t1' } }),
      textCall(['E 收尾']),
    ])
    await openBot(page, 'OL-A')
    await send(page, '看看环境')
    await allowOnce(page)
    await ended(page, sid)

    const panel = await openOutline(page, 'OL-A')
    await expect(panel).toHaveAttribute('aria-label', 'Full conversation: OL-A')
    await expect(panelItems(page)).toHaveCount(5, { timeout: 15_000 })
    expect(await kinds(page)).toEqual(['user', 'thinking', 'assistant-text', 'tool-call', 'assistant-text'])
    await expect(panelItems(page).nth(1)).toContainText('R 思考中')
    await expect(panelItems(page).nth(2)).toContainText('A 首答')
    await expect(panelItems(page).nth(3)).toHaveAttribute('data-status', 'done')
    await expect(panelItems(page).nth(3)).toContainText('ls')
    await expect(panelItems(page).nth(4)).toContainText('E 收尾')
  } finally {
    await env.stop()
  }
})

test('② 活推送：审批卡住时面板开着，tool 行 pending → 放行后同一行 done（不重开面板）', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [sid] = await createBots(page, [{ title: 'OL-B' }]) as [string]
    rt.writeScriptCalls(sid, [
      stepCall({ text: ['A 首答'], tool: { name: 'bash', input: { command: 'ls', description: 'T21 probe' }, id: 't21-t2' } }),
      textCall(['E 收尾']),
    ])
    await openBot(page, 'OL-B')
    await send(page, '看看环境')
    await expect(permissionDock(page)).toBeVisible({ timeout: 30_000 }) // 工具停在审批（fold running）

    await openOutline(page, 'OL-B') // 面板此刻才开——快照里就该是 pending
    await expect(toolRows(page)).toHaveCount(1)
    await expect(toolRows(page).first()).toHaveAttribute('data-status', 'pending')
    await allowOnce(page)
    await expect(toolRows(page).first()).toHaveAttribute('data-status', 'done', { timeout: 20_000 }) // outline 事件原地更新
    await ended(page, sid)
    await expect(panelItems(page)).toHaveCount(4) // 本格无 reasoning：user / A / tool / E（①已证含 R 的 5 条序列）
  } finally {
    await env.stop()
  }
})

test('③ 失败工具：read 目录（isError=true）→ 面板行 data-status="failed"（bash 非零退出 dsh 报正常 result，不作失败格）', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [sid] = await createBots(page, [{ title: 'OL-C' }]) as [string]
    // read 一个目录必然 error（isError=true）；不依赖 cwd（新建会话 cwd 未建）
    rt.writeScriptCalls(sid, [
      stepCall({ text: ['A 首答'], tool: { name: 'read', input: { file_path: '/tmp' }, id: 't21-t3' } }),
      textCall(['E 收尾']),
    ])
    await openBot(page, 'OL-C')
    await send(page, '看看环境')
    await ended(page, sid)
    await openOutline(page, 'OL-C')
    await expect(toolRows(page)).toHaveCount(1)
    await expect(toolRows(page).first()).toHaveAttribute('data-status', 'failed', { timeout: 15_000 })
  } finally {
    await env.stop()
  }
})

test('④ 按 bot 隔离：面板 aria-label 与条目只含被选 bot', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [a, b] = await createBots(page, [{ title: 'OL-D1' }, { title: 'OL-D2' }]) as [string, string]
    rt.writeScriptCalls(a, [textCall(['甲的答案'])])
    rt.writeScriptCalls(b, [textCall(['乙的答案'])])
    await openBot(page, 'OL-D1')
    await send(page, '甲好')
    await ended(page, a)
    await openBot(page, 'OL-D2')
    await send(page, '乙好')
    await ended(page, b)

    const panel = await openOutline(page, 'OL-D1')
    await expect(panel).toHaveAttribute('aria-label', 'Full conversation: OL-D1')
    await expect(panel).toContainText('甲的答案')
    await expect(panel).not.toContainText('乙的答案')
    expect(await botItem(page, 'OL-D2').count()).toBe(1) // 另一个 bot 确实在侧栏（不是没建）
  } finally {
    await env.stop()
  }
})

test('⑤ reload 后未先进聊天、直接开面板：follow 启动 → 快照到 → 面板活填充（review M1 回归格）', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [a] = await createBots(page, [{ title: 'OL-E1' }, { title: 'OL-E2' }]) as [string]
    rt.writeScriptCalls(a, [textCall(['甲的答案'])])
    await openBot(page, 'OL-E1')
    await send(page, '甲好')
    await expect.poll(async () => (await devState(page)).views[a]?.endReason, { timeout: 30_000 }).toBe('completed')
    // T21b：reload 前切到另一个 bot——E1 不再是活动 bot，reload 后不会被自动 follow（否则场景空转）
    await openBot(page, 'OL-E2')
    await page.reload()
    await expect(page.locator('.sand-agent-item').first()).toBeVisible({ timeout: 60_000 })
    // 前置断言：开面板前 E1 必须还没有 view（review M1 的 bug 前提）——场景失效时这里显式红
    expect((await devState(page)).views[a]).toBeUndefined()
    const panel = await openOutline(page, 'OL-E1')
    // 修复后：outline 请求启动 follow → 持久会话快照回来 → outline 事件活填充（不重开面板）
    await expect(panel).toContainText('甲的答案', { timeout: 30_000 })
    await expect(panel).toContainText('甲好')
    await expect(panel).not.toContainText('No conversation activity yet.')
  } finally {
    await env.stop()
  }
})
