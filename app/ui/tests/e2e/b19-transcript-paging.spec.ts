// B19 e2e：transcript 分页细化——0.78.1 对齐三点：
// ①初始/翻页页大小 200（HISTORY_PAGE；原 40）
// ②头部 sentinel+IntersectionObserver 触发（替代纯 scroll 阈值；scroll 兜底仍可用）
// ③loading/failed 状态行（loading 文案 / failed Retry 按钮）
// rig 复用 b3 模板：110 轮（220 events > 200）→ reload 首窗 200 → TURN-1 窗外 → 触发回补含 TURN-1。
import { expect, test } from 'playwright/test'
import { createBots, finalAssistant, launchProduct, openBot, textCall, transcript } from '../support/ui.ts'

test('B19：分页 200 页大小 + 滚顶回补最早轮次 + older 状态区', async () => {
  test.setTimeout(240_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [sid] = await createBots(page, [{ title: 'PG-B19' }]) as [string]
    const TURNS = 110
    rt.writeScriptCalls(sid, Array.from({ length: TURNS }, (_, i) => textCall([`a${i + 1}`], { paceMs: 3 })))
    for (let i = 1; i <= TURNS; i++) {
      await rt.client.call('session/prompt', {
        request: { requestId: `b19-page-${i}-${sid}`, sessionId: sid, mode: 'queue', content: [{ type: 'text', text: `TURN-${i}${i === 1 ? '-earliest' : ''}` }] },
      })
    }
    await openBot(page, 'PG-B19')
    await expect(finalAssistant(page).last()).toHaveText(`a${TURNS}`, { timeout: 150_000 })

    // reload 后首窗 200 条：TURN-1（第 1-2 条 events）在窗外；older 区在（hasOlder）
    await page.reload()
    await expect(finalAssistant(page).last()).toHaveText(`a${TURNS}`, { timeout: 90_000 })
    expect(await transcript(page).innerText()).not.toContain('TURN-1-earliest')
    const older = page.locator('.sand-transcript-older-history')
    await expect(older).toBeVisible()

    // 滚顶回补（sentinel observer 生效前 scroll 兜底也在）：TURN-1 补全
    const scrollTop = (): Promise<void> => transcript(page).evaluate((el) => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')) })
    await expect.poll(async () => {
      await scrollTop()
      await page.waitForTimeout(250)
      return (await transcript(page).innerText()).includes('TURN-1-earliest')
    }, { timeout: 90_000, intervals: [300] }).toBe(true)

    // exhausted 后 older 区收起（hasOlder=false）
    await expect(older).toHaveCount(0)
  } finally {
    await env.stop()
  }
})
