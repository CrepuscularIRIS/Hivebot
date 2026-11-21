// B9 e2e：反馈卡全链——assistant 终答后插卡（shim entries）→点 Good→Thanks→刷新持久。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { textCall, waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B9：反馈卡插入+投票+持久', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b9-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    rt.writeScriptCalls(sid!, [textCall(['这是回复内容'])])
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await editor.click()
    await page.keyboard.type('问', { delay: 3 })
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '回复内容' })).toBeVisible({ timeout: 60_000 })
    // 反馈卡随 assistant 终答插入
    const card = page.locator('[data-feedback-card="prompt"]').last()
    await expect(card).toBeVisible({ timeout: 10_000 })
    await expect(card).toContainText('How was this response?')
    // 点 Good → Thanks（原版 LvdLef）
    await card.locator('button[aria-label="Good response"]').click()
    await expect(page.locator('[data-feedback-card="done"]').last()).toContainText('Thanks for the feedback!', { timeout: 5_000 })
    // 刷新后持久（localStorage pbots-feedback-v1）
    await page.reload()
    await waitProductReady(page)
    await expect(page.locator('[data-feedback-card="done"]').last()).toContainText('Thanks for the feedback!', { timeout: 15_000 })
  } finally { await shell.stop(); await rt.stop() }
})
