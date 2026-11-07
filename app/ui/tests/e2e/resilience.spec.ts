// U-22 断线路径加固 E2E（GU-U21 清单 1–4；注入走 tests/support/throwing-bridge.mjs；P5-54 起跑在 renderer-grok 上）：
// [GU-1] main 抛错注入：shim roster 重试循环活着、页面不崩；侧栏 New 的 create 抛错不留半截 bot、入口仍可用；
// [GU-2] send 失败：0.18 composer 草稿回收（recoverDraft）；[GU-4] 断线重连后重拉 roster（reload 后未 follow 的 bot 不再恒显运行中）。
// [GU-3]（停止失败复位）随旧 renderer 的停止钮退役：0.18 无停止入口（REPORT-P5-54 差异表 → P5-55）。
import { expect, test, type Page } from 'playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EVIDENCE, MAIN_TITLE, botItem, composer, createBots, devState, finalAssistant, launchProduct, openBot, send, textCall, waitProductReady,
} from '../support/ui.ts'

const BRIDGE = join(__dirname, '..', 'support', 'throwing-bridge.mjs')
const running = (page: Page, title: string) => botItem(page, title).locator('.sand-agent-item__corner-dot [data-status="working"]')

test('[GU-1] pbots:api 全路径注入抛错：roster 重试循环活着、页面不崩', async () => {
  const env = await launchProduct({ ready: false, env: { PBOTS_SPIKE_BRIDGE: BRIDGE, PBOTS_THROW_API: 'all' } })
  try {
    const { page } = env
    // 循环活着 = main 侧桥的调用记录持续增长（卡死 = 首次抛错即停摆，计数恒 1）
    await expect.poll(async () => {
      const calls = await env.shell.app.evaluate(() => (globalThis as unknown as { __throwingBridge?: { calls: string[] } }).__throwingBridge?.calls.filter((m) => m === 'session/list').length)
      return calls
    }, { timeout: 8_000 }).toBeGreaterThanOrEqual(3)
    await expect(page.locator('.sand-shell')).toBeVisible() // 壳在、不白屏不崩
    expect(await page.evaluate(() => (document.body.innerText.match(/Couldn't render this/g) ?? []).length)).toBe(0)
    expect(await page.evaluate(() => 1 + 1)).toBe(2) // renderer 事件循环未被未捕获异常打死
  } finally {
    await env.stop()
  }
})

test('[GU-1] 侧栏 New 的 create 抛错：不留半截 bot、入口仍可用、页面不崩', async () => {
  const env = await launchProduct({ env: { PBOTS_SPIKE_BRIDGE: BRIDGE, PBOTS_THROW_API: 'create-after-first' } })
  try {
    const { page } = env // boot 主 bot 首调 create 透传 → 正常进入
    const before = (await devState(page)).order
    const newBtn = page.locator('.sand-agents-sidebar__header button[aria-label="New"]')
    await newBtn.click()
    // 第二次 create（本次 New → 对话框 Create）→ main 抛错 → shim api 兜底 !ok → 对话框内报错、不入列表（D7）
    const dlg = page.locator('dialog[data-dialog="new-bot"]')
    await dlg.getByRole('textbox', { name: 'Bot name' }).fill('GU') // T30：Create 需名字
    await dlg.locator('[data-action="create-bot"]').click()
    await expect(dlg.locator('[role="alert"]')).toContainText("Couldn't create the bot", { timeout: 15_000 })
    expect((await devState(page)).order).toEqual(before)
    await dlg.getByRole('button', { name: 'Cancel' }).click()
    await expect(dlg).toHaveCount(0)
    await expect(page.locator('.sand-agent-item')).toHaveCount(before.length)
    await expect(newBtn).toBeEnabled()
    await expect(botItem(page, MAIN_TITLE)).toBeVisible()
    expect(await page.screenshot({ path: join(EVIDENCE, 'gu1-create-throws.png') })).toBeTruthy()
  } finally {
    await env.stop()
  }
})

test('[GU-2] send 失败：草稿回收到 composer，不丢原文', async () => {
  test.setTimeout(120_000) // rpc 超时窗口（30s）+ 启动
  const env = await launchProduct()
  try {
    const { page, rt } = env
    await createBots(page, [{ title: 'GU2-X', preset: 'p2-alpha' }])
    await openBot(page, 'GU2-X')
    // 真实失败注入：杀 runtime → dsh rpc 等待 ready 至 30s 超时 → {ok:false, pbots/unavailable}
    rt.child.kill('SIGTERM')
    await send(page, '待发送的原文本')
    // 发送在途期间 composer 置 disabled（contenteditable=false），失败后回收草稿并恢复可编辑
    const editor = page.locator('.sand-prompt-shell .ProseMirror')
    await expect.poll(async () => (await editor.innerText()).trim(), { timeout: 60_000 }).toBe('待发送的原文本')
    // 在途的 M1 调用（dsh rpc 等 ready 至 30s 超时）落定后 composer 恢复可编辑，可重试
    await expect(composer(page)).toBeVisible({ timeout: 45_000 })
    expect(await finalAssistant(page).count()).toBe(0) // 未发出、无回复
  } finally {
    await env.stop()
  }
})

test('[GU-4] 断线重连后重拉 roster：reload 后未 follow 的 bot 不再恒显运行中', async () => {
  const env = await launchProduct()
  try {
    const { page, rt, shell } = env
    const [x] = await createBots(page, [{ title: 'GU4-X', preset: 'p2-alpha' }])
    await openBot(page, 'GU4-X')
    const gateId = `u22-g4-${Date.now()}`
    rt.writeScriptCalls(x!, [textCall(['x-流式第一段 ', 'x-流式收尾'], { gateId, paceMs: 60 })])
    await send(page, '请回复')
    await expect.poll(async () => (await devState(page)).views[x!]?.running, { timeout: 20_000 }).toBe(true)

    // reload：选中主 bot 后重载 → X 成为「未打开的 bot」，运行态只来自 boot 的 roster（running=true）
    await openBot(page, MAIN_TITLE)
    await page.reload()
    await waitProductReady(page)
    await expect(running(page, 'GU4-X')).toHaveCount(1, { timeout: 20_000 })
    expect((await devState(page)).views[x!]).toBeUndefined() // 未 follow

    // 断链（真实重连路径）→ 放 gate（turn 在 server 侧结束；renderer 断线中收不到 emit）
    const sessionsBefore = await page.evaluate(() => (window as unknown as { __pbotsDev: { sessions: number } }).__pbotsDev.sessions)
    await shell.app.evaluate(() => (globalThis as unknown as { __pbotsM2?: { testDropSocket(): void } }).__pbotsM2!.testDropSocket())
    mkdirSync(join(rt.home, 'gates'), { recursive: true })
    writeFileSync(join(rt.home, 'gates', gateId), '')
    // 重连完成（新一代 socket）+ open 重拉 roster → running=false
    await expect.poll(() => page.evaluate(() => (window as unknown as { __pbotsDev: { sessions: number } }).__pbotsDev.sessions), { timeout: 20_000 })
      .toBeGreaterThan(sessionsBefore)
    await expect(running(page, 'GU4-X')).toHaveCount(0, { timeout: 20_000 })
    expect(await page.screenshot({ path: join(EVIDENCE, 'gu4-reconnect-roster.png') })).toBeTruthy()
    // 恢复后 transcript 一致性：切回 X 是完整定稿（follow 快照重放）
    await openBot(page, 'GU4-X')
    await expect(finalAssistant(page).last()).toHaveText('x-流式第一段 x-流式收尾', { timeout: 20_000 })
    expect((await devState(page)).views[x!]?.streaming ?? null).toBe(null)
  } finally {
    await env.stop()
  }
})
