// P5-57 ④ 启动封面（定稿 work/p5-parity/ui/P5-57-final.md ④）：shim 在 bundle 之前挂品牌封面，roster 就绪即淡出移除；
// 引擎连不上：8s 后「Still connecting…」，shim 放弃重试（≈60s）后「Couldn't connect to the engine.」+ Reload。
import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { botItem, evidenceOut, launchProduct, MAIN_TITLE } from '../support/ui.ts'

const EVIDENCE = evidenceOut('P5-57')
const cover = '#pbots-boot'

test('就绪：封面收起、不挡点击；原版 app 图标资产可加载；无目录源 → 市场空态', async () => {
  const env = await launchProduct()
  try {
    const { page } = env
    await expect(page.locator(cover)).toHaveCount(0, { timeout: 5_000 })
    await botItem(page, MAIN_TITLE).click() // 封面若残留会拦截命中（actionability 超时）
    const ok = await page.evaluate(async () => { const r = await fetch('./assets/app-icon-C7NKj2u7.png'); return r.ok && (r.headers.get('content-type') ?? '').startsWith('image/') })
    expect(ok).toBe(true)
    // 顺带：默认 profile 没挂 market 插件（listIndexes 404）→ 市场是「未配目录源」空态，不是报错
    await page.locator('.sand-agents-sidebar__plugins').click()
    await expect(page.locator('[data-market-empty]')).toContainText('No catalog configured')
    await expect(page.locator('[data-market] [role=alert]')).toHaveCount(0)
  } finally {
    await env.stop()
  }
})

test('引擎不可达：Starting → Still connecting → Couldn\'t connect + Reload；亮暗截图', async () => {
  test.setTimeout(150_000)
  // 不给 PBOTS_DSH_HANDOFF：main 连不上 SDK，M1 一律 unavailable，shim roster 重试到放弃
  const shell = await launchShell()
  try {
    const page = shell.page
    await expect(page.locator(cover)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`${cover} img`)).toHaveJSProperty('complete', true)
    expect(await page.locator(`${cover} img`).evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await expect(page.locator(cover)).toContainText('Grok Bot')
    await page.screenshot({ path: join(EVIDENCE, 'boot-cover-light.png') })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.screenshot({ path: join(EVIDENCE, 'boot-cover-dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator(cover)).toContainText('Still connecting to the engine…', { timeout: 15_000 })
    await expect(page.locator(cover)).toHaveAttribute('data-phase', 'failed', { timeout: 100_000 })
    await expect(page.locator(cover)).toContainText("Couldn't connect to the engine.")
    await expect(page.locator(`${cover} button`)).toHaveText('Reload')
    await expect(page.locator(`${cover} button`)).toBeFocused()
    await page.screenshot({ path: join(EVIDENCE, 'boot-cover-failed.png') })
  } finally {
    await shell.stop()
  }
})
