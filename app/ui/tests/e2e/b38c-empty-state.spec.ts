// B38c：空会话欢迎块（yvjVU9 原版文案锚）可见+发首条消息后消失
import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { tmkdir } from '../support/tmp-sweep.ts'
import { launchShell } from '../support/launch.ts'
import { launchSdkRuntime } from '../support/sdk-runtime.ts'
import { createBots, openBot, send, textCall, waitProductReady } from '../support/ui.ts'

test('B38c 空态欢迎块：可见→首条消息后消失', async () => {
  test.setTimeout(180_000)
  const rt = await launchSdkRuntime({ patch: undefined, cwd: tmkdir('b38c-ws-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const [a] = await createBots(page, [{ title: 'B38c-A' }]) as [string]
    await openBot(page, 'B38c-A')
    // 新会话零 entry：欢迎块可见
    const welcome = page.locator('.sand-transcript-empty')
    await expect(welcome).toBeVisible({ timeout: 15_000 })
    await expect(welcome).toContainText('Welcome to Grok Bot')
    await page.screenshot({ path: join('test-output', 'B38c', 'empty-welcome.png') })
    // 发首条消息→块消失
    rt.writeScriptCalls(a, [textCall(['你好，第一条回复。'])])
    await send(page, 'hi')
    await expect(page.locator('.sand-message').first()).toBeVisible({ timeout: 30_000 })
    await expect(welcome).toBeHidden()
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
