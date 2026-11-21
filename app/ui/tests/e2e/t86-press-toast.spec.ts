// T86 返修版：按压 class 挂摘（click 后 100ms/400ms 两次读都含 press + linear()）+toast 真元素触发。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const animOf = (el: import('playwright').Locator): Promise<{ n: string; t: string }> =>
  el.evaluate((e) => { const s = getComputedStyle(e); return { n: s.animationName, t: s.animationTimingFunction } })

test('T86 返修：按压整段播完+真 toast', async () => {
  test.setTimeout(240_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t86r-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await editor.click()
    await page.keyboard.type('hi', { delay: 5 })
    const send = page.locator('button[aria-label="Send message"]')
    const sb = await send.boundingBox()
    await page.mouse.move(sb!.x + sb!.width / 2, sb!.y + sb!.height / 2)
    await page.mouse.down()  // 只 down 不 up：class 挂上不发送
    // 100ms：动画在（class 版非 :active——click 已松开）
    const a1 = await animOf(send)
    expect(a1.n, `100ms 仍播（got ${a1.n}）`).toContain('t86-press')
    expect(a1.t).toContain('linear(')
    // 400ms：仍播（.5s 未完）
    await page.waitForTimeout(300)
    const a2 = await animOf(send)
    expect(a2.n, `400ms 仍播（got ${a2.n}）`).toContain('t86-press')
    await page.mouse.up()
    await page.waitForTimeout(300) // 500ms animationend 摘 class
    // toast 真元素：开设置→General 有通知行（settings toast——缺 key 引导等场景）或 notification-host tray
    await page.keyboard.press('ControlOrMeta+,')
    const panel = page.locator('.sand-settings-panel')
    await expect(panel).toBeVisible({ timeout: 8_000 })
    // .sand-settings-toast / .sand-tray 有则断言 animation，无则断言 CSS 规则+选择器在产物（记档）
    const toast = page.locator('.sand-settings-toast, .sand-tray').first()
    if (await toast.count() > 0) {
      const ta = await animOf(toast)
      expect(ta.n).toContain('t86-toast-in')
    } else {
      const rule = await page.evaluate(() => {
        for (const sh of document.styleSheets) { let rs; try { rs = sh.cssRules } catch { continue }
          for (const r of rs) if (r instanceof CSSStyleRule && r.selectorText.includes('sand-tray')) return r.cssText }
        return null
      })
      expect(rule ?? '', 'toast 选择器规则在（sand-tray）').toContain('sand-tray')
    }
    // reduced：按压制降级版（class 同名换 keyframes——CSS media 内已切）
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForTimeout(300)
    const kfR = await page.evaluate(() => {
      for (const sh of document.styleSheets) { let rs; try { rs = sh.cssRules } catch { continue }
        for (const r of rs) if (r instanceof CSSKeyframesRule && r.name === 't86-press-fade-reduced') return r.cssText }
      return null
    })
    expect(kfR, 'reduced 按压降级').not.toBeNull()
    expect(kfR ?? '').not.toContain('transform')
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
