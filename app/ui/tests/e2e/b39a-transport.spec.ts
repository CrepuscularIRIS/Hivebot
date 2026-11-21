// B39-A：断链 → 全局 Reconnecting 行+恢复。rig：kill sdk 子进程模拟断链，重启恢复。
import { expect, test } from 'playwright/test'
import { tmkdir } from '../support/tmp-sweep.ts'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { createBots, openBot, waitProductReady } from '../support/ui.ts'

test('B39-A 断链：transcript 顶部 Reconnecting 行出现/恢复后消失', async () => {
  test.setTimeout(240_000)
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b39a-ws-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    await createBots(page, [{ title: 'B39-A' }])
    await openBot(page, 'B39-A')
    // 正常态无 Reconnecting 行
    await expect(page.locator('.sand-transcript-older-history[data-older-history="loading"]')).toHaveCount(0)
    // B39-A 测试口 dropCarrier()：模拟 carrier 层断链（真网络断同路径：socket close 事件）
    await page.evaluate(() => { (window as unknown as { __pbotsDev?: { dropCarrier(): void } }).__pbotsDev?.dropCarrier() })
    await expect(page.locator('.sand-transcript-older-history[data-older-history="loading"]')).toBeVisible({ timeout: 15_000 })
    // 重连：shim 300ms 重试 bootSession（fake overlay 存活则恢复 connected）→ 行消失
    await expect(page.locator('.sand-transcript-older-history[data-older-history="loading"]')).toHaveCount(0, { timeout: 20_000 })
  } finally {
    await shell.stop().catch(() => {})
    await rt.stop().catch(() => {})
  }
})
