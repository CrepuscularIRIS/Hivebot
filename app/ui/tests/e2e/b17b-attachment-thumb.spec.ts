// B17b e2e：图片附件缩略图——drop PNG → 发送 → 消息内 .sand-message-attachments img[data:] 渲染。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B17b：图片附件缩略图', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b17b-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    // 1x1 PNG bytes
    const staged = await page.evaluate(async () => {
      const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
      const dt = new DataTransfer()
      dt.items.add(new File([png], 'dot.png', { type: 'image/png' }))
      const target = document.querySelector('.sand-prompt-shell')
      if (target == null) return 'NO_TARGET'
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }))
      await new Promise((r) => setTimeout(r, 1_000))
      return 'CHIPS=' + document.querySelectorAll('.sand-prompt-attachment').length
    })
    console.log('B17B_STAGE=' + staged)
    await expect(page.locator('.sand-prompt-attachment')).toBeVisible({ timeout: 5_000 })
    const editor = page.locator('.sand-prompt-shell [contenteditable="true"]')
    await editor.click()
    await editor.type('see the dot')
    await page.locator('button[aria-label="Send message"]').click()
    await page.waitForTimeout(2_500)
    const diag = await page.evaluate(() => {
      const pin = document.body.innerText.includes('dot.png')
      const imgAny = document.querySelectorAll('img').length
      const dataImg = Array.from(document.querySelectorAll('img')).filter((i) => i.src.startsWith('data:')).length
      return 'PIN=' + pin + ' IMG_ANY=' + imgAny + ' DATA_IMG=' + dataImg
    })
    const csp = await page.evaluate(() => {
      try { const c = document.querySelector('meta[http-equiv="Content-Security-Policy"]'); return c === null ? 'NO_META' : c.getAttribute('content')?.slice(0, 80) ?? 'EMPTY' } catch { return 'ERR' }
    })
    console.log('B17B_DIAG=' + diag + ' CSP=' + csp)
    // 消息内缩略图（data: URL img）
    const img = page.locator('.sand-message-attachments img')
    await expect(img).toBeVisible({ timeout: 10_000 })
    await expect(img).toHaveAttribute('src', /^data:image\/png;base64,/, )
    await expect(page.locator('.sand-prompt-attachments .sand-prompt-attachment')).toHaveCount(0)
  } finally { await shell.stop(); await rt.stop() }
})
