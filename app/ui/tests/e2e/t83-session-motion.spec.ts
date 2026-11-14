// T83（第一批：状态行 shimmer）——thinking 时 label 动画 1400ms linear infinite running；
// reduced-motion 降级（高光带不扫，纯底字）。入场双段/锚点闪=第二批（回执记档）。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('T83：状态行短语 shimmer（1400ms 扫光 + reduced-motion 降级）', async () => {
  test.setTimeout(240_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t83-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, extraArgs: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
  try {
    const page = shell.page
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    // 慢流（gate 挂起）让状态行持续 working/thinking
    const gated = { chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: '流式开头' },
      { type: 'text-delta', index: 0, text: '后续' },
      { type: 'block-end', index: 0, block: { type: 'text', text: '不会到' } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 3 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ], gateAfterChunk: 1, gateId: 't83-g1', paceMs: 50 }
    rt.writeScriptCalls(sid!, [gated, textCall(['下一条'])])
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await editor.click()
    await page.keyboard.type('问', { delay: 3 })
    await page.click('button[aria-label="Send message"]')
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '流式开头' })).toBeVisible({ timeout: 60_000 })
    // 状态行出现（gate 挂起=持续活动中）
    const label = page.locator('.sand-status-line .sand-activity-label__text').first()
    await expect(label).toBeVisible({ timeout: 15_000 })
    const anim = await label.evaluate((el) => { const s = getComputedStyle(el, '::after'); return { name: s.animationName, dur: s.animationDuration, tf: s.animationTimingFunction, iter: s.animationIterationCount, state: s.animationPlayState } })
    expect(anim.name, 'shimmer keyframes 在（::after）').toContain('t83-shimmer')
    expect(anim.dur, '1400ms（shimmerDuration token）').toBe('1.4s')
    expect(anim.tf, 'linear timing').toContain('linear')
    expect(anim.iter, 'infinite').toBe('infinite')
    expect(anim.state, 'running（isShimmering 恒开）').toBe('running')
    // 底字 60%
    const base = await label.evaluate((el) => getComputedStyle(el).color)
    expect(base, '底字=半透明（color-mix 60% 的 computed 解析：color(srgb)/rgba）').toMatch(/color\(srgb|rgba?\(/)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForTimeout(300)
    const rm = await label.evaluate((el) => { const s = getComputedStyle(el, '::after'); return { name: s.animationName, opacity: s.opacity } })
    expect(rm.name, 'reduced-motion 高光带不扫').toBe('none')
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' })
    await page.waitForTimeout(800) // 扫光中段帧（拼版对照 0.78.1 conv-working：中段字色更深）
    await page.screenshot({ path: '/home/lingxufeng/bot/work/ui-quality/evidence/T83/shimmer.light.png' })
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
