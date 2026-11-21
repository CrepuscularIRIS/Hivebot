// B17 e2e：附件 staging→发送→消息 📎 行——shim 内存 vault + wire 标记 + 投影可见行。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B17：附件发送链', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b17-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    // drop 注入 staging
    const chips = await page.evaluate(async () => {
      const dt = new DataTransfer()
      dt.items.add(new File(['hello b17'], 'notes.txt', { type: 'text/plain' }))
      const target = document.querySelector('.sand-prompt-shell')
      if (target == null) return 'NO_TARGET'
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }))
      await new Promise((r) => setTimeout(r, 1_000))
      return 'CHIPS=' + document.querySelectorAll('.sand-prompt-attachment').length
    })
    console.log('B17_STAGE=' + chips)
    await expect(page.locator('.sand-prompt-attachment')).toBeVisible({ timeout: 5_000 })
    // 输入+发送
    const editor = page.locator('.sand-prompt-shell [contenteditable="true"]')
    await editor.click()
    await editor.type('look at this')
    await page.locator('button[aria-label="Send message"]').click()
    // 消息渲染：📎 notes.txt 行（消息侧）+ chip 随发送清空
    await expect(page.locator('strong', { hasText: 'notes.txt' }).first()).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(1_500)
    await expect(page.locator('.sand-prompt-attachments .sand-prompt-attachment')).toHaveCount(0)
  } finally { await shell.stop(); await rt.stop() }
})
