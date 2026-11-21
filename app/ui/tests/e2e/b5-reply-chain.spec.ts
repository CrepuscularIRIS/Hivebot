// B5.1 e2e：Reply 引用回复链——More 菜单 Reply → composer reply 态（Cancel reply）→ 发送 → 标记不外泄。
// 0.78.1 规格（RE-UI-FACES §4）：reply 在菜单不在 hover 条；Cancel reply AnRu/j；引用预览+跳转。
// 起场照 t91：session/list 拿主 bot sid + writeScriptCalls 灌回复脚本（fake-llm 无脚本无回复）。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const editor = (page: import('playwright/test').Page) => page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')

test('B5：Reply 全链（菜单 Reply → reply 态 → Cancel → 重进 → 发送 → 标记不外泄）', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b5-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    rt.writeScriptCalls(sid!, [textCall(['回复本体']), textCall(['第二回复'])])
    await editor(page).click()
    await page.keyboard.type('问一', { delay: 3 })
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '回复本体' })).toBeVisible({ timeout: 60_000 })
    // More 菜单 → Reply
    const assistantMsg = page.locator('.sand-message[data-role="assistant"]').last()
    await assistantMsg.hover()
    await page.waitForTimeout(300)
    const moreBtn = page.locator('button[aria-label="More message actions"]')
    await expect(moreBtn.first(), 'hover 出 More 钮').toBeVisible({ timeout: 5_000 })
    await moreBtn.first().dispatchEvent('click')
    const menu = page.locator('div[role="menu"][aria-label="More message actions"]')
    await expect(menu).toBeVisible({ timeout: 5_000 })
    await menu.locator('button[role="menuitem"]', { hasText: 'Reply' }).click()
    // composer 进 reply 态：Cancel reply 可见
    await expect(page.locator('button[aria-label="Cancel reply"]'), 'reply 态 Cancel 钮').toBeVisible({ timeout: 5_000 })
    // Cancel reply 退出
    await page.locator('button[aria-label="Cancel reply"]').click()
    await expect(page.locator('button[aria-label="Cancel reply"]')).toHaveCount(0)
    // 重进 reply 态并直接发送
    await assistantMsg.hover()
    await page.waitForTimeout(300)
    await page.locator('button[aria-label="More message actions"]').first().dispatchEvent('click')
    await page.locator('div[role="menu"][aria-label="More message actions"]').locator('button[role="menuitem"]', { hasText: 'Reply' }).click()
    await expect(page.locator('button[aria-label="Cancel reply"]')).toBeVisible({ timeout: 5_000 })
    await editor(page).click()
    await page.keyboard.type('追问内容', { delay: 3 })
    await page.keyboard.press('ControlOrMeta+Enter')
    // 新 user 消息：content 不含 [reply: 标记（序列化已剥）
    const userMsgs = page.locator('.sand-message[data-role="user"]')
    await expect(userMsgs.last()).toContainText('追问内容', { timeout: 10_000 })
    await expect(userMsgs.last()).not.toContainText('[reply:')
    // 第二轮回复也到（发送链没被 reply 态破坏）
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '第二回复' })).toBeVisible({ timeout: 60_000 })
  } finally { await shell.stop(); await rt.stop() }
})
