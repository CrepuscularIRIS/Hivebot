// T54 取证 spec：Windows(CDP 9229) 与 Linux(launchShell) 跑同一份屏序列（geo.ts）。
// Windows 依赖：VM 内 hbtest-cdp 实例 + 宿主 ssh -L 9229 转发（回执记命令）。
import { expect, test } from 'playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '/home/lingxufeng/bot/app/ui/tests/support/tmp-sweep.ts'
import { launchShell } from '/home/lingxufeng/bot/app/ui/tests/support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '/home/lingxufeng/bot/app/ui/tests/support/sdk-runtime.ts'
import { waitProductReady } from '/home/lingxufeng/bot/app/ui/tests/support/ui.ts'
import { collect, runScreens, setWindow, OUT } from './geo.ts'

test('win：VM CDP 采集', async () => {
  test.setTimeout(240_000)
  const { chromium } = await import('/home/lingxufeng/bot/app/ui/node_modules/playwright/index.mjs')
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9229')
  const page = browser.contexts()[0]?.pages().find((p) => p.url().startsWith('pbots-app://')) ?? browser.contexts()[0]?.pages()[0]
  expect(page, '主窗口页面在').toBeTruthy()
  await page.waitForTimeout(500)
  // 8 onboarding Connect 步（清 seen → reload → 走 walk 到 connect）
  await page.evaluate(() => window.localStorage.removeItem('pbots.shim.onboarding-seen'))
  await page.reload()
  await page.locator('#sand-onboarding-landing-heading').waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
  if (await page.locator('[data-action="onboarding-start"]').count() > 0) {
    await page.locator('[data-action="onboarding-start"]').click()
    const live = page.locator('.sand-onboarding__step:not([aria-hidden])')
    for (const h of ['meet', 'computer-demo', 'jobs', 'role', 'attribution']) {
      await page.locator(`#sand-onboarding-${h}-heading`).waitFor({ state: 'visible', timeout: 20_000 })
      await page.waitForTimeout(250)
      const btn = h === 'role' || h === 'attribution' ? live.locator('[data-action="skip"]') : live.locator('button', { hasText: 'Next' })
      await btn.first().click()
    }
    await page.locator('#sand-onboarding-connect-heading').waitFor({ state: 'visible', timeout: 20_000 })
    await page.waitForTimeout(400)
    await collect(page, '08-onboarding-connect', 'win', ['.sand-onboarding__connect', '.sand-onboarding__connect [role="listitem"]'])
    // 走完（Skip for now）回到主界面
    await page.locator('.sand-onboarding__step:not([aria-hidden]) button', { hasText: 'Skip for now' }).click()
    await page.waitForTimeout(2500)
  }
  // ③⑨ 有会话 + info pane（VM 已 onboarded，主 bot 在）
  await waitProductReady(page)
  await collect(page, '03-session', 'win', ['.sand-agent-item', '.sand-agents-sidebar__plugins-entry', '.sand-prompt-shell'])
  await page.click('button[aria-label="View agent settings"]').catch(() => {})
  const pane = page.locator('aside.sand-info-pane[data-open]')
  if (await pane.count() > 0) {
    await pane.waitFor({ state: 'visible', timeout: 8_000 })
    await page.waitForTimeout(400)
    await collect(page, '09-infopane', 'win', ['aside.sand-info-pane', '.sand-agents-sidebar'])
    await page.keyboard.press('Escape')
  }
  const skipped = await runScreens(page, 'win')
  console.log(`win skipped: ${skipped.join('; ') || '无'}`)
  await browser.close()
})

test('linux：launchShell 对照（窗口对齐 win innerW/H）', async () => {
  test.setTimeout(300_000)
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('bot-t54-ws-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, extraArgs: ['--remote-debugging-port=9230'] })
  const { chromium } = await import('/home/lingxufeng/bot/app/ui/node_modules/playwright/index.mjs')
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9230')
  try {
    const page = browser.contexts()[0]?.pages()[0] ?? (await browser.contexts()[0]?.newPage())
    expect(page, 'linux 主窗口').toBeTruthy()
    // 窗口对齐 Windows 实测内容区
    let w = 1280, h = 800
    try { const m = JSON.parse(readFileSync(join(OUT, '01-main.win.json'), 'utf8')); w = m.meta.innerW; h = m.meta.innerH } catch { /* win 先跑失败则默认 */ }
    await setWindow(page, w, h)
    await page.waitForTimeout(600)
    // onboarding Connect 步（fresh HOME 天然在）
    await page.locator('#sand-onboarding-landing-heading').waitFor({ state: 'visible', timeout: 30_000 })
    await page.locator('[data-action="onboarding-start"]').click()
    const live = page.locator('.sand-onboarding__step:not([aria-hidden])')
    for (const h2 of ['meet', 'computer-demo', 'jobs', 'role', 'attribution']) {
      await page.locator(`#sand-onboarding-${h2}-heading`).waitFor({ state: 'visible', timeout: 20_000 })
      await page.waitForTimeout(250)
      const btn = h2 === 'role' || h2 === 'attribution' ? live.locator('[data-action="skip"]') : live.locator('button', { hasText: 'Next' })
      await btn.first().click()
    }
    await page.locator('#sand-onboarding-connect-heading').waitFor({ state: 'visible', timeout: 20_000 })
    await page.waitForTimeout(400)
    await collect(page, '08-onboarding-connect', 'linux', ['.sand-onboarding__connect', '.sand-onboarding__connect [role="listitem"]'])
    await page.locator('.sand-onboarding__step:not([aria-hidden]) button', { hasText: 'Skip for now' }).click()
    await page.waitForTimeout(2500)
    await waitProductReady(page)
    await collect(page, '03-session', 'linux', ['.sand-agent-item', '.sand-agents-sidebar__plugins-entry', '.sand-prompt-shell'])
    await page.click('button[aria-label="View agent settings"]').catch(() => {})
    const pane = page.locator('aside.sand-info-pane[data-open]')
    if (await pane.count() > 0) {
      await pane.waitFor({ state: 'visible', timeout: 8_000 })
      await page.waitForTimeout(400)
      await collect(page, '09-infopane', 'linux', ['aside.sand-info-pane', '.sand-agents-sidebar'])
      await page.keyboard.press('Escape')
    }
    const skipped = await runScreens(page, 'linux')
    console.log(`linux skipped: ${skipped.join('; ') || '无'}`)
  } finally {
    await browser.close()
    await shell.stop()
    await rt.stop()
  }
})
