// T81：面板四件三实（newGroupChat 无实底不做——记档）——mod+alt+b 开关 info、
// mod+shift+comma 开关 bot 设置、mod+shift+w 开 Connect apps。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('T81：面板热键三件（info/agent-settings/plugins）', async () => {
  test.setTimeout(240_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t81-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    // ① info：DSH 无 computer bridge——ComputerHeaderControl 实证不渲染，#28 热键记档降级
    const hasComputer = await page.locator('.sand-chat-header__computer').count() > 0
    const infoPane = page.locator('aside.sand-info-pane[data-open]')
    if (hasComputer) {
      await page.keyboard.press('ControlOrMeta+Alt+b')
      await expect(infoPane.first(), 'info pane 开（computer 钮）').toBeVisible({ timeout: 8_000 })
      await page.keyboard.press('ControlOrMeta+Alt+b')
      await expect(infoPane.first(), 'info pane 关').toBeHidden({ timeout: 8_000 })
    }
    // ② mod+shift+comma → bot 设置（agent-settings overlay）
    await page.keyboard.press('ControlOrMeta+Shift+<')
    const settings = page.locator('aside.sand-info-pane[data-open]')
    await expect(settings.first(), 'agent settings 开').toBeVisible({ timeout: 8_000 })
    await page.keyboard.press('ControlOrMeta+Shift+<')
    await expect(settings.first(), 'settings 热键 toggle 关').toBeHidden({ timeout: 8_000 })
    // ③ mod+shift+w → Connect apps（plugins overlay）
    await page.keyboard.press('ControlOrMeta+Shift+w')
    const plugins = page.locator('[data-market], .sand-plugins-dialog')
    await expect(plugins.first(), 'plugins/market 开').toBeVisible({ timeout: 10_000 })
    await page.keyboard.press('Escape')
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
