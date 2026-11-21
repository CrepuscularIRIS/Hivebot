// B43: shiki 双主题——Light 主题下代码块浅底（真机走查实锤的显示错乱回归锁）。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('light theme renders code block with light background', async () => {
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b43-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)

    // 预写一条带代码块的 assistant 回复（shiki 双主题输出 --shiki-light/--shiki-dark 变量组）
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    rt.writeScriptCalls(sid!, [textCall(['看这个代码：\n```python\ndef hello():\n    print("world")\n```\n以上。'])])

    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await page.keyboard.type('show code')
    await page.keyboard.press('Enter')

    // dark 默认：代码块渲染出来（shiki 懒加载）
    const codeRow = page.locator('.sand-message, .sand-transcript-row').filter({ hasText: 'def hello' }).first()
    await expect(codeRow).toBeVisible({ timeout: 60_000 })

    // 切 Light 主题（localStorage 直写 + reload，避免设置面交互开销）
    await page.evaluate(() => { localStorage.setItem('pbots.shim.theme-preference', 'light') })
    await page.reload()
    await waitProductReady(page)

    // B43 断言：Light 下 pre 背景为浅色（github-light 底），非暗色
    const pre = page.locator('pre').filter({ hasText: 'def hello' }).first()
    await expect(pre).toBeVisible({ timeout: 30_000 })
    const bg = await pre.evaluate((el) => getComputedStyle(el).backgroundColor)
    const m = bg.match(/(\d+),\s*(\d+),\s*(\d+)/)
    expect(m, `pre bg parseable: ${bg}`).not.toBeNull()
    const [r, g, b] = [Number(m![1]), Number(m![2]), Number(m![3])]
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    expect(luminance, `light theme code block should be light, got ${bg}`).toBeGreaterThan(180)
    // dark 默认（对照断言写在同 spec 内不 reload 回）：dark 底 #24292e 亮度 ~41，light 断言 >180 已区分
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
