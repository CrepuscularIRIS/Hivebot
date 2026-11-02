// ① 冷启动 smoke：窗口以 pbots-app://app/ 打开（决策 7：特权协议，非 file://）。
// U-21 起主页面为产品壳：未配 dsh 时停在启动封面（[data-boot-cover]，复刻 01-boot.png）。
import { expect, test } from 'playwright/test'
import { launchShell } from '../../support/launch.ts'

test('cold start opens window on pbots-app://app/', async () => {
  const shell = await launchShell()
  try {
    await expect(shell.page.locator('[data-boot-cover]')).toBeVisible({ timeout: 15_000 })
    expect(shell.page.url().startsWith('pbots-app://app/')).toBe(true)
    const windows = await shell.app.windows()
    expect(windows).toHaveLength(1)
  } finally {
    await shell.stop()
  }
})
