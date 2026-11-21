// D4 e2e：Good/Bad response 反馈（1.1.0 锚）。assistant 消息 More 菜单含两项；投票后项消失；user 消息无该项。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('D4: Good/Bad response 反馈', async () => {
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('d4-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)

    // 造一轮对话（user + assistant 回复）
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    rt.writeScriptCalls(sid!, [textCall(['Sure, here is the answer.'])])
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await editor.click()
    await page.keyboard.type('hello there')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Sure, here is the answer.')).toBeVisible({ timeout: 20_000 })

    // assistant 行 hover → More 菜单 → Good/Bad response 可见
    const assistantRow = page.locator('.sand-transcript-row', { hasText: 'Sure, here is the answer.' }).last()
    await assistantRow.hover()
    const more = page.locator('.sand-message-hover-actions__button[aria-label="More message actions"]').last()
    await more.dispatchEvent('mousedown', { button: 0 })
    await more.click()
    const good = page.locator('[role="menuitem"][data-vote="good"]')
    await expect(good).toBeVisible()
    await expect(page.locator('[role="menuitem"][data-vote="bad"]')).toBeVisible()

    // 投 Good → 菜单关 → 重开：两项消失（voted）
    await good.dispatchEvent('mousedown', { button: 0 })
    await good.click({ force: true })
    await expect(good).toBeHidden()
    await assistantRow.hover()
    await more.dispatchEvent('mousedown', { button: 0 })
    await more.click()
    await expect(page.locator('[role="menuitem"][data-vote="good"]')).toBeHidden()
    await expect(page.locator('[role="menuitem"][data-vote="bad"]')).toBeHidden()

    // user 行无投票项（role 门）
    const userRow = page.locator('.sand-transcript-row', { hasText: 'hello there' }).last()
    await userRow.hover()
    const userMore = userRow.locator('.sand-message-hover-actions__button[aria-label="More message actions"]')
    await userMore.dispatchEvent('mousedown', { button: 0 })
    await userMore.click()
    await expect(page.locator('[role="menuitem"][data-vote="good"]')).toBeHidden()
  } finally {
    await rt.stop()
  }
})
