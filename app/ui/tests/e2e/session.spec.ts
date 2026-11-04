// U-21 P-B E2E（PAB 验收 ②；P5-54 起跑在 renderer-grok 上）：
// ① D3 审批往返：Local tool permissions dock 只在发起 bot 的会话里出现，侧栏 Needs attention 标记；Deny once → 不执行 + 行 failed；
//    Allow once → 执行 + 行 done；卡上只有 Allow once / Deny once（P5-31：Always allow / Never 不在 DOM）、显示完整命令，作答值域 ⊆ {allowed-once, rejected}。
// ② composer：Shift+Enter 换行、IME 组字 Enter 不发送、Enter 发送；草稿按 bot 隔离；打断（P5-57 会话头 Stop → session/cancel）→ aborted。
// ③ 亮/暗截图存证；④ #11 分页：首窗有限，滚到顶自动取更早页，注入失败只重试该页。流式 ≥3 增量与定稿替换见 d1.spec.ts。
import { expect, test } from 'playwright/test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  EVIDENCE, MAIN_TITLE, api, bashCall, botItem, composer, createBots, devState, finalAssistant, launchProduct, openBot, permissionDock, send,
  streamingRow, textCall, toolRows, transcript,
} from '../support/ui.ts'

const shimAnswers = (page: import('playwright/test').Page): Promise<string[]> =>
  page.evaluate(() => ((window as unknown as { __pbotsShim: { answers: Array<{ value: string }> } }).__pbotsShim.answers).map((a) => a.value))

test('D3 审批往返：dock 仅本 bot、侧栏 Needs attention；Deny → 不执行；Allow once → 执行；卡只有两钮 + 完整命令', async () => {
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const main = (await devState(page)).meta.mainBotId!
    const [x] = await createBots(page, [{ title: 'D3-X', preset: 'standard' }]) // standard 带 bash + shell-ask（SPIKE §7）
    await openBot(page, 'D3-X')
    await expect.poll(async () => (await devState(page)).views[x!]?.cwd).toBeTruthy()
    const cwd = (await devState(page)).views[x!]!.cwd!
    const rejectCanary = join(cwd, 'canary-reject')
    const okCanary = join(cwd, 'canary-ok')
    rt.writeScriptCalls(x!, [
      bashCall(`touch ${rejectCanary}`, 'call-r'), textCall(['好的，不执行。']),
      bashCall(`touch ${okCanary}`, 'call-a'), textCall(['已执行。']),
    ])

    await send(page, '请建 canary')
    const dock = permissionDock(page)
    await expect(dock).toBeVisible({ timeout: 20_000 })
    await expect(toolRows(page).last()).toContainText('touch')
    // P5-31（L-AP A9④）：bash 卡无始终允许、无 Never——DOM 中按钮数 === 0；只剩 Allow once / Deny once；完整命令（绝对路径全文）可见
    await expect(dock.locator('button', { hasText: 'Always allow' })).toHaveCount(0)
    await expect(dock.locator('button', { hasText: /^Never$/ })).toHaveCount(0)
    await expect(dock.locator('button')).toHaveText(['Allow once', 'Deny once'])
    await expect(dock.locator('[data-pbots="ask-command"]')).toHaveText(`touch ${rejectCanary}`)
    await page.screenshot({ path: join(EVIDENCE, 'approval-light.png') })
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cursor-dark')
    await page.screenshot({ path: join(EVIDENCE, 'approval-dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })

    // 切到主 bot：X 行带 Needs attention，主 bot 的会话里没有审批 dock
    await openBot(page, MAIN_TITLE)
    await expect.poll(async () => (await devState(page)).views[main] !== undefined).toBe(true)
    await expect(botItem(page, 'D3-X').locator('[data-status="needs-attention"]')).toHaveCount(1)
    await expect(dock).toHaveCount(0)

    // 回到 X 拒绝 → dock 收起，行 failed，canary 不存在，标记消失
    await openBot(page, 'D3-X')
    await dock.locator('button', { hasText: 'Deny once' }).click()
    await expect(dock).toHaveCount(0, { timeout: 20_000 })
    await expect(toolRows(page).last()).toHaveAttribute('data-status', 'failed', { timeout: 20_000 })
    await expect(botItem(page, 'D3-X').locator('[data-status="needs-attention"]')).toHaveCount(0)
    await expect(finalAssistant(page).last()).toHaveText('好的，不执行。', { timeout: 20_000 })
    expect(existsSync(rejectCanary)).toBe(false)

    // 再来一次批准 → 执行
    await send(page, '这次批准')
    await dock.locator('button', { hasText: 'Allow once' }).click({ timeout: 20_000 })
    await expect.poll(() => existsSync(okCanary), { timeout: 30_000 }).toBe(true)
    await expect(toolRows(page).last()).toHaveAttribute('data-status', 'done', { timeout: 20_000 })
    await expect(finalAssistant(page).last()).toHaveText('已执行。', { timeout: 20_000 })
    expect((await shimAnswers(page)).sort()).toEqual(['allowed-once', 'rejected'])
  } finally {
    await env.stop()
  }
})

test('composer：Shift+Enter 换行、IME 组字 Enter 不发送、Enter 发送；草稿按 bot 隔离；会话头 Stop → aborted → 可继续', async () => {
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [x] = await createBots(page, [{ title: 'CMP-X', preset: 'p2-alpha' }])
    // 一次写全（fake 游标按会话持内存，二次 writeScriptCalls 不重置，LEARNINGS P5-03）：第 2 条给停止后的续发
    rt.writeScriptCalls(x!, [textCall(['第一段回复，', '挂起中'], { gateId: `u21-stop-${Date.now()}` }), textCall(['停止后继续'], { paceMs: 10 })])
    await openBot(page, 'CMP-X')
    const editor = composer(page)

    await editor.click()
    await page.keyboard.type('第一行')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('第二行')
    await expect(editor.locator('p, br')).not.toHaveCount(0)
    expect((await editor.innerText()).replace(/\n+/g, '\n').trim()).toBe('第一行\n第二行')
    // IME 组字中的 Enter（isComposing）是选词，不发送
    await editor.evaluate((el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })))
    await page.waitForTimeout(300)
    await expect(page.locator('.sand-transcript-row[data-role="user"]')).toHaveCount(0)

    // 草稿隔离：切到主 bot composer 为空，切回恢复
    await openBot(page, MAIN_TITLE)
    await expect(editor).toHaveText('')
    await openBot(page, 'CMP-X')
    await expect.poll(async () => (await editor.innerText()).replace(/\n+/g, '\n').trim()).toBe('第一行\n第二行')

    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await expect(page.locator('.sand-transcript-row[data-role="user"]')).toContainText('第二行', { timeout: 20_000 })
    await expect(editor).toHaveText('')
    await expect(streamingRow(page)).toContainText('第一段回复', { timeout: 20_000 })
    await page.screenshot({ path: join(EVIDENCE, 'streaming-light.png') })
    // 打断（P5-57）：会话头 Stop（运行中才出现）→ session/cancel（P5-27 同链路）→ aborted；
    // 先注入一次 cancel 失败：「Couldn't stop」+ 钮复位可再点（旧 GU-3 口径）
    const stop = page.locator('.sand-chat-header button[data-action="stop"]')
    await expect(stop).toBeVisible()
    await page.screenshot({ path: join(EVIDENCE, 'stop-button-light.png') })
    await page.evaluate(() => (window as unknown as { __pbotsDev: { failNext(m: string): void } }).__pbotsDev.failNext('session/cancel'))
    await stop.click()
    await expect(page.locator('.sand-chat-header .pb-stop__error')).toHaveText("Couldn't stop")
    await expect(stop).toBeEnabled()
    await stop.click()
    await expect.poll(async () => (await devState(page)).views[x!]?.endReason, { timeout: 20_000 }).toBe('aborted')
    await expect(streamingRow(page)).toHaveCount(0, { timeout: 20_000 })
    await expect(stop).toHaveCount(0) // 不再运行 → 钮收起
    // 停止后会话可继续
    await send(page, '继续')
    await expect(finalAssistant(page).last()).toHaveText('停止后继续', { timeout: 30_000 })
  } finally {
    await env.stop()
  }
})

test('亮/暗截图：侧栏 + 会话（P-A / P-B 存证）', async () => {
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [a] = await createBots(page, [{ title: '研究助手', preset: 'p2-alpha' }, { title: '写作助手', preset: 'p2-beta' }])
    await openBot(page, '研究助手')
    rt.writeScriptCalls(a!, [textCall(['你好，我是研究助手。', '这里是一段流式回复，', '已经定稿。'])])
    await send(page, '介绍一下你自己')
    await expect(finalAssistant(page).last()).toHaveText('你好，我是研究助手。这里是一段流式回复，已经定稿。', { timeout: 20_000 })
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
      await page.screenshot({ path: join(EVIDENCE, `shell-${mode}.png`) })
    }
  } finally {
    await env.stop()
  }
})

// U-26 ③（#11 分页，GU-PDC-A HIGH-2 / D6a）：follow 首窗有限（HISTORY_PAGE=40），窗口外更早历史
// 走 0.18 的「滚到顶自动取更早」（getAgentTranscriptWindow → shim → session/events + hasMore）；失败只重试该页。
test('#11 分页：长历史首窗有限，滚到顶逐页补全；失败只重试该页', async () => {
  test.setTimeout(240_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const main = (await devState(page)).meta.mainBotId!
    // 45 轮（90 条 messages > 首窗 40）：经 SDK client 直发排队，fake 回复逐轮定稿
    const TURNS = 45
    rt.writeScriptCalls(main, Array.from({ length: TURNS }, (_, i) => textCall([`a${i + 1}`], { paceMs: 5 })))
    for (let i = 1; i <= TURNS; i++) {
      await rt.client.call('session/prompt', {
        request: { requestId: `u26-page-${i}-${main}`, sessionId: main, mode: 'queue', content: [{ type: 'text', text: `TURN-${i}${i === 1 ? '-earliest' : ''}` }] },
      })
    }
    await expect(finalAssistant(page).last()).toHaveText(`a${TURNS}`, { timeout: 120_000 })

    // 重载触发 follow 快照重建：首窗 = 最近 HISTORY_PAGE 条，最早轮次在窗口外
    await page.reload()
    await expect(finalAssistant(page).last()).toHaveText(`a${TURNS}`, { timeout: 60_000 })
    await expect(transcript(page)).toContainText(`TURN-${TURNS}`)
    expect(await transcript(page).innerText()).not.toContain('TURN-1-earliest') // 窗口外

    // 失败只重试该页：注入一次性失败 → 首次滚顶取页失败；再滚顶重试成功，逐页补到最早一轮
    await page.evaluate(() => (window as unknown as { __pbotsDev: { failNext(m: string): void } }).__pbotsDev.failNext('session/events'))
    const scrollTop = (): Promise<void> => transcript(page).evaluate((el) => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')) })
    await expect.poll(async () => {
      await scrollTop()
      await page.waitForTimeout(300)
      await transcript(page).evaluate((el) => { el.scrollTop = 1000; el.dispatchEvent(new Event('scroll')) })
      return (await transcript(page).innerText()).includes('TURN-1-earliest')
    }, { timeout: 60_000, intervals: [200] }).toBe(true)
    await expect(transcript(page)).toContainText(`TURN-${TURNS}`) // prepend 不影响窗口内既有内容
    // 每轮恰一条（失败页没有拼进半页、重试没有重复拼页）
    expect((await transcript(page).innerText()).match(/TURN-1-earliest/g)).toHaveLength(1)
    for (const n of [2, 20, 44]) expect((await transcript(page).innerText()).match(new RegExp(`TURN-${n}(?!\\d)`, 'g'))).toHaveLength(1)
  } finally {
    await env.stop()
  }
})
