// B6 e2e：spotlight 全局快捷呼出——窗分支渲染（dataset.pbotsSpotlight）、quick-chat composer 发消息进 shim、Escape dismiss。
// gate：PBOTS_SPOTLIGHT=1 才建窗（对齐 1.1.0 default:false）。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B6：spotlight 窗分支 + quick-chat 发送 + Escape dismiss', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b6-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff, PBOTS_SPOTLIGHT: '1' } })
  try {
    // spotlight 窗 show:false 也触发 window 事件——firstWindow 可能抓错；两窗同 URL，按 dataset 分。
    const ctx = (await shell.app.windows())[0]!.context()
    let pages = ctx.pages()
    for (let i = 0; pages.length < 2 && i < 40; i++) { await pages[0]!.waitForTimeout(500); pages = ctx.pages() }
    expect(pages.length, '主窗+spotlight 两窗').toBeGreaterThanOrEqual(2)
    let spotPage: typeof pages[0] | undefined
    for (let i = 0; i < 40 && spotPage === undefined; i++) {
      for (const cand of pages) {
        if (cand.url() === 'about:blank' || cand.url() === '') continue
        try { if (await cand.evaluate(() => document.documentElement.dataset.pbotsSpotlight) === '') { spotPage = cand; break } } catch { /* 尚在加载 */ }
      }
      if (spotPage === undefined) { await pages[0]!.waitForTimeout(500) }
    }
    expect(spotPage, '找到 spotlight 窗（dataset 分支）').toBeDefined()
    const page = pages.find((p) => p !== spotPage)!
    await waitProductReady(page)
    // ① 窗分支：dataset.pbotsSpotlight 标记 + spotlight composer 可见
    await expect(spotPage.locator('.pbots-spotlight-root')).toBeVisible({ timeout: 30_000 })
    expect(await spotPage.evaluate(() => document.documentElement.dataset.pbotsSpotlight)).toBe('')
    // 主窗不受 argv 分支影响
    expect(await page.evaluate(() => document.documentElement.dataset.pbotsSpotlight)).toBeUndefined()
    // ② most-recent-bot 目标行出现（session/list 回来后）
    await expect(spotPage.locator('.pbots-spotlight-target'), 'target 就绪').toContainText('→', { timeout: 10_000 })
    // ③ 发消息：主 bot 有脚本回复（写进 sid）——spotlight 发送后 dismiss
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    rt.writeScriptCalls(sid!, [textCall(['spotlight 回复'])])
    const ta = spotPage.locator('.pbots-spotlight-card textarea')
    await ta.fill('来自 spotlight 的消息')
    await ta.press('Enter')
    // 发送成功 → phase dismissing → 窗关（动画后 close）
    await expect(spotPage.locator('.pbots-spotlight-root')).toHaveAttribute('data-pbots-spotlight-phase', 'dismissing', { timeout: 10_000 })
    // 消息确实进了 shim（blank 已翻 false——session/list 实证）+ 主窗点开 bot 后 transcript 可见
    const probe = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; blank?: boolean }> }
    expect(probe.items?.find((i) => i.sessionId === sid)?.blank, '发送后会话非 blank').toBe(false)
    await page.locator('.sand-agent-item').first().click({ timeout: 30_000 })
    await expect(page.locator('.sand-message[data-role="user"]', { hasText: '来自 spotlight 的消息' })).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: 'spotlight 回复' })).toBeVisible({ timeout: 60_000 })
  } finally { await shell.stop(); await rt.stop() }
})
