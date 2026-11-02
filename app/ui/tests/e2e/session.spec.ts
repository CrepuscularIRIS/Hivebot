// U-21 P-B E2E（PAB 验收 ②）：tool-call 紧凑行、审批卡 inline（挂起 → 作答 → 终态；黄点在侧栏；卡只在发起 bot 的流里，
// 挂在 callId 行下；拒绝 → canary 不存在 + 行 failed；批准 → canary 存在；无「始终允许」）、Enter / Shift+Enter / IME、
// 停止（turn/end aborted → 「已停止」）、草稿按 bot 隔离；亮/暗截图存证。流式 ≥3 增量与定稿替换见 d1.spec.ts。
import { expect, test } from 'playwright/test'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { EVIDENCE, bashCall, createViaDialog, devState, launchProduct, send, textCall } from '../support/ui.ts'

test('审批卡 inline：挂在 callId 行下、黄点在侧栏、仅本 bot 流；拒绝 → 不执行；批准 → 执行', async () => {
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const main = (await devState(page)).meta.mainBotId!
    const x = await createViaDialog(page, 'standard') // 默认 preset 带 bash + shell-ask（SPIKE §7）
    await expect.poll(async () => (await devState(page)).views[x]?.cwd).toBeTruthy()
    const cwd = (await devState(page)).views[x]!.cwd!
    const rejectCanary = join(cwd, 'canary-reject')
    const okCanary = join(cwd, 'canary-ok')
    rt.writeScriptCalls(x, [
      bashCall(`touch ${rejectCanary}`, 'call-r'), textCall(['好的，不执行。']),
      bashCall(`touch ${okCanary}`, 'call-a'), textCall(['已执行。']),
    ])

    await send(page, '请建 canary')
    const rowR = page.locator('.tool-row[data-call-id="call-r"]')
    await expect(rowR.locator('.tool-name')).toHaveText('Bash', { timeout: 20_000 })
    await expect(rowR.locator('.tool-summary')).toContainText('touch')
    const card = rowR.locator('[data-approval-card]')
    await expect(card).toBeVisible({ timeout: 20_000 })
    await expect(card.locator('[data-action="approve"]')).toHaveText('仅批准这一次')
    await expect(page.locator('[data-approval-hint]')).toBeVisible()
    expect(await page.locator('body').innerText()).not.toContain('始终允许')
    await page.screenshot({ path: join(EVIDENCE, 'approval-light.png') })
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cursor-dark')
    await page.screenshot({ path: join(EVIDENCE, 'approval-dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })

    // 切到主 bot：X 项有黄点，主 bot 的流里没有审批卡
    await page.click(`.bot-item[data-session="${main}"]`)
    const itemX = page.locator(`.bot-item[data-session="${x}"]`)
    await expect(itemX).toHaveAttribute('data-pending', 'true')
    await expect(itemX.locator('.corner-dot.warn')).toBeVisible()
    await expect(itemX.locator('.bot-sub')).toHaveText('等待批准')
    await expect(page.locator('[data-approval-card]')).toHaveCount(0)

    // 回到 X 拒绝 → 卡收成「已拒绝」，行 failed，canary 不存在，黄点消失
    await itemX.click()
    await rowR.locator('[data-action="reject"]').click()
    await expect(rowR.locator('[data-decision="rejected"]')).toContainText('已拒绝', { timeout: 20_000 })
    await expect(rowR).toHaveAttribute('data-status', 'failed')
    await expect(rowR.locator('[data-approval-card]')).toHaveCount(0)
    await expect(itemX).not.toHaveAttribute('data-pending', 'true')
    await expect(page.locator('.bubble.assistant.final').last()).toHaveText('好的，不执行。')
    expect(existsSync(rejectCanary)).toBe(false)

    // 再来一次批准 → 执行
    await send(page, '这次批准')
    const rowA = page.locator('.tool-row[data-call-id="call-a"]')
    await rowA.locator('[data-action="approve"]').click({ timeout: 20_000 })
    await expect(rowA.locator('[data-decision="allowed-once"]')).toContainText('已批准一次', { timeout: 20_000 })
    await expect.poll(() => existsSync(okCanary), { timeout: 30_000 }).toBe(true)
    await expect(rowA).toHaveAttribute('data-status', 'done')
    await expect(page.locator('.bubble.assistant.final').last()).toHaveText('已执行。')
  } finally {
    await env.stop()
  }
})

test('composer：Shift+Enter 换行、IME 组字 Enter 不发送、Enter 发送；停止 → 已停止；草稿按 bot 隔离', async () => {
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const main = (await devState(page)).meta.mainBotId!
    const x = await createViaDialog(page, 'p2-alpha')
    rt.writeScriptCalls(x, [textCall(['第一段回复，', '挂起中'], { gateId: `u21-stop-${Date.now()}` })])
    const composer = page.locator('[data-composer]')

    await composer.fill('第一行')
    await composer.press('Shift+Enter')
    await composer.pressSequentially('第二行')
    expect(await composer.inputValue()).toBe('第一行\n第二行')
    // IME 组字中的 Enter（isComposing）是选词，不发送
    await composer.evaluate((el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })))
    await page.waitForTimeout(300)
    await expect(page.locator('.bubble.user')).toHaveCount(0)
    expect(await composer.inputValue()).toBe('第一行\n第二行')

    // 草稿隔离：切到主 bot composer 为空，切回恢复
    await page.click(`.bot-item[data-session="${main}"]`)
    await expect(composer).toHaveValue('')
    await page.click(`.bot-item[data-session="${x}"]`)
    await expect(composer).toHaveValue('第一行\n第二行')

    await composer.press('Enter')
    await expect(page.locator('.bubble.user')).toHaveText('第一行\n第二行', { timeout: 20_000 })
    await expect(composer).toHaveValue('')
    await expect(page.locator('.bubble.streaming')).toContainText('第一段回复', { timeout: 20_000 })
    const stop = page.locator('[data-action="stop"]')
    await expect(stop).toBeVisible()
    await page.screenshot({ path: join(EVIDENCE, 'streaming-light.png') })
    await stop.click()
    await expect(page.locator('.turn-notice')).toHaveText('已停止', { timeout: 20_000 })
    await expect.poll(async () => (await devState(page)).views[x]?.endReason).toBe('aborted')
    await expect(page.locator('[data-action="send"]')).toBeVisible()
    await expect(page.locator('.bubble.streaming')).toHaveCount(0)
  } finally {
    await env.stop()
  }
})

test('亮/暗截图：侧栏 + 会话（P-A / P-B 存证）', async () => {
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const a = await createViaDialog(page, 'p2-alpha')
    rt.writeScriptCalls(a, [textCall(['你好，我是研究助手。', '这里是一段流式回复，', '已经定稿。'])])
    await send(page, '介绍一下你自己')
    await expect(page.locator('.bubble.assistant.final')).toHaveText('你好，我是研究助手。这里是一段流式回复，已经定稿。', { timeout: 20_000 })
    await createViaDialog(page, 'p2-beta')
    await page.click(`.bot-item[data-session="${a}"]`)
    await page.waitForTimeout(700) // 新建项 600ms 高亮淡出后再截
    mkdirSync(EVIDENCE, { recursive: true })
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
      await page.screenshot({ path: join(EVIDENCE, `shell-${mode}.png`) })
    }
    await page.emulateMedia({ colorScheme: 'light' })
    await page.click('[data-action="new-bot"]')
    await expect(page.locator('[data-preset-option="p2-alpha"]')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(300) // 进场动画 150ms
    await page.screenshot({ path: join(EVIDENCE, 'new-bot-dialog-light.png') })
  } finally {
    await env.stop()
  }
})

// U-26 ③（#11 分页，GU-PDC-A HIGH-2 / D6a）：follow 首窗有限（HISTORY_PAGE=40），窗口外更早历史
// 走 transcript 顶部「加载更早」（session/events + hasMore）；失败只重试该页（failNext 注入 → 重试按钮）。
test('#11 分页：长历史首窗有限，「加载更早」逐页补全；失败只重试该页', async () => {
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
    await expect(page.locator(`[data-pane="${main}"] .bubble.assistant.final`).last()).toHaveText(`a${TURNS}`, { timeout: 120_000 })

    // 重载触发 follow 快照重建：首窗 = 最近 HISTORY_PAGE 条，最早轮次在窗口外
    await page.reload()
    await page.waitForSelector('.shell', { timeout: 30_000 })
    await expect(page.locator(`[data-pane="${main}"] .bubble.assistant.final`).last()).toHaveText(`a${TURNS}`, { timeout: 30_000 })
    const pane = page.locator(`[data-pane="${main}"]`)
    await expect(pane).toContainText(`TURN-${TURNS}`)
    expect(await pane.innerText()).not.toContain('TURN-1-earliest') // 窗口外
    await expect(page.locator('[data-older] [data-action="load-older"]')).toBeVisible()

    // 失败只重试该页：注入一次性失败 → 顶部失败态 + 重试按钮；重试成功补页
    await page.evaluate(() => (window as unknown as { __pbotsDev: { failNext(m: string): void } }).__pbotsDev.failNext('session/events'))
    await page.click('[data-older] [data-action="load-older"]')
    await expect(page.locator('[data-older] [data-action="retry-older"]')).toBeVisible()
    // 逐页点到取尽（hasMore=false → 顶部条消失），最早一轮回到时间线
    for (let i = 0; i < 6; i += 1) {
      const btn = page.locator('[data-older] button')
      if (await btn.count() === 0) break
      await btn.click()
      await page.waitForFunction(() => {
        const bar = document.querySelector('[data-older]')
        return bar === null || bar.querySelector('button') !== null // 本页 loading 结束（按钮回可点或取尽消失）
      })
    }
    await expect(page.locator('[data-older]')).toHaveCount(0)
    await expect(pane).toContainText('TURN-1-earliest')
    await expect(pane).toContainText(`TURN-${TURNS}`) // prepend 不影响窗口内既有内容
  } finally {
    await env.stop()
  }
})
