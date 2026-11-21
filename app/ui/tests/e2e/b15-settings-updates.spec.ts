// B15 e2e：设置 Updates(beta) 区开闸——mod+, 开设置 → Updates 导航可点 → 面板渲染（桩态 not-packaged 诚实）。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B15：设置 Updates 区可见可开', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b15-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    await page.keyboard.press('ControlOrMeta+,')
    const dlg = page.locator('.sand-settings-dialog')
    await expect(dlg).toBeVisible({ timeout: 10_000 })
    const updatesTab = page.locator('[role="tab"], nav button, [data-section]').filter({ hasText: 'Updates' })
    await expect(updatesTab.first()).toBeVisible({ timeout: 5_000 })
    await updatesTab.first().click()
    await page.waitForTimeout(800)
    // 面板内容出现（updates-controller 桩态：版本行/track/自动更新开关任一）
    const body = page.locator('.sand-settings-beta-stack')
    await expect(body).toBeVisible({ timeout: 8_000 })
  } finally { await shell.stop(); await rt.stop() }
})
