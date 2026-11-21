// T59：侧栏折叠钮（0.78.1 有、我们缺）。锚点全部来自 REA（receipts/T59.step0.md §4）：
// - 头部首钮：icon layout-sidebar-left、tooltip "Collapse sidebar"(mkMLq4)、
//   aria "Toggle compact sidebar"(+OFRL2 两态同串)、aria-expanded:!0、sm 方钮
// - rail 展开钮：tooltip "Expand sidebar"(tugdy6)、aria 同、aria-expanded:!1、circle
// - rail 宽 88（inline grid 首列 fD=88；我们 SIDEBAR_LAYOUT_BOUNDS.collapsedWidth 恰同值）
// - 快捷键 mod+B（linux/CI=Ctrl+B；别混 mod+alt+b=信息面板）；持久化 ui-layout slice。
import { expect, test } from 'playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchSdkRuntime } from '../support/sdk-runtime.ts'
import { fakeOverlayPath } from '../support/sdk-runtime.ts'
import { launchShell } from '../support/launch.ts'
import { tmkdir } from '../support/tmp-sweep.ts'
import { waitProductReady } from '../support/ui.ts'

const OUT = '/home/lingxufeng/bot/work/ui-polish-win/evidence/T59'
const EXPANDED = 280
const RAIL = 88

test('T59 侧栏折叠钮：头部钮/rail 展开/88 宽/持久化/mod+B', async () => {
  test.setTimeout(240_000)
  mkdirSync(OUT, { recursive: true })
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('bot-t59-ws-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const sidebar = page.locator('.sand-agents-sidebar')

    // ① 头部首钮存在且四属性与原版一致
    const collapseBtn = page.locator('.sand-agents-sidebar__collapse').first()
    await expect(collapseBtn).toBeVisible({ timeout: 10_000 })
    expect(await collapseBtn.getAttribute('aria-label')).toBe('Toggle compact sidebar')
    expect(await collapseBtn.getAttribute('title')).toBe('Collapse sidebar')
    expect(await collapseBtn.getAttribute('aria-expanded')).toBe('true')
    expect(await collapseBtn.locator('[data-icon-name]').getAttribute('data-icon-name')).toBe('layout-sidebar-left')
    expect(await collapseBtn.getAttribute('data-shape')).toBe('square')
    expect(await collapseBtn.evaluate((el) => getComputedStyle(el).borderRadius), '展开态方钮非圆(Sol MINOR)').toBe('6px')
    await expect(sidebar).not.toHaveAttribute('data-sidebar-collapsed', 'true')
    expect(Math.round(await sidebar.boundingBox().then((b) => b?.width ?? 0))).toBe(EXPANDED)

    // ② 点击 → 折叠：aside[data-sidebar-collapsed]、宽 88±1、行 data-collapsed
    await collapseBtn.click()
    await expect.poll(async () => Math.round(await sidebar.boundingBox().then((b) => b?.width ?? 0)), { timeout: 5_000 }).toBe(RAIL)
    await expect(sidebar).toHaveAttribute('data-sidebar-collapsed', 'true', { timeout: 5_000 })
    const firstRow = page.locator('.sand-agents-list [data-agent-id], .sand-agents-list .sand-agent-item').first()
    if (await firstRow.count() > 0) await expect(firstRow).toHaveAttribute('data-collapsed', 'true')

    // ③ rail 展开钮（rail-new 区）：tooltip 换串、aria 同、expanded 翻转、circle 外形
    const expandBtn = page.locator('.sand-agents-sidebar__collapse').first()
    expect(await expandBtn.getAttribute('title')).toBe('Expand sidebar')
    expect(await expandBtn.getAttribute('aria-label')).toBe('Toggle compact sidebar')
    expect(await expandBtn.getAttribute('aria-expanded')).toBe('false')
    expect(await expandBtn.getAttribute('data-shape')).toBe('circle')
    expect(await expandBtn.evaluate((el) => getComputedStyle(el).borderRadius), 'rail 态圆钮').toContain('9999')
    await page.screenshot({ path: join(OUT, 'sidebar-collapsed-light.png') })

    // ④ 点击展开 → 恢复 280、无 collapsed
    await expandBtn.click()
    await expect(sidebar).not.toHaveAttribute('data-sidebar-collapsed', 'true', { timeout: 5_000 })
    await expect.poll(async () => Math.round(await sidebar.boundingBox().then((b) => b?.width ?? 0)), { timeout: 5_000 }).toBe(EXPANDED)

    // ⑤ 快捷键 mod+B（CI linux=Ctrl；alt 不按——mod+alt+b 是信息面板）。
    // 0.18 keybind 系统（global-keyboard-shortcuts sand.toggleSidebar）统一处理。
    await page.keyboard.press('Control+b')
    await expect(sidebar).toHaveAttribute('data-sidebar-collapsed', 'true', { timeout: 5_000 })
    await page.keyboard.press('Control+b')
    await expect(sidebar).not.toHaveAttribute('data-sidebar-collapsed', 'true', { timeout: 5_000 })

    // ⑥ 持久化：折叠后 reload（同一 HOME）→ 仍折叠
    await page.keyboard.press('Control+b')
    await expect(sidebar).toHaveAttribute('data-sidebar-collapsed', 'true', { timeout: 5_000 })
    await page.reload()
    await waitProductReady(page)
    await expect(page.locator('.sand-agents-sidebar')).toHaveAttribute('data-sidebar-collapsed', 'true', { timeout: 10_000 })
    await expect.poll(async () => Math.round(await page.locator('.sand-agents-sidebar').boundingBox().then((b) => b?.width ?? 0)), { timeout: 5_000 }).toBe(RAIL)

    // ⑦ 四截图（亮暗 × 展开/折叠）
    await page.keyboard.press('Control+b') // 展开
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(OUT, 'sidebar-expanded-light.png') })
    await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, 'sidebar-expanded-dark.png') })
    await page.keyboard.press('Control+b'); await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, 'sidebar-collapsed-dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })
  } finally {
    await shell.stop(); await rt.stop()
  }
})
