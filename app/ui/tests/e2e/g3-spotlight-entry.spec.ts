// G3 e2e：spotlight 全局搜索入口（1.1.0 锚：Alt+Space）+placeholder 双态。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('G3: spotlight 入口与 placeholder 双态', async () => {
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('g3-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)

    // Alt+Space 打开 palette（1.1.0 spotlight 入口）
    await page.keyboard.press('Alt+Space')
    const palette = page.locator('.sand-command-palette')
    await expect(palette).toBeVisible()

    // 空态 placeholder（ALCDRp 锚）
    const input = palette.locator('input[aria-label="Search"]')
    await expect(input).toHaveAttribute('placeholder', 'Search Bots, files, and actions')

    // 输入后 placeholder 换态（/RmlZA 锚）——清空后回初态
    await input.fill('a')
    await expect(input).toHaveAttribute('placeholder', 'Search Bots, Chats, Settings...')
    await input.fill('')
    await expect(input).toHaveAttribute('placeholder', 'Search Bots, files, and actions')

    // Escape 关闭；mod+k 并存仍可开
    await page.keyboard.press('Escape')
    await expect(palette).toBeHidden()
    await page.keyboard.press('ControlOrMeta+k')
    await expect(palette).toBeVisible()
  } finally {
    await rt.stop()
  }
})
