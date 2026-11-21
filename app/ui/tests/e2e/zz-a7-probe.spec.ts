import { test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('a7 附件现状探针', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('a7-probe-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    // 拖放注入：DataTransfer 造文件 → drop 事件到 composer
    const staged = await page.evaluate(async () => {
      const dt = new DataTransfer()
      dt.items.add(new File(['hello attachment probe'], 'probe.txt', { type: 'text/plain' }))
      const target = document.querySelector('.sand-prompt-shell') ?? document.querySelector('[contenteditable="true"]')
      if (target == null) return 'NO_TARGET'
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }))
      await new Promise((r) => setTimeout(r, 1500))
      const chips = document.querySelectorAll('.sand-prompt-attach, [class*="attachment"]').length
      return 'CHIPS=' + chips + ' html-len=' + (document.querySelector('.sand-prompt-shell')?.innerHTML.length ?? -1)
    })
    console.log('A7_PROBE=' + staged)
    // 发送：staged 后走 send 钮
    const editor = page.locator('.sand-prompt-shell [contenteditable="true"]')
    await editor.click()
    await editor.type('look at this file')
    const sendBtn = page.locator('button[aria-label="Send message"]')
    await sendBtn.click()
    await page.waitForTimeout(2_500)
    const after = await page.evaluate(() => {
      const imgs = document.querySelectorAll('.sand-message-attachments img, img[src^="data:"]').length
      const entries = document.querySelectorAll('.sand-conversation-entry').length
      const attachChips = document.querySelectorAll('.sand-prompt-attach').length
      return 'IMG=' + imgs + ' ENTRIES=' + entries + ' CHIPS_LEFT=' + attachChips
    })
    console.log('A7_AFTER=' + after)
  } finally { await shell.stop(); await rt.stop() }
})
