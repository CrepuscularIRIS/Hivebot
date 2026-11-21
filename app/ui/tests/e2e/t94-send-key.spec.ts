// T94：发送键=mod+enter（0.78.1 键位表）——纯 Enter 换行不发送。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('T94：Enter 换行不发送 / mod+enter 发送', async () => {
  test.setTimeout(240_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t94-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    rt.writeScriptCalls(sid!, [textCall(['收到'])])
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await editor.click()
    await page.keyboard.type('第一行', { delay: 5 })
    // 纯 Enter：换行不发送
    await page.keyboard.press('Enter')
    await page.keyboard.type('第二行', { delay: 5 })
    await page.waitForTimeout(800)
    expect(await page.locator('.sand-message[data-role="user"]').count(), '纯 Enter 不发送').toBe(0)
    expect(await editor.innerText(), '换行进编辑器').toContain('第二行')
    // mod+enter：发送
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(page.locator('.sand-message[data-role="user"]').first(), 'mod+enter 发送').toContainText('第一行', { timeout: 30_000 })
    await expect(page.locator('.sand-message[data-role="assistant"]').first(), '回复到达').toContainText('收到', { timeout: 60_000 })
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
