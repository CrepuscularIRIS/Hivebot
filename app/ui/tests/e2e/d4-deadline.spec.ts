// U-22 ⑥ D4 观察窗口终态 E2E（PLAN U-22 ④ D4③；U-16 的 2×deadline 可证伪）：
// renderer 离场（closeEvents 关 boot $events 流）→ main 侧 eventsStreams 清空 → 无人应答窗口累计
// → deadline 到 → main 代答 'rejected'（同 Peer）→ session 侧工具被拒 → follow 流推
// approval/decided + tool/result isError → 界面显示「已拒绝」终态 + 行 failed；全程副作用文件不存在。
import { expect, test } from 'playwright/test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { EVIDENCE, bashCall, createViaDialog, devState, launchProduct, send, textCall } from '../support/ui.ts'

test('D4③：观察窗口（2×deadline）内终态 = rejected（deadline 代答）；副作用全程不存在', async () => {
  // deadline 窗口用 env 压短（生产默认 20s = 2×10s PORT_TRANSFER_TIMEOUT_MS，语义见 m2-mux/deadline.ts）
  const env = await launchProduct({ env: { PBOTS_APPROVAL_DEADLINE_MS: '2500' } })
  try {
    const { page, rt, shell } = env
    const x = await createViaDialog(page, 'standard') // standard 带 bash + shell-ask（SPIKE §7）
    await expect.poll(async () => (await devState(page)).views[x]?.cwd).toBeTruthy()
    const cwd = (await devState(page)).views[x]!.cwd!
    const canary = join(cwd, 'canary-d4')
    rt.writeScriptCalls(x, [
      bashCall(`touch ${canary}`, 'call-d4'), textCall(['已按拒绝处理。']),
    ])

    await send(page, '请执行')
    const row = page.locator('.tool-row[data-call-id="call-d4"]')
    await expect(page.locator('[data-approval-card]')).toBeVisible({ timeout: 20_000 })
    expect(existsSync(canary)).toBe(false) // 待决期副作用不存在

    // renderer 离场注入：关 boot $events 流（main 侧 eventsStreams 清空 → 窗口开始累计；follow 仍在）
    await page.evaluate(() => (window as unknown as { __pbotsDev: { closeEvents(): void } }).__pbotsDev.closeEvents())

    // deadline（2.5s）后 main 代答 → ledger 下账 + stats 计数（可证伪：deadline 坏则恒 0）
    await expect.poll(async () => await shell.app.evaluate(
      () => (globalThis as unknown as { __pbotsM2?: { stats: { deadline: { answers: number } } } }).__pbotsM2!.stats.deadline.answers,
    ), { timeout: 15_000 }).toBe(1)

    // 界面终态（decided rejected + 行 failed + 卡收掉 + 回复继续）——窗口内完成
    await expect(row.locator('[data-decision="rejected"]')).toContainText('已拒绝', { timeout: 20_000 })
    await expect(row).toHaveAttribute('data-status', 'failed')
    await expect(page.locator('[data-approval-card]')).toHaveCount(0)
    await expect(page.locator('.bubble.assistant.final').last()).toHaveText('已按拒绝处理。', { timeout: 20_000 })
    expect(existsSync(canary)).toBe(false) // 全程未执行（每阶段断言，非仅末态）
    expect(await page.screenshot({ path: join(EVIDENCE, 'd4-deadline-rejected.png') })).toBeTruthy()
  } finally {
    await env.stop()
  }
})
