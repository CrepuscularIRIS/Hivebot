// B2.2 e2e：发送失败卡（RE-DRAFT-SEND-1.1.0.md 规格）。
// 注入：__pbotsDev.failNext('session/prompt') 拦生产 sendPrompt → shim 落 refused →
// composer 覆盖层失败卡（data-pbots-draft-failure=refused）+ Retry/Discard 动作。
// 文案锚：cCCVzA "Didn't go through" / lDjxmT "Failed to send" / +zYUxF "Discard"。
import { expect, test } from 'playwright/test'
import { EVIDENCE, devState, launchProduct, send } from '../support/ui'

test('B2.2 ① 发送失败 → 失败卡可见（refused）→ Retry 成功后卡消', async ({ page }) => {
  const env = await launchProduct()
  const p = env.page
  // 注入：下一次 session/prompt 失败
  await p.evaluate(() => (window as unknown as { __pbotsDev: { failNext(m: string): void } }).__pbotsDev.failNext('session/prompt'))
  // 发送（send 走 composer 发送钮）
  await send(p, '这条会失败')
  // 失败卡出现（role=alert + data-pbots-draft-failure=refused）
  const card = p.locator('[data-pbots-draft-failure="refused"]')
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card).toContainText("Didn't go through")
  await p.screenshot({ path: `${EVIDENCE}/b2-failure-card-refused.png` })
  // Retry（注入已消耗——重发成功）
  await card.locator('button', { hasText: 'Retry' }).click()
  await expect(card).toHaveCount(0, { timeout: 15_000 }) // 成功→unconfirmed→回执清空
  await p.screenshot({ path: `${EVIDENCE}/b2-failure-card-retry-ok.png` })
  await env.stop()
})

test('B2.2 ② 失败卡 Discard → 卡消失、状态清空', async ({ page }) => {
  const env = await launchProduct()
  const p = env.page
  await p.evaluate(() => (window as unknown as { __pbotsDev: { failNext(m: string): void } }).__pbotsDev.failNext('session/prompt'))
  await send(p, '这条也会失败')
  const card = p.locator('[data-pbots-draft-failure="refused"]')
  await expect(card).toBeVisible({ timeout: 15_000 })
  // Discard → 卡消失 + pbotsUi 状态清空
  await card.locator('button', { hasText: 'Discard' }).click()
  await expect(card).toHaveCount(0, { timeout: 10_000 })
  const main = (await devState(p)).meta.mainBotId!
  const st = await p.evaluate((id: string) => (window as unknown as { pbotsUi?: { draftSendState(a: string): unknown } }).pbotsUi?.draftSendState(id), main)
  expect(st).toBeUndefined()
  await env.stop()
})
