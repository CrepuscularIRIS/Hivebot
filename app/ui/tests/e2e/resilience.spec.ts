// U-22 断线路径加固 E2E（GU-U21 清单 1–4；注入走 tests/support/throwing-bridge.mjs）：
// [GU-1] main 抛错注入：start() 重试循环活着（不卡封面）、新建对话框不卡「创建中」；
// [GU-2] send 失败保留草稿、不覆盖等待期新输入；[GU-3] cancelTurn 失败 stopping 复位；
// [GU-4] 断线重连后重拉 bot 列表（reload 后未 follow 的 bot 不再恒显「回复中」）。
import { expect, test } from 'playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EVIDENCE, bashCall, createViaDialog, devState, launchProduct, send, textCall } from '../support/ui.ts'

const BRIDGE = join(__dirname, '..', 'support', 'throwing-bridge.mjs')

test('[GU-1] pbots:api 全路径注入抛错：封面循环活着、页面不崩', async () => {
  const env = await launchProduct({ ready: false, env: { PBOTS_SPIKE_BRIDGE: BRIDGE, PBOTS_THROW_API: 'all' } })
  try {
    const { page } = env
    // 循环活着 = main 侧桥的调用记录持续增长（卡死 = 首次抛错即停摆，计数恒 1）
    await expect.poll(async () => {
      const calls = await env.shell.app.evaluate(() => (globalThis as unknown as { __throwingBridge?: { calls: string[] } }).__throwingBridge?.calls.filter((m) => m === 'session/list').length)
      return calls
    }, { timeout: 8_000 }).toBeGreaterThanOrEqual(3)
    await expect(page.locator('[data-boot-cover]')).toBeVisible() // 仍在启动封面（starting），不白屏不崩
    expect(await page.evaluate(() => 1 + 1)).toBe(2) // renderer 事件循环未被未捕获异常打死
  } finally {
    await env.stop()
  }
})

test('[GU-1] 对话框 create 抛错：按钮回「创建」可用、错误可见（不卡创建中）', async () => {
  const env = await launchProduct({ env: { PBOTS_SPIKE_BRIDGE: BRIDGE, PBOTS_THROW_API: 'create-after-first' } })
  try {
    const { page } = env
    await page.waitForSelector('.shell', { timeout: 30_000 }) // boot 主 bot 首调 create 透传 → 正常进入
    await page.click('[data-action="new-bot"]')
    await page.locator('[data-preset-option="p2-alpha"] input').check({ timeout: 15_000 })
    await page.click('[data-action="create-bot"]')
    const create = page.locator('[data-action="create-bot"]')
    // 第二次 create（本对话框）→ main 抛错 → api() 兜底 !ok → busy 复位（修复前：永久「创建中…」disabled）
    await expect(create).not.toHaveText(/创建中/, { timeout: 10_000 })
    await expect(create).toBeEnabled()
    await expect(page.locator('.form-error')).toContainText('创建失败')
    await expect(page.locator('dialog[data-dialog="new-bot"]')).toBeVisible() // 对话框可继续操作（取消可点）
    await page.locator('.modal-actions .btn.secondary').click()
    await expect(page.locator('dialog[data-dialog="new-bot"]')).toBeHidden()
  } finally {
    await env.stop()
  }
})

test('[GU-2] send 失败：恢复草稿；等待期有新输入则不覆盖、原文本进错误提示', async () => {
  test.setTimeout(120_000) // 两个 rpc 超时窗口（30s each）+ 启动
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const composer = page.locator('[data-composer]')
    const x = await createViaDialog(page, 'p2-alpha')

    // 真实失败注入：杀 runtime → dsh rpc 等待 ready 至 30s 超时 → {ok:false, pbots/unavailable}
    rt.child.kill('SIGTERM')

    // 场景 1：等待期输入新文本 → 失败返回不覆盖新输入，原文本在错误提示里
    await composer.fill('第一条：待发送的原文本')
    await composer.press('Enter')
    await composer.fill('等待期的新输入') // rpc 超时窗口内的新输入
    await expect(page.locator('.composer-error')).toContainText('发送失败', { timeout: 40_000 })
    await expect(composer).toHaveValue('等待期的新输入') // 未被原文本覆盖
    await expect(page.locator('.composer-error')).toContainText('第一条：待发送的原文本') // 原文不丢
    expect(await page.locator('.bubble.user').count()).toBe(0) // 未发出

    // 场景 2：等待期无新输入 → 草稿恢复原文（错误提示无「新内容」后缀）
    await composer.fill('第二条：会恢复的文本')
    await composer.press('Enter')
    await expect(page.locator('.composer-error')).toContainText('发送失败', { timeout: 40_000 })
    await expect(page.locator('.composer-error')).not.toContainText('草稿已有新内容')
    await expect(composer).toHaveValue('第二条：会恢复的文本') // 恢复
  } finally {
    await env.stop()
  }
})

test('[GU-3] cancelTurn 失败：stopping 复位（按钮可再点）+ 错误提示', async () => {
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const x = await createViaDialog(page, 'p2-alpha')
    rt.writeScriptCalls(x, [textCall(['挂起中的回复'], { gateId: `u22-g3-${Date.now()}` })])
    await send(page, '请回复')
    const stop = page.locator('[data-action="stop"]')
    await expect(stop).toBeVisible({ timeout: 20_000 })

    // 真实失败注入：runtime 死 → session/cancel 的 rpc 30s 超时 → !ok（修复前路径：reject 无 catch → 永久 disabled）
    rt.child.kill('SIGTERM')
    await stop.click()
    await expect(stop).toBeEnabled({ timeout: 40_000 }) // setStopping(false) 复位
    await expect(page.locator('.composer-error')).toContainText('停止失败')
    await expect(stop).toBeEnabled() // 可再次尝试
  } finally {
    await env.stop()
  }
})

test('[GU-4] 断线重连后重拉 roster：reload 后未 follow 的 bot 不再恒显「回复中」', async () => {
  const env = await launchProduct()
  try {
    const { page, rt, shell } = env
    const x = await createViaDialog(page, 'p2-alpha')
    const gateId = `u22-g4-${Date.now()}`
    rt.writeScriptCalls(x, [textCall(['x-流式第一段 ', 'x-流式收尾'], { gateId, paceMs: 60 })])
    await send(page, '请回复')
    const itemX = page.locator(`.bot-item[data-session="${x}"]`)
    await expect(itemX).toHaveAttribute('data-running', 'true', { timeout: 20_000 })

    // reload：followed 清空 → X 成为「未打开的 bot」，运行态只来自 boot 的 roster（running=true）
    await page.reload()
    await page.waitForSelector('.shell', { timeout: 30_000 })
    const xAfter = page.locator(`.bot-item[data-session="${x}"]`)
    await expect(xAfter).toHaveAttribute('data-running', 'true', { timeout: 20_000 })

    // 断链（真实重连路径）→ 放 gate（turn 在 server 侧结束；renderer 断线中收不到 emit）
    await shell.app.evaluate(() => (globalThis as unknown as { __pbotsM2?: { testDropSocket(): void } }).__pbotsM2!.testDropSocket())
    mkdirSync(join(rt.home, 'gates'), { recursive: true })
    writeFileSync(join(rt.home, 'gates', gateId), '')
    await page.waitForSelector('.offline-bar', { timeout: 10_000, state: 'attached' })
    // 重连完成（offline bar 消失）+ [GU-4] open 重拉 roster → running=false
    await expect(xAfter).not.toHaveAttribute('data-running', 'true', { timeout: 20_000 })
    expect(await page.screenshot({ path: join(EVIDENCE, 'gu4-reconnect-roster.png') })).toBeTruthy()
    // 恢复后 transcript 一致性：切回 X 是完整定稿（重挂 follow 快照重放）
    await xAfter.click()
    await expect(page.locator(`[data-pane="${x}"] .bubble.assistant.final`)).toHaveText('x-流式第一段 x-流式收尾', { timeout: 20_000 })
    expect((await devState(page)).views[x]?.streaming ?? null).toBe(null)
  } finally {
    await env.stop()
  }
})
