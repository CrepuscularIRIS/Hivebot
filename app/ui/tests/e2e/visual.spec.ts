// U-27 视觉打磨 E2E（work/p4-ui/RE-visual-audit.md 差异清单）：组件规格抽查 = 审计后的 0.18 值；
// 条件显示（Working 小标 / 已决审批 outcome 单行 / roster 断线态）；四页亮/暗截图存 gitignored app/ui/test-output/U-27/（U-33）。
import { expect, test, type Locator, type Page } from 'playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { MARKET_SOURCE_PATCH, serveMarket } from '../support/connectors.ts'
import { PRESETS_PATCH, bashCall, createViaDialog, devState, evidenceOut, launchProduct, send, textCall } from '../support/ui.ts'

const OUT = evidenceOut('U-27')

const css = (loc: Locator, props: string[]): Promise<Record<string, string>> =>
  loc.evaluate((el, ps) => Object.fromEntries(ps.map((p) => [p, getComputedStyle(el).getPropertyValue(p)])), props)

async function shoot(page: Page, name: string): Promise<void> {
  for (const mode of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: mode })
    await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
    await page.screenshot({ path: join(OUT, `${name}-${mode}.png`) })
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

test('侧栏 / 会话 / 审批 / info-pane：0.18 规格抽查 + 条件显示 + 亮暗截图', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    await env.shell.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 820) })
    const x = await createViaDialog(page, 'standard')
    await expect.poll(async () => (await devState(page)).views[x]?.cwd).toBeTruthy()
    const cwd = (await devState(page)).views[x]!.cwd!
    rt.writeScriptCalls(x, [
      textCall(['你好，下面是一段示例代码：\n\n```ts\nconst answer = 42\n```\n']),
      bashCall(`touch ${join(cwd, 'u27-canary')}`, 'call-v'), textCall(['已执行。']),
    ])
    await send(page, '给个例子')
    await expect(page.locator('.bubble.assistant.final')).toContainText('示例代码', { timeout: 20_000 })

    // A4–A6/A8：项 ≥58、grid 三列 gap 9、padding 8、头像 34、trailing 相对时间
    const item = page.locator(`.bot-item[data-session="${x}"]`)
    expect(await css(item, ['display', 'grid-template-columns', 'column-gap', 'padding', 'min-height'])).toEqual({
      display: 'grid', 'grid-template-columns': expect.stringMatching(/^34px /), 'column-gap': '9px', padding: '8px', 'min-height': '58px',
    })
    expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(58)
    expect(Math.round((await item.locator('.avatar').boundingBox())!.width)).toBe(34)
    await expect(item.locator('time[data-updated]')).toHaveText('刚刚')
    await expect(page.locator('.sidebar-head .grok-mark')).toHaveCount(0) // A1：头部无品牌位
    expect(await css(page.locator('.bot-list'), ['padding'])).toEqual({ padding: '4px 12px 24px' })
    // B1/B2：行距 22、内容列 690
    expect(await css(page.locator('.chat-col'), ['row-gap', 'padding-top'])).toEqual({ 'row-gap': '22px', 'padding-top': '28px' })
    // B10：prompt-shell 9 / r16，输入 ≥48
    expect(await css(page.locator('.composer'), ['padding', 'border-radius'])).toEqual({ padding: '9px', 'border-radius': '16px' })
    expect(await css(page.locator('[data-composer]'), ['min-height'])).toEqual({ 'min-height': '48px' })
    // B15：代码块 copy 钮
    await expect(page.locator('.code-wrap [data-action="copy-code"]')).toHaveCount(1)
    await shoot(page, 'chat')

    // B6/B8：tool 行描边卡 r9；审批卡 r10 / 14 16 / 按钮 6 9 r6；Working 小标（运行中）
    await send(page, '执行一下')
    const row = page.locator('.tool-row[data-call-id="call-v"]')
    const card = row.locator('.approval-card')
    await expect(card).toBeVisible({ timeout: 20_000 })
    expect(await css(row.locator('.tool-card'), ['border-top-width', 'border-top-left-radius'])).toEqual({ 'border-top-width': '1px', 'border-top-left-radius': '9px' })
    expect(await css(row.locator('.tool-line'), ['min-height', 'padding'])).toEqual({ 'min-height': '34px', padding: '7px 9px' })
    expect(await css(card, ['border-top-left-radius', 'padding'])).toEqual({ 'border-top-left-radius': '10px', padding: '14px 16px' })
    expect(await css(card.locator('[data-action="approve"]'), ['padding', 'border-top-left-radius'])).toEqual({ padding: '6px 9px', 'border-top-left-radius': '6px' })
    await expect(page.locator('[data-working]')).toHaveText('回复中')
    await row.locator('.tool-line').click()
    await expect(row.locator('.tool-line')).toHaveAttribute('aria-expanded', 'true')
    await shoot(page, 'approval')

    // B8 条件显示：作答后卡收成 outcome 单行 → 工具结果到达后由 tool-decision 接手
    await card.locator('[data-action="approve"]').click()
    await expect(row.locator('[data-decision="allowed-once"]')).toBeVisible({ timeout: 20_000 })
    await expect(row.locator('.approval-card')).toHaveCount(0)
    await expect(page.locator('[data-working]')).toHaveCount(0, { timeout: 20_000 })

    // C1/C2：info-pane 280–480、头部左 12、关闭钮 chevrons-right
    await page.click('[data-action="toggle-info-pane"]')
    const pane = page.locator('[data-info-pane]')
    await expect(pane).toBeVisible()
    await expect(pane.locator('.resizer')).toHaveAttribute('aria-valuemax', '480')
    expect(await css(pane.locator('.pane-head'), ['padding-left'])).toEqual({ 'padding-left': '12px' })
    await expect(pane.locator('.pane-head [aria-label="关闭配置栏"] .icon')).toHaveText(String.fromCodePoint(0xf31d))
    await shoot(page, 'settings')

    // A14：断线 → 侧栏 roster 断线态（列表保留）。只杀测试自己 spawn 的 runtime 子进程。
    rt.child.kill('SIGTERM')
    await expect(page.locator('[data-roster-state="unreachable"]')).toBeVisible({ timeout: 15_000 })
    await expect(item).toBeVisible()
    await page.screenshot({ path: join(OUT, 'roster-unreachable-light.png') })
  } finally {
    await env.stop()
  }
})

test('市场：行 36 / gap 12 / padding 12 / 行距 7；搜索框 r8；亮暗截图', async () => {
  test.setTimeout(120_000)
  const server = await serveMarket()
  const rt = await launchSdkRuntime({
    patch: `${MARKET_SOURCE_PATCH}:${PRESETS_PATCH}:${fakeOverlayPath()}`,
    cwd: mkdtempSync(join(tmpdir(), 'bot-u27-ws-')),
    env: { P2SDK_MARKET_SOURCE_INDEXES: `${server.realUrl} ${server.localUrl}` },
  })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const { page } = shell
    await page.waitForSelector('.shell', { timeout: 30_000 })
    await shell.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 820) })
    await page.click('[data-action="market"]')
    await expect.poll(() => page.textContent('[data-market-count]'), { timeout: 20_000 }).toBe('已加载 50 / 111')
    expect(await css(page.locator('[data-market-list]'), ['row-gap'])).toEqual({ 'row-gap': '7px' })
    const main = page.locator('[data-market-list] .m-main').first()
    expect(await css(main, ['padding', 'column-gap'])).toEqual({ padding: '12px', 'column-gap': '12px' })
    expect(Math.round((await main.locator('.avatar').boundingBox())!.width)).toBe(36)
    expect(await css(page.locator('.m-search'), ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '8px' })
    await shoot(page, 'market')
  } finally {
    await shell.stop()
    await rt.stop()
    await server.close()
  }
})
