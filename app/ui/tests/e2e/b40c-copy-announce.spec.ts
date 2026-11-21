// B40-C：消息 Copy 点击 → 剪贴板写入 + live region 播报 "Copied"（0.78.1 6V3Ea3 同文案）。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const editor = (page: import('playwright/test').Page) => page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')

test('B40-C：Copy 菜单项 → 剪贴板 + announce live region', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b40c-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff, PBOTS_GRANT_CLIPBOARD: '1' } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    rt.writeScriptCalls(sid!, [textCall(['可复制的回复文本'])])
    await editor(page).click()
    await page.keyboard.type('复制测试', { delay: 3 })
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '可复制的回复文本' })).toBeVisible({ timeout: 60_000 })

    // hover 消息 → More 菜单 → Copy
    const msg = page.locator('.sand-message[data-role="assistant"]').last()
    await msg.hover()
    await page.waitForTimeout(300)
    const moreBtn = page.locator('button[aria-label="More message actions"]')
    await expect(moreBtn.first()).toBeVisible({ timeout: 5_000 })
    await moreBtn.first().dispatchEvent('click')
    const menu = page.locator('div[role="menu"][aria-label="More message actions"]')
    await expect(menu).toBeVisible({ timeout: 5_000 })
    await menu.locator('button[role="menuitem"]', { hasText: 'Copy' }).click()

    // live region 播报 Copied
    await expect(page.locator('[data-testid="announce-live-region"] span[aria-live="polite"]')).toHaveText('Copied', { timeout: 5_000 })
  } finally {
    await shell.stop().catch(() => {})
    await rt.stop().catch(() => {})
  }
})
