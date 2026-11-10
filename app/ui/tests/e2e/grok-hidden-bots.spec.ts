// T41b 验收 5 + T41c 视觉断言：右键 Hide → 行消失+徽标 → 对话框（名字可见/原版内边距）→ Unhide → 行回来 → reload 持久。
import { expect, test } from 'playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { launchShell, sandboxHome } from '../support/launch.ts'
import { PRESETS_PATCH, waitProductReady } from '../support/ui.ts'

const EVIDENCE = '/home/lingxufeng/bot/work/exp-polish/evidence/T41'

test('T41 隐藏 bot 完整链：Hide → 徽标 → 对话框 Unhide → 行回来；reload 后隐藏持久', async () => {
  test.setTimeout(240_000)
  mkdirSync(EVIDENCE, { recursive: true })
  for (const scheme of ['light', 'dark'] as const) await runOnce(scheme)
})

async function runOnce(scheme: 'light' | 'dark'): Promise<void> {
  const home = sandboxHome('T41h')
  const dataDir = `${home}/data`
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, dataDir })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, home })
  const page = shell.page
  if (scheme === 'dark') await page.emulateMedia({ colorScheme: 'dark' })
  try {
    await waitProductReady(page)
    // 第二个 bot（要藏的对象）：API 建 + rename → reloadRoster
    const { sessionId: B } = await rt.client.call('session/create', { request: {} }) as { sessionId: string }
    await rt.client.call('session/rename', { request: { sessionId: B, title: 'Hide me bot' } })
    await page.evaluate(() => (window as unknown as { __pbotsDev?: { reloadRoster?(): Promise<void> } }).__pbotsDev?.reloadRoster())
    const row = page.locator('.sand-agent-item', { hasText: 'Hide me bot' })
    await expect(row).toBeVisible({ timeout: 30_000 })

    // 右键 → Hide from sidebar → 行消失、侧栏底出现「1 hidden bots」徽标
    await row.click({ button: 'right' })
    await page.locator('[aria-label="Agent actions"] [role=menuitem]', { hasText: 'Hide from sidebar' }).click()
    await expect(row, '隐藏后行消失').toHaveCount(0, { timeout: 15_000 })
    const badge = page.locator('[aria-label="1 hidden bots"]')
    await expect(badge, 'Hidden Bots 徽标出现').toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: join(EVIDENCE, `hidden.${scheme}.png`) })

    // reload → 隐藏仍在（localStorage 持久）——先证 roster 活着（主行在），count 0 才算「被藏」而非「没渲染」
    await page.reload()
    await waitProductReady(page)
    await expect(page.locator('.sand-agent-item').first(), 'roster 活着').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.sand-agent-item', { hasText: 'Hide me bot' }), 'reload 后仍隐藏').toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator('[aria-label="1 hidden bots"]')).toBeVisible({ timeout: 15_000 })

    // T41c/T41d ③：徽标按钮整块可点——须在对话框打开前测（modal 遮罩会挡）
    const hitSelf = await page.locator('[aria-label="1 hidden bots"]').evaluate((el) => {
      const r = el.getBoundingClientRect()
      const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return e != null && (e === el || el.contains(e))
    })
    expect(hitSelf, '徽标中心不被遮挡').toBe(true)
    // T41d ③a：整颗按钮可见——「Hidden Bots」文字在侧栏内 visible
    const btn = page.getByRole('button', { name: /Hidden Bots/ })
    await expect(btn.getByText('Hidden Bots')).toBeVisible()
    // T41d ③b：boundingBox 完整在视口内且在侧栏列内
    const box = await btn.boundingBox()
    const sidebarBox = await page.locator('.sand-agents-sidebar').boundingBox()
    expect(box, '按钮有盒').not.toBeNull()
    expect(box!.y, '按钮顶在视口内').toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height, '按钮底不超视口').toBeLessThanOrEqual(820)
    expect(box!.x, '按钮在侧栏列内（左）').toBeGreaterThanOrEqual(sidebarBox!.x - 1)
    expect(box!.x + box!.width, '按钮在侧栏列内（右）').toBeLessThanOrEqual(sidebarBox!.x + sidebarBox!.width + 1)
    // T41d ③c：四角内缩 2px + 中心共 5 点 elementFromPoint 全命中按钮自身/子孙
    const five = await btn.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const pts = [[r.x + 2, r.y + 2], [r.x + r.width - 2, r.y + 2], [r.x + 2, r.y + r.height - 2], [r.x + r.width - 2, r.y + r.height - 2], [r.x + r.width / 2, r.y + r.height / 2]]
      return pts.map(([x, y]) => { const e = document.elementFromPoint(x, y); return e != null && (e === el || el.contains(e)) })
    })
    expect(five.every(Boolean), '五点全命中（四角+中心）').toBe(true)

    // 点开 Hidden Bots 对话框 → Unhide → 行回来
    await page.locator('[aria-label="1 hidden bots"]').click()
    const dialog = page.locator('[role=dialog]')
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    // T41c ①：对话框里 bot 名字可见（藏多个时认得出哪个是哪个）
    await expect(dialog.getByText('Hide me bot')).toBeVisible()
    // T41c ②：样式来自原版值（padding 非零——0.18 tokens 的 spacing 档，回执对照）
    const pad = await dialog.evaluate((el) => getComputedStyle(el).paddingTop)
    expect(Number.parseFloat(pad), 'dialog 有内边距（非贴边）').toBeGreaterThanOrEqual(12)
    // T41d ④：只有一条时列表不滚动
    const list = dialog.locator('.sand-hidden-chats__list')
    const scroll = await list.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }))
    expect(scroll.sh, '一条时 scrollHeight ≤ clientHeight（不出滚动）').toBeLessThanOrEqual(scroll.ch)
    await page.screenshot({ path: join(EVIDENCE, `dialog.${scheme}.png`) })
    await dialog.locator('button', { hasText: 'Unhide' }).first().click()
    await expect(page.locator('.sand-agent-item', { hasText: 'Hide me bot' }), 'Unhide 后行回来').toBeVisible({ timeout: 15_000 })
  } finally {
    await shell.stop()
    await rt.stop()
  }
}
