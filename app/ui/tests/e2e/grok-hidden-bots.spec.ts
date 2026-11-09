// T41b 验收 5：真页面走完整一圈——右键 Hide → 行消失+徽标 → 对话框 Unhide → 行回来 → reload 持久。
import { expect, test } from 'playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { launchShell, sandboxHome } from '../support/launch.ts'
import { PRESETS_PATCH, waitProductReady } from '../support/ui.ts'

const EVIDENCE = '/home/lingxufeng/bot/work/exp-polish/evidence/T41'

test('T41 隐藏 bot 完整链：Hide → 徽标 → 对话框 Unhide → 行回来；reload 后隐藏持久', async () => {
  test.setTimeout(240_000)
  mkdirSync(EVIDENCE, { recursive: true })
  for (const scheme of ['light', 'dark'] as const) await runOnce(scheme)
})

async function runOnce(scheme: 'light' | 'dark'): Promise<void> {
  const home = sandboxHome('T41h')
  const dataDir = `${home}/data`
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, dataDir })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, home })
  const page = shell.page
  if (scheme === 'dark') await page.emulateMedia({ colorScheme: 'dark' })
  try {
    await waitProductReady(page)
    // 第二个 bot（要藏的对象）：API 建 + rename → reloadRoster
    const { sessionId: B } = await rt.client.call('session/create', { request: {} }) as { sessionId: string }
    await rt.client.call('session/rename', { request: { sessionId: B, title: 'Hide me bot' } })
    await page.evaluate(() => (window as unknown as { __pbotsDev?: { reloadRoster?(): Promise<void> } }).__pbotsDev?.reloadRoster())
    const row = page.locator('.sand-agent-item', { hasText: 'Hide me bot' })
    await expect(row).toBeVisible({ timeout: 30_000 })

    // 右键 → Hide from sidebar → 行消失、侧栏底出现「1 hidden bots」徽标
    await row.click({ button: 'right' })
    await page.locator('[aria-label="Agent actions"] [role=menuitem]', { hasText: 'Hide from sidebar' }).click()
    await expect(row, '隐藏后行消失').toHaveCount(0, { timeout: 15_000 })
    const badge = page.locator('[aria-label="1 hidden bots"]')
    await expect(badge, 'Hidden Bots 徽标出现').toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: join(EVIDENCE, `hidden.${scheme}.png`) })

    // reload → 隐藏仍在（localStorage 持久）——先证 roster 活着（主行在），count 0 才算「被藏」而非「没渲染」
    await page.reload()
    await waitProductReady(page)
    await expect(page.locator('.sand-agent-item').first(), 'roster 活着').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.sand-agent-item', { hasText: 'Hide me bot' }), 'reload 后仍隐藏').toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator('[aria-label="1 hidden bots"]')).toBeVisible({ timeout: 15_000 })

    // 点开 Hidden Bots 对话框 → Unhide → 行回来
    await page.locator('[aria-label="1 hidden bots"]').click()
    const dialog = page.locator('[role=dialog]')
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: join(EVIDENCE, `dialog.${scheme}.png`) })
    await dialog.locator('button', { hasText: 'Unhide' }).first().click()
    await expect(page.locator('.sand-agent-item', { hasText: 'Hide me bot' }), 'Unhide 后行回来').toBeVisible({ timeout: 15_000 })
  } finally {
    await shell.stop()
    await rt.stop()
  }
}
