// B18 e2e：General 区行序对齐 0.78.1——区序 Account→Appearance→Bot→SecurityKey，新行 Language/Spell check/
// Play Sound for Notifications/Use hardware acceleration 可见（shim bridge 可选面已实现，行必渲染）。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B18：General 区行序与新行可见', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b18-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    await page.keyboard.press('ControlOrMeta+,')
    const dlg = page.locator('.sand-settings-dialog')
    await expect(dlg).toBeVisible({ timeout: 10_000 })
    // General 是默认区：直接取面板
    const panel = page.locator('.sand-settings-general')
    await expect(panel).toBeVisible({ timeout: 8_000 })
    // 区序：section 标题顺序
    const titles = await panel.locator('h3').allTextContents()
    const idx = (t: string) => titles.findIndex((x) => x.trim() === t)
    const account = idx('Account'), appearance = idx('Appearance'), bot = idx('Bot')
    expect(account).toBeGreaterThanOrEqual(0)
    expect(appearance).toBeGreaterThan(account)
    expect(bot).toBeGreaterThan(appearance)
    // 新行文案（0.78.1 逐字锚）
    const body = await panel.textContent()
    expect(body).toContain('Language')
    expect(body).toContain('Spell check')
    expect(body).toContain('Play Sound for Notifications')
    expect(body).toContain('Use hardware acceleration')
    // Security Key 行在 Bot 区之后（0.78.1 Ur 行组首行）
    const security = body!.indexOf('Security Key')
    const botSec = body!.indexOf('Bot')
    expect(security).toBeGreaterThan(botSec)
  } finally { await shell.stop(); await rt.stop() }
})
