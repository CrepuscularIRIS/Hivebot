// B40-A 验证：mod+/ 打开 Keyboard shortcuts 帮助弹层（T94 已实装——planner 漏查，本 spec 锁行为防回归）。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B40-A：mod+/ 打开快捷键帮助 + Esc/scrim 关闭', async () => {
  test.setTimeout(240_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b40a-ws-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    await page.keyboard.press('ControlOrMeta+/')
    const help = page.locator('.sand-keyboard-help')
    await expect(help).toBeVisible({ timeout: 5_000 })
    await expect(help.locator('h2')).toHaveText('Keyboard shortcuts')
    // 组标题与至少一条行（New Bot）
    await expect(help.locator('.sand-keyboard-help__group-title').first()).toBeVisible()
    await expect(help.locator('.sand-keyboard-help__label', { hasText: 'New Bot' })).toBeVisible()
    // scrim 点击关闭
    await page.locator('.sand-keyboard-help-scrim').dispatchEvent('click')
    await expect(help).toHaveCount(0)
  } finally {
    await shell.stop().catch(() => {})
    await rt.stop().catch(() => {})
  }
})
