// T48：设置 / Connect apps 现状探针（四格快照）。断言的是「现在的样子」——修单落地后本探针作废（工单 §边界3）。
// 生产缺省：不设 P2SDK_MARKET_INDEXES / 不装 bundle / provider 用 fake overlay（mock）；仅 ③ 为进 new-bot 对话框加 PRESETS_PATCH（回执记）。
import { expect, test, type Page } from 'playwright/test'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchShell } from '/tmp/bot-wt/T51/app/ui/tests/support/launch.ts'
import { tmkdir } from '/tmp/bot-wt/T51/app/ui/tests/support/tmp-sweep.ts'
import { fakeOverlayPath, launchSdkRuntime } from '/tmp/bot-wt/T51/app/ui/tests/support/sdk-runtime.ts'
import { PRESETS_PATCH, waitProductReady } from '/tmp/bot-wt/T51/app/ui/tests/support/ui.ts'

const OUT = '/tmp/bot-wt/T51/work/settings-connectors/evidence/T48wt'
const CONSOLE = join(OUT, 'console.txt')
const note = (s: string): void => { appendFileSync(CONSOLE, `${s}\n`); console.log(s) }
const watch = (page: Page, tag: string): void => {
  page.on('console', (m) => { if (m.type() === 'error') note(`[${tag}] console.error: ${m.text()}`) })
  page.on('pageerror', (e) => note(`[${tag}] pageerror: ${String(e)}`))
}
const logTheme = async (page: Page, tag: string): Promise<void> => {
  const t = await page.evaluate(() => document.documentElement.getAttribute('data-theme') ?? document.documentElement.className)
  note(`[${tag}] theme=${t}`)
}

test.beforeAll(() => { mkdirSync(OUT, { recursive: true }); writeFileSync(CONSOLE, '') })

test('① 设置：导航与 General 分组现状', async () => {
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('bot-t48-set-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  watch(shell.page, 'settings')
  try {
    const page = shell.page
    await waitProductReady(page)
    await page.click('button[aria-label="Account"]')
    await page.locator('[role="menuitem"]', { hasText: 'Settings' }).click()
    await expect(page.locator('.sand-settings-dialog')).toBeVisible({ timeout: 10_000 })
    await logTheme(page, 'settings')
    const navItems = await page.locator('.sand-settings-nav__item').evaluateAll(
      (els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => (e as HTMLElement).innerText))
    note(`[settings] 导航项原文=${JSON.stringify(navItems)}`)
    // U+F393 等私有区字形是 icon font 图标（gear），一并清掉再断言文字
    expect(navItems.join('').replace(/[\s​⁠﻿-]+/g, ''), '设置导航只剩 General（P5-52 覆盖后现状）').toBe('General')
    let panelText = ''
    try { panelText = (await page.locator('.sand-settings-panel__body').first().innerText({ timeout: 10_000 })).trim() } catch (e) { note(`[settings] panel 抓取失败: ${String(e).slice(0, 300)}`) }
    note(`[settings] General 分组/字段全文：\n${panelText}`)
    // T48b：分组标题断言（SettingsGroup = section>h3，panels.tsx:654）
    const groups = await page.locator('.sand-settings-panel__body section h3').evaluateAll(
      (els) => els.map((e) => (e as HTMLElement).innerText.replace(/[\s-]/g, '')).filter(Boolean))
    note(`[settings] 分组标题=${JSON.stringify(groups)}`)
    expect(groups, 'General 分组标题（现状）').toEqual(['Account', 'Appearance', 'Agent'])
    await page.screenshot({ path: join(OUT, 'settings-general.light.png') })
    await page.locator('.sand-settings-panel__close').click()
    await expect(page.locator('.sand-settings-dialog')).toHaveCount(0)
  } finally { await shell.stop(); await rt.stop() }
})

test('② Connect apps：footer 药丸 → 市场空态', async () => {
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('bot-t48-mkt-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  watch(shell.page, 'market')
  try {
    const page = shell.page
    await waitProductReady(page)
    await logTheme(page, 'market')
    const pill = page.locator('.sand-agents-sidebar__plugins')
    await expect(pill).toBeVisible()
    note(`[market] footer 药丸文字="${(await pill.innerText()).trim()}"`)
    await pill.click()
    const dlg = page.locator('[data-market]')
    await expect(dlg).toBeVisible({ timeout: 15_000 })
    const heading = (await dlg.locator('#sand-plugins-modal-heading').innerText()).trim()
    note(`[market] 市场标题="${heading}"`)
    // 空态：无目录源（生产缺省）——现状断言
    await expect(dlg.getByText('No catalog configured')).toBeVisible({ timeout: 10_000 })
    await expect(dlg.getByText("Catalogs come from the profile's market.yml and can't be changed in the app.")).toBeVisible()
    await page.screenshot({ path: join(OUT, 'connect-apps.light.png') })
    // 关闭：Close 圆钮应能关（关不掉=bug，红给经理看）
    await dlg.locator('button[aria-label="Close"]').click()
    await expect(dlg).toHaveCount(0, { timeout: 5_000 })
    note('[market] Close 可关 ✓')
  } finally { await shell.stop(); await rt.stop() }
})

test('③ new-bot 对话框连接器区 → Open Connect apps 层叠', async () => {
  // PRESETS_PATCH：对话框 preset 列表需要（工单 §边界2 允许，回执记）
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, cwd: tmkdir('bot-t48-nb-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  watch(shell.page, 'newbot')
  try {
    const page = shell.page
    await waitProductReady(page)
    await logTheme(page, 'newbot')
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    const dlg = page.locator('dialog[data-dialog="new-bot"]')
    await expect(dlg).toBeVisible({ timeout: 15_000 })
    await dlg.locator('details.pb-more summary').click() // 展开 More options
    const conn = dlg.locator('[data-connectors]')
    await expect(conn).toBeVisible()
    await expect(conn.getByRole('status')).toHaveCount(0, { timeout: 15_000 }) // T48b：等 Loading… 消失再读（connText 挪到等待后）
    const connText = (await conn.innerText()).trim()
    note(`[newbot] Connectors 区全文：\n${connText}`)
    const emptyRow = dlg.locator('[data-connectors-empty]')
    await expect(emptyRow).toBeVisible() // T48b：无条件断言空态行（toBeVisible 自带等待——原洞在 count() 不等待）
    note(`[newbot] data-connectors-empty 出现=true`)
    await expect(emptyRow.getByText('No connectors installed yet')).toBeVisible()
    await emptyRow.scrollIntoViewIfNeeded() // T48b：Connectors 区在对话框滚动区底部，滚入视口再截
    await page.screenshot({ path: join(OUT, 'newbot-connectors.light.png') }) // T48b：点之前留连接器区空态截图
    await emptyRow.locator('[data-action="to-market"]').click()
    const market = page.locator('[data-market]')
    await expect(market).toBeVisible({ timeout: 15_000 })
    await expect(market.getByText('No catalog configured')).toBeVisible()
    // 层叠：市场中心点 elementFromPoint 应落 market（在 new-bot 对话框之上或对话框已被收起——两种都算可交互，照实记）
    const hit = await page.evaluate(() => {
      const r = document.querySelector('[data-market]')!.getBoundingClientRect()
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return { inMarket: el?.closest('[data-market]') != null, dlgStillOpen: document.querySelector('dialog[data-dialog="new-bot"]') != null }
    })
    note(`[newbot] 点 Open Connect apps 后：市场中心命中=${hit.inMarket} new-bot 对话框仍开=${hit.dlgStillOpen}`)
    expect(hit.inMarket, '市场浮层中心可被命中（非死层）').toBe(true)
    await page.screenshot({ path: join(OUT, 'newbot-open-connect.light.png') }) // 层叠仍在时截（Close 前）
    await market.locator('button[aria-label="Close"]').click()
    await expect(market).toHaveCount(0)
    note('[newbot] 市场 Close 可关 ✓')
  } finally { await shell.stop(); await rt.stop() }
})

test('④ onboarding Connect 步：连接器恒灰', async () => {
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('bot-t48-onb-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  watch(shell.page, 'onboarding')
  try {
    const page = shell.page
    await expect(page.locator('#sand-onboarding-landing-heading')).toBeVisible({ timeout: 30_000 })
    await logTheme(page, 'onboarding')
    await page.locator('[data-action="onboarding-start"]').click()
    const live = page.locator('.sand-onboarding__step:not([aria-hidden])')
    const nextBtn = live.locator('button', { hasText: 'Next' })
    await expect(page.locator('#sand-onboarding-meet-heading')).toBeVisible({ timeout: 15_000 })
    await nextBtn.first().click() // meet → computer-demo
    await expect(page.locator('#sand-onboarding-computer-demo-heading')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(300)
    await nextBtn.first().click() // cd → jobs
    await expect(page.locator('#sand-onboarding-jobs-heading')).toBeVisible({ timeout: 25_000 })
    await page.waitForTimeout(300)
    await nextBtn.first().click() // jobs → role
    await expect(page.locator('#sand-onboarding-role-heading')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(300)
    await live.locator('[data-action="skip"]').click() // role 未选 → Skip 主钮
    await expect(page.locator('#sand-onboarding-attribution-heading')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(300)
    await live.locator('[data-action="skip"]').click() // attribution → connect
    await expect(page.locator('#sand-onboarding-connect-heading')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(400)
    const items = page.locator('.sand-onboarding__connect [role="listitem"]')
    await expect(items).toHaveCount(2)
    const rows = await items.evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.trim().replace(/\n/g, ' | ')))
    note(`[onboarding] 连接器行=${JSON.stringify(rows)}`)
    const btns = page.locator('.sand-onboarding__connect button', { hasText: 'Connect' })
    await expect(btns).toHaveCount(2)
    for (const b of await btns.all()) {
      expect(await b.isDisabled(), 'Connect 钮恒 disabled（现状）').toBe(true)
      note(`[onboarding] Connect 钮 title="${await b.getAttribute('title')}"`)
    }
    await expect(btns.first()).toHaveAttribute('title', "Connector sign-in isn't wired in this build yet")
    const skipText = (await live.locator('button', { hasText: 'Skip for now' }).first().innerText()).trim()
    note(`[onboarding] 主钮文字="${skipText}"`)
    await page.screenshot({ path: join(OUT, 'onboarding-connect.light.png') })
  } finally { await shell.stop(); await rt.stop() }
})
