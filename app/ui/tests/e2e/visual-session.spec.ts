// P5-12 B7 / B14 行为迁到 renderer-grok（U6）：
// ① thinking 行：流式期出现（live）→ 定稿后仍是一条 thinking 行；鼠标点 / 键盘 Enter·Space 开合（aria-expanded + 详情区）；
// ② 时间分隔（overrides/modules/markers.ts，0.78.1 vmt 语义）：首条上方恰 1 条、阈值（900000ms）内的后续消息不再出；几何 margin-bottom 22；
// ③ 未读线：切走后对方回复 → 切回恰 1 条、位于首条未读回复之前；停留期新到的回复不移动它、不长第二条；切走再进 → 0 条。
// 阈值 / 跨日 / 文案只在单测（tests/unit/grok-shim/markers.test.ts）测——runtime 真时钟造不出 15 分钟差。
// 旧版「未读线超一屏滚到线」0.18 无此行为，记 REPORT-P5-54 差异表 → P5-55。亮暗各截一张。
import { expect, test, type Page } from 'playwright/test'
import { join } from 'node:path'
import {
  MAIN_TITLE, createBots, evidenceOut, finalAssistant, launchProduct, openBot, reasoningTextCall, send, textCall, transcript,
} from '../support/ui.ts'

const OUT = evidenceOut('P5-12')
const thinkingRows = (page: Page) => page.locator('.sand-virtual-transcript .sand-outline-item[data-kind="thinking"]')
const separators = (page: Page) => page.locator('.sand-virtual-transcript .sand-transcript-time-separator')
const unreadLine = (page: Page) => page.locator('.sand-virtual-transcript .sand-unread-divider')

async function bothThemes(page: Page, name: string): Promise<void> {
  for (const mode of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: mode })
    await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
    await page.screenshot({ path: join(OUT, `${name}-${mode}.png`) })
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

test('B7 thinking 行（live → 定稿、鼠标 / 键盘开合）+ B14 时间分隔（首条 1 条、阈值内 0 条、几何 22）亮暗', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [x] = await createBots(page, [{ title: 'B7-X', preset: 'p2-alpha' }])
    await openBot(page, 'B7-X')
    const gate = `p554-b7-${Date.now()}`
    rt.writeScriptCalls(x!, [
      { ...(reasoningTextCall('先想一想这个问题的结构。', '答案是 42。', 150) as object), gateAfterChunk: 1, gateId: gate },
      textCall(['第二轮回复。']),
    ])
    await send(page, '想一想')

    // ① live：推理流式期就有 thinking 行（shim live-reasoning 条目）
    await expect(thinkingRows(page)).toHaveCount(1, { timeout: 20_000 })
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(join(rt.home, 'gates'), { recursive: true })
    writeFileSync(join(rt.home, 'gates', gate), '')
    await expect(finalAssistant(page).last()).toHaveText('答案是 42。', { timeout: 20_000 })
    await expect(thinkingRows(page)).toHaveCount(1) // 定稿：仍恰一条（live 条目被持久 thinking 取代，不重复）

    // 鼠标开合
    const row = thinkingRows(page).first().locator('button.sand-outline-item__row')
    await expect(row).toHaveAttribute('aria-expanded', 'false')
    await row.click()
    await expect(row).toHaveAttribute('aria-expanded', 'true')
    await expect(thinkingRows(page).first().locator('.sand-outline-item__detail')).toContainText('先想一想这个问题的结构。')
    await row.click()
    await expect(row).toHaveAttribute('aria-expanded', 'false')
    await expect(thinkingRows(page).first().locator('.sand-outline-item__detail')).toHaveCount(0)
    // 键盘开合（原生 button：Enter / Space）
    await row.focus()
    await page.keyboard.press('Enter')
    await expect(row).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Space')
    await expect(row).toHaveAttribute('aria-expanded', 'false')

    // ② 时间分隔：首条上方恰 1 条；阈值内第二轮不再出
    await expect(separators(page)).toHaveCount(1)
    await expect(separators(page).first()).toHaveText(/^Today \d{1,2}:\d{2} (AM|PM)$/)
    await send(page, '再来一轮')
    await expect(finalAssistant(page).last()).toHaveText('第二轮回复。', { timeout: 20_000 })
    await expect(separators(page)).toHaveCount(1)
    // 首条分隔在第一条消息之前（DOM 顺序）
    const order = await transcript(page).evaluate((el) => [...el.querySelectorAll('.sand-transcript-time-separator, .sand-transcript-row, .sand-outline-item')]
      .map((n) => n.classList.contains('sand-transcript-time-separator') ? 'sep' : 'row'))
    expect(order[0]).toBe('sep')
    expect(await separators(page).first().evaluate((el) => getComputedStyle(el).marginBottom)).toBe('8px') // P5-55：0.78.1 kit-timestamp margin 14 0 8（原 0.18 view.css 22）
    await bothThemes(page, 'b7-b14')
  } finally {
    await env.stop()
  }
})

test('B14 未读线：切走后对方回复 → 切回恰 1 条、在首条未读前、停留期不动；再进 0 条；亮暗', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [a] = await createBots(page, [{ title: 'UR-A', preset: 'p2-alpha' }])
    await openBot(page, 'UR-A')
    rt.writeScriptCalls(a!, [textCall(['第一轮回复。']), textCall(['切走后到达的回复。']), textCall(['停留期新到的回复。'])])
    await send(page, '第一轮')
    await expect(finalAssistant(page).last()).toHaveText('第一轮回复。', { timeout: 20_000 })
    await expect(unreadLine(page)).toHaveCount(0) // 首访无基线

    // 切走（记已读边界）→ 对方在后台回复（SDK 侧直发，不经 renderer）
    await openBot(page, MAIN_TITLE)
    await rt.client.call('session/prompt', { request: { requestId: `p554-ur-${Date.now()}`, sessionId: a, mode: 'queue', content: [{ type: 'text', text: '后台一问' }] } })
    await expect.poll(async () => JSON.stringify(await page.evaluate((sid) =>
      (window as unknown as { __pbotsDev: { state: { views: Record<string, { items: unknown[] }> } } }).__pbotsDev.state.views[sid]?.items ?? [], a)), { timeout: 20_000 })
      .toContain('切走后到达的回复。')

    // 切回：恰 1 条，紧贴在首条未读的 bot 回复之前（之间至多一条时间分隔）
    await openBot(page, 'UR-A')
    await expect(unreadLine(page)).toHaveCount(1, { timeout: 10_000 })
    const after = await unreadLine(page).evaluate((el) => {
      let n = el.nextElementSibling
      while (n !== null && n.classList.contains('sand-transcript-time-separator')) n = n.nextElementSibling
      return (n as HTMLElement | null)?.innerText ?? ''
    })
    expect(after).toContain('切走后到达的回复。')
    await expect(unreadLine(page)).toContainText('1 new message')
    await bothThemes(page, 'b14-unread')

    // 停留期：新到的回复不移动它、不长第二条
    await send(page, '停留期再问')
    await expect(finalAssistant(page).last()).toHaveText('停留期新到的回复。', { timeout: 20_000 })
    await expect(unreadLine(page)).toHaveCount(1)
    const stillBefore = await unreadLine(page).evaluate((el) => {
      let n = el.nextElementSibling
      while (n !== null && n.classList.contains('sand-transcript-time-separator')) n = n.nextElementSibling
      return (n as HTMLElement | null)?.innerText ?? ''
    })
    expect(stillBefore).toContain('切走后到达的回复。')

    // 切走再进：已读完 → 0 条
    await openBot(page, MAIN_TITLE)
    await openBot(page, 'UR-A')
    await expect(finalAssistant(page).last()).toHaveText('停留期新到的回复。')
    await expect(unreadLine(page)).toHaveCount(0)
  } finally {
    await env.stop()
  }
})

// P5-55（P5-12 final #12 迁新 renderer）：切回时未读线以下超一屏 → 线滚到视口顶下 28px（不再停在底部）
test('B14 未读线：线以下超一屏，切回滚到线（顶下 28±2px）', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [a] = await createBots(page, [{ title: 'UR-L', preset: 'p2-alpha' }])
    await openBot(page, 'UR-L')
    const long = Array.from({ length: 80 }, (_, i) => `Line ${i + 1} of the long background reply.`).join('\n\n')
    rt.writeScriptCalls(a!, [textCall(['第一轮回复。']), textCall([long])])
    await send(page, '第一轮')
    await expect(finalAssistant(page).last()).toHaveText('第一轮回复。', { timeout: 20_000 })
    await openBot(page, MAIN_TITLE)
    await rt.client.call('session/prompt', { request: { requestId: `p555-ur-${Date.now()}`, sessionId: a, mode: 'queue', content: [{ type: 'text', text: '后台长答' }] } })
    await expect.poll(async () => JSON.stringify(await page.evaluate((sid) =>
      (window as unknown as { __pbotsDev: { state: { views: Record<string, { items: unknown[] }> } } }).__pbotsDev.state.views[sid]?.items ?? [], a)), { timeout: 20_000 })
      .toContain('Line 80 of the long background reply.')
    await openBot(page, 'UR-L')
    await expect(unreadLine(page)).toHaveCount(1, { timeout: 10_000 })
    await expect.poll(() => unreadLine(page).evaluate((el) => {
      const sc = el.closest('.sand-virtual-transcript') as HTMLElement
      return Math.round(el.getBoundingClientRect().top - sc.getBoundingClientRect().top)
    }), { timeout: 5_000 }).toBeGreaterThanOrEqual(26)
    const offset = await unreadLine(page).evaluate((el) => {
      const sc = el.closest('.sand-virtual-transcript') as HTMLElement
      return Math.round(el.getBoundingClientRect().top - sc.getBoundingClientRect().top)
    })
    expect(offset).toBeLessThanOrEqual(30)
  } finally {
    await env.stop()
  }
})

