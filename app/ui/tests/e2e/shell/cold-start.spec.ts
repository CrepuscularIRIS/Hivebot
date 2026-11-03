// ① 冷启动 smoke：窗口以 pbots-app://app/ 打开（决策 7：特权协议，非 file://）。
// P5-54 起主页面为 renderer-grok：未配 dsh 时挂载空壳（.sand-shell；0.18 无启动封面，差异交 P5-55）。
import { expect, test } from 'playwright/test'
import { launchShell } from '../../support/launch.ts'

test('cold start opens window on pbots-app://app/', async () => {
  const shell = await launchShell()
  try {
    await expect(shell.page.locator('.sand-shell')).toBeVisible({ timeout: 15_000 })
    expect(shell.page.url().startsWith('pbots-app://app/')).toBe(true)
    const windows = await shell.app.windows()
    expect(windows).toHaveLength(1)
  } finally {
    await shell.stop()
  }
})
