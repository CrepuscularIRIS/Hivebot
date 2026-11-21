// T54：几何采集公共模块——两平台（Linux launchShell / Windows connectOverCDP）跑同一份屏序列。
// 每屏输出 <id>.<platform>.png + <id>.<platform>.json（选择器盒子 + computed 字体 + dpr/platform/innerW/H）。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright/test'

export const OUT = '/home/lingxufeng/bot/work/ui-polish-win/evidence/T54'

/** 每屏统一采集的全局选择器 + 屏专属选择器。 */
export const BASE_SELECTORS = [
  '.sand-agents-sidebar', '.sand-agents-sidebar__header', '.sand-agents-sidebar__plugins-entry',
  '.sand-prompt-shell', '.sand-titlebar, .sand-window-controls',
] as const

export interface Geo { [selector: string]: { rect?: { x: number; y: number; w: number; h: number }; font?: string; size?: string; lineH?: string; text?: string } }

export async function collect(page: Page, id: string, platform: string, selectors: readonly string[], extra: Record<string, unknown> = {}): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  await page.screenshot({ path: join(OUT, `${id}.${platform}.png`) })
  const geo = await page.evaluate((sels) => {
    const out: Geo = {}
    const fonts = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family}/${f.weight}`)
    for (const sel of sels) {
      const el = document.querySelector(sel)
      if (el === null) { out[sel] = {}; continue }
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      out[sel] = {
        rect: { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 },
        font: cs.fontFamily, size: cs.fontSize, lineH: cs.lineHeight,
        text: (el.textContent ?? '').trim().slice(0, 40),
      }
    }
    return {
      geo: out,
      meta: {
        platform: navigator.platform, uaPlatform: navigator.userAgent, dpr: window.devicePixelRatio,
        innerW: window.innerWidth, innerH: window.innerHeight, loadedFonts: fonts.slice(0, 12),
        scrollY: document.documentElement.scrollHeight,
      },
    }
  }, [...selectors])
  writeFileSync(join(OUT, `${id}.${platform}.json`), JSON.stringify({ id, platform, ...extra, ...geo }, null, 1))
}

/** 屏序列：导航到状态 → collect。返回跳过原因记录。 */
export async function runScreens(page: Page, platform: string): Promise<string[]> {
  const skipped: string[] = []
  const dark = async (id: string, sels: readonly string[], act: () => Promise<void>): Promise<void> => {
    await act()
    await collect(page, id, platform, sels)
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(300)
    await collect(page, `${id}-dark`, platform, sels)
    await page.emulateMedia({ colorScheme: 'light' })
    await page.waitForTimeout(200)
  }
  const market = page.locator('.sand-agents-sidebar__plugins')
  const dlg = page.locator('dialog[data-dialog="new-bot"]')

  // 1 主界面空态 ★
  await dark('01-main', [...BASE_SELECTORS, '.sand-agents-sidebar__new'], async () => {})

  // 2 侧栏折叠 rail（折叠钮找不到则记跳过）
  const collapse = page.locator('button[aria-label*="collapse" i], button[aria-label*="sidebar" i]').first()
  if (await collapse.count() > 0 && await collapse.isVisible().catch(() => false)) {
    await collapse.click(); await page.waitForTimeout(400)
    await collect(page, '02-rail', platform, ['.sand-agents-sidebar', '.sand-prompt-shell'])
    await collapse.click(); await page.waitForTimeout(400)
  } else skipped.push('02-rail: 折叠钮选择器未命中（两平台都未采，差异对照缺此屏）')

  // 4 标题栏区域放大条（clip 顶部）
  await page.screenshot({ path: join(OUT, `04-titlebar.${platform}.png`), clip: { x: 0, y: 0, width: Math.min(1280, page.viewportSize()?.width ?? 1280), height: 48 } })
  await collect(page, '04-titlebar', platform, ['.sand-titlebar, .sand-window-controls', '.sand-agents-sidebar__header'])

  // 5 市场浮层（空态）★
  await market.click()
  await page.locator('[data-market]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForTimeout(600)
  await dark('05-market', ['[data-market]', '#sand-plugins-modal-heading', '.sand-agents-sidebar__plugins-entry'], async () => {})
  await page.locator('[data-market] button[aria-label="Close"]').click()
  await page.waitForTimeout(400)

  // 6 Settings → General ★
  await page.click('button[aria-label="Account"]')
  await page.locator('[role="menuitem"]', { hasText: 'Settings' }).click()
  await page.locator('.sand-settings-dialog').waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForTimeout(400)
  await dark('06-settings', ['.sand-settings-dialog', '.sand-settings-nav', '.sand-settings-panel__body'], async () => {})
  await page.locator('.sand-settings-panel__close').click()
  await page.waitForTimeout(400)

  // 7 新建 bot 对话框（展开 More options）
  await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
  await dlg.waitFor({ state: 'visible', timeout: 10_000 })
  await dlg.locator('details.pb-more summary').click()
  await page.waitForTimeout(400)
  await collect(page, '07-newbot', platform, ['dialog[data-dialog="new-bot"]', 'details.pb-more', '[data-connectors]'])
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // 10 缩窗 900×600 主界面（溢出/折行观察）——CDP 下 viewportSize 可能 null，用 innerW 记录
  await setWindow(page, 900, 600)
  await page.waitForTimeout(600)
  await collect(page, '10-900x600', platform, ['.sand-agents-sidebar', '.sand-prompt-shell', '.sand-agents-sidebar__plugins-entry'])
  await setWindow(page, 1280, 800)
  await page.waitForTimeout(400)
  return skipped
}

/** 视口对齐（T54）：Browser.setWindowBounds 在 connectOverCDP 下不可用（Browser 域缺方法），
 * 用 setViewportSize（Emulation.setDeviceMetricsOverride）改布局视口——取证看溢出/折行等价，meta 里 innerW/H 如实记录。 */
export async function setWindow(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height })
}
