// B42：composer 键位对齐 0.78.1（chunk-prompt-editor @77005 键位表）+自动聚焦。
// 用户实报「打字 Enter 不能发送」——根因=旧 T94 mod+enter 键位+重启后焦点丢失。
// 本 spec 锁：①纯 Enter 发送 ②Shift+Enter 软换行不发送 ③Enter 后焦点保持 ④就绪后 composer 自动聚焦。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B42：Enter 发送/Shift+Enter 换行/自动聚焦', async () => {
  test.setTimeout(240_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b42-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    rt.writeScriptCalls(sid!, [textCall(['收到'])])

    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')

    // ④ 就绪后自动聚焦（B42 focus-on-select，0.78.1 @2054751 模式）——不点击直接打字
    await expect(editor).toBeFocused({ timeout: 15_000 })

    // ② Shift+Enter=软换行：两段文字一个 <br>，不发送
    await page.keyboard.type('甲行')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('乙行')
    const brCount = await editor.evaluate((el) => el.querySelectorAll('br').length)
    expect(brCount, 'Shift+Enter 产生软换行 <br>').toBeGreaterThanOrEqual(1)
    await expect(page.locator('.sand-message[data-role="user"]')).toHaveCount(0)

    // ① 纯 Enter 发送：user 消息上屏+composer 清空
    await page.keyboard.press('Enter')
    await expect(page.locator('.sand-message[data-role="user"]', { hasText: '甲行' })).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '收到' })).toBeVisible({ timeout: 60_000 })

    // ③ 发送后焦点保持（连续输入不丢焦）
    await expect(editor).toBeFocused({ timeout: 5_000 })
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
