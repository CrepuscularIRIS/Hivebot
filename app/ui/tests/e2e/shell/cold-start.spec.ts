// ① 冷启动 smoke：窗口以 pbots-app://app/ 打开（决策 7：特权协议，非 file://）。
// U-15 起主页面为 dev-min 临时页（原 U-00 骨架 Boot 页文案随其下线）。
import { expect, test } from 'playwright/test'
import { launchShell } from '../../support/launch.ts'

test('cold start opens window on pbots-app://app/', async () => {
  const shell = await launchShell()
  try {
    await expect(shell.page.locator('#composer')).toBeVisible({ timeout: 15_000 })
    expect(shell.page.url().startsWith('pbots-app://app/')).toBe(true)
    await expect(shell.page.locator('#composer')).toBeVisible({ timeout: 10_000 })
    const windows = await shell.app.windows()
    expect(windows).toHaveLength(1)
  } finally {
    await shell.stop()
  }
})
