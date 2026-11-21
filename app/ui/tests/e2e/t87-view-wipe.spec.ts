// T87：overlay 进场 wipe（±40px .26s cb）+reduced 降级。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('T87：overlay wipe 进场', async () => {
  test.setTimeout(240_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t87-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    // 设置面板进场
    await page.keyboard.press('ControlOrMeta+,')
    const panel = page.locator('.sand-settings-panel')
    await expect(panel).toBeVisible({ timeout: 8_000 })
    const anim = await panel.evaluate((el) => { const s = getComputedStyle(el); return { n: s.animationName, d: s.animationDuration, t: s.animationTimingFunction } })
    expect(anim.n, 'wipe 进场').toContain('t87-view-in')
    expect(anim.d).toBe('0.26s')
    expect(anim.t).toContain('cubic-bezier(0.22, 1, 0.36, 1)')
    await page.keyboard.press('Escape')
    // 市场
    await page.keyboard.press('ControlOrMeta+Shift+w')
    const market = page.locator('[data-market]')
    await expect(market).toBeVisible({ timeout: 10_000 })
    const anim2 = await market.evaluate((el) => getComputedStyle(el).animationName)
    expect(anim2, '市场 wipe（pb-dialog-in 升级参数）').toContain('pb-dialog-in')
    await page.keyboard.press('Escape')
    // reduced
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForTimeout(300)
    await page.keyboard.press('ControlOrMeta+,')
    const panelR = page.locator('.sand-settings-panel')
    await expect(panelR).toBeVisible({ timeout: 8_000 })
    await expect.poll(async () => panelR.evaluate((el) => getComputedStyle(el).animationName), { timeout: 5_000 }).toContain('t87-view-in-reduced')
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
