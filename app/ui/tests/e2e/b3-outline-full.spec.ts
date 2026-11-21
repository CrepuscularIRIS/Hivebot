// B3.1 e2e：outline 全量化——翻页加载的旧页也进「Full conversation」面板。
// rig 复用 session.spec ④（45 轮 + reload 缩窗 + 滚顶逐页回补）+ outline.spec openOutline。
// B3.1 前：outline 只见 live 窗口（翻页不并 view）；B3.1 后：翻到最早一轮 → 面板含 TURN-1。
import { expect, test, type Page } from 'playwright/test'
import { createBots, devState, finalAssistant, launchProduct, openOutline, openBot, textCall, transcript } from '../support/ui.ts'

test('翻页回补后 outline 面板含窗口外最早轮次', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [sid] = await createBots(page, [{ title: 'OL-B3' }]) as [string]
    const main = sid
    // B19 起 HISTORY_PAGE=200：45 轮（90 events）reload 后全在首窗，不再缩窗——升到 110 轮（220 events）恢复「窗外最早轮」前提
    const TURNS = 110
    rt.writeScriptCalls(main, Array.from({ length: TURNS }, (_, i) => textCall([`a${i + 1}`], { paceMs: 3 })))
    for (let i = 1; i <= TURNS; i++) {
      await rt.client.call('session/prompt', {
        request: { requestId: `b3-page-${i}-${main}`, sessionId: main, mode: 'queue', content: [{ type: 'text', text: `TURN-${i}${i === 1 ? '-earliest' : ''}` }] },
      })
    }
    await openBot(page, 'OL-B3')
    await expect(finalAssistant(page).last()).toHaveText(`a${TURNS}`, { timeout: 120_000 })

    // reload 缩窗：首窗最近 200 条（B19），TURN-1 窗口外
    await page.reload()
    await expect(finalAssistant(page).last()).toHaveText(`a${TURNS}`, { timeout: 60_000 })
    expect(await transcript(page).innerText()).not.toContain('TURN-1-earliest')

    // 滚顶逐页回补（B3.1：旧页并进 view.items——上游 UI 与 outline 同源）
    const scrollTop = (): Promise<void> => transcript(page).evaluate((el) => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')) })
    await expect.poll(async () => {
      await scrollTop()
      await page.waitForTimeout(300)
      await transcript(page).evaluate((el) => { el.scrollTop = 1000; el.dispatchEvent(new Event('scroll')) })
      return (await transcript(page).innerText()).includes('TURN-1-earliest')
    }, { timeout: 60_000, intervals: [200] }).toBe(true)

    // outline 面板：含窗口外最早轮次（B3.1 核心断言——此前只见 live 窗口）
    const panel = await openOutline(page, 'OL-B3')
    await expect(panel).toBeVisible()
    const items = panel.locator('.sand-outline-item')
    const count = await items.count()
    expect(count, 'outline 条目数 > 单条（45 轮至少数十条）').toBeGreaterThan(20)
    const panelText = await panel.innerText()
    expect(panelText, '面板含窗口外最早轮次').toContain('TURN-1-earliest')
    expect(panelText, '面板含最近轮次').toContain(`TURN-${TURNS}`)
  } finally {
    await env.stop()
  }
})
