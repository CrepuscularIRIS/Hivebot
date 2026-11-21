// B38a 视觉回归：亮色主题下消息 hover 工具条/浮起面 token 化后无黑块（P5-58① 市场空态环境性挂的补位验收）。
// 守卫逻辑在 tests/unit/b38a-theme-tokens.test.ts（未定义变量+OS 媒体查询零容忍）；本 spec 只锁视觉事实。
import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { tmkdir } from '../support/tmp-sweep.ts'
import { launchShell } from '../support/launch.ts'
import { launchSdkRuntime } from '../support/sdk-runtime.ts'
import { createBots, finalAssistant, openBot, send, textCall, waitProductReady } from '../support/ui.ts'

test('B38a 亮色态：hover 工具条与浮起面无暗色黑块（token 化回归锁）', async () => {
  test.setTimeout(180_000)
  const rt = await launchSdkRuntime({ patch: undefined, cwd: tmkdir('b38a-ws-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const [a] = await createBots(page, [{ title: 'B38a-A' }]) as [string]
    await openBot(page, 'B38a-A')
    await rt.writeScriptCalls(a, [textCall(['带链接与文字的回复，用于 hover 工具条验收。'])])
    await send(page, 'hi')
    await expect(finalAssistant(page).last()).toBeVisible({ timeout: 30_000 })
    // 切 light（pbotsUi.setTheme 走 desktop bridge theme.set → Bzn('light') → html[data-theme='light']）
    await page.evaluate(() => { const w = window as unknown as { pbotsUi?: { setTheme?: (t: string) => void } }; w.pbotsUi?.setTheme?.('light') })
    await page.waitForTimeout(400)
    // 断言 1：根元素进入 light 态
    const theme = await page.evaluate(() => document.documentElement.dataset.theme)
    expect(theme).toBe('cursor-light')
    // 断言 2：hover 工具条按钮亮色（背景亮度 > 0.5，即非暗色黑块；原 #20231f 亮度≈0.13）
    await page.locator('.sand-message').last().hover()
    const btn = page.locator('.sand-message-hover-actions__button').first()
    await expect(btn).toBeVisible()
    const bg = await btn.evaluate((el) => getComputedStyle(el).backgroundColor)
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    expect(m, `backgroundColor=${bg}`).toBeTruthy()
    const lum = (Number(m![1]) * 0.2126 + Number(m![2]) * 0.7152 + Number(m![3]) * 0.0722) / 255
    expect(lum, `亮色态 hover 按钮背景亮度 ${(lum * 100).toFixed(0)}% 应为浅色（>0.5），实得 rgb=${bg}`).toBeGreaterThan(0.5)
    // 截图存证（evidence 不进断言，供人工对照）
    await page.screenshot({ path: join('test-output', 'B38a', 'light-hover.png') })
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
