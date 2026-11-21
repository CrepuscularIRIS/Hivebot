// B20 e2e：i18n 最小接线——语言切换消费端。
// 断言 documentElement.lang/dir（0.78.1 xo 行为），非 UI 文案（我们无 catalog，文案本就英文）。
// rig 复用 b18：General 面板 Language 行 SandSelect 切 zh → lang=zh-CN；回 system → navigator.language。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B20：Language 切换驱动 documentElement.lang/dir', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b20-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    await page.keyboard.press('ControlOrMeta+,')
    const dlg = page.locator('.sand-settings-dialog')
    await expect(dlg).toBeVisible({ timeout: 10_000 })
    const panel = page.locator('.sand-settings-general')
    await expect(panel).toBeVisible({ timeout: 8_000 })

    // 初始（system）→ navigator.language
    const navLang = await page.evaluate(() => navigator.language)
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 10_000 })
      .toBe(navLang)

    // 切 zh → zh-CN + ltr
    const langRow = panel.locator('label', { hasText: 'Language' }).first()
    await langRow.locator('.ui-select-trigger').click()
    await page.getByRole('option', { name: 'Chinese' }).click()
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 10_000 })
      .toBe('zh-CN')
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('ltr')

    // 回 system → 跟随 navigator
    await langRow.locator('.ui-select-trigger').click()
    await page.getByRole('option', { name: 'Follow System' }).click()
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 10_000 })
      .toBe(navLang)
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
