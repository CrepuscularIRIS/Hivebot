// U-27 视觉打磨 E2E + P5-15 U2 数值断言（work/p5-parity/RE-visual-residual.md 的 fixed 22 项：主表 19 + 规则 5/9/15）。
// 每项 computed-style 断言亮 / 暗各跑一遍（themed）；逐行对照表 = work/p5-parity/evidence/P5-15/u2-table.md。
// 「待回修 P5-15.f<n>」= 断言写的是当前 main 实际值，与 R2（RE-visual-078-values.md，覆盖旧 0.18 规格）不符；
// 偏差与期望值见 work/p5-parity/REPORT-P5-15.md「待回修清单」，回修任务改 css 时同步把断言改成 R2 值。
// 四页亮/暗截图存 gitignored app/ui/test-output/U-27/（U-33）。
import { expect, test, type Locator, type Page } from 'playwright/test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { MARKET_SOURCE_PATCH, serveMarket } from '../support/connectors.ts'
import { PRESETS_PATCH, bashCall, createViaDialog, devState, evidenceOut, launchProduct, send, textCall } from '../support/ui.ts'

const OUT = evidenceOut('U-27')
type Mode = 'light' | 'dark'

// 主题色实测值（当前 main 的 token 解析结果）：--dsw-alias-link（规则 5/9）、--dsw-alias-label-secondary（规则 15）
const LINK: Record<Mode, string> = { light: 'rgb(11, 109, 211)', dark: 'rgb(77, 155, 255)' }
const SECONDARY: Record<Mode, string> = { light: 'rgba(28, 28, 28, 0.68)', dark: 'rgba(245, 245, 245, 0.66)' }

const css = (loc: Locator, props: string[]): Promise<Record<string, string>> =>
  loc.evaluate((el, ps) => Object.fromEntries(ps.map((p) => [p, getComputedStyle(el).getPropertyValue(p)])), props)

/** 亮、暗各切一次主题跑 check（U2 每项 ×2），给了 name 就顺手截图；结束回到亮色。 */
async function themed(page: Page, check: (mode: Mode) => Promise<void>, name?: string): Promise<void> {
  for (const mode of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: mode })
    await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
    await check(mode)
    if (name !== undefined) await page.screenshot({ path: join(OUT, `${name}-${mode}.png`) })
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

/** 规则 15：outcome 单行只活在「已作答 → 工具结果到达」之间，用 MutationObserver 在出现瞬间取 computed。 */
async function approveAndCaptureOutcome(page: Page, card: Locator): Promise<Record<string, string>> {
  await page.evaluate(() => {
    const w = window as unknown as { __u2outcome?: Record<string, string> }
    delete w.__u2outcome
    const mo = new MutationObserver(() => {
      const el = document.querySelector('.approval-outcome')
      if (el === null) return
      const s = getComputedStyle(el)
      w.__u2outcome = { padding: s.padding, 'font-size': s.fontSize, 'line-height': s.lineHeight, color: s.color }
      mo.disconnect()
    })
    mo.observe(document.body, { childList: true, subtree: true })
  })
  await card.locator('[data-action="approve"]').click()
  const h = await page.waitForFunction(() => (window as unknown as { __u2outcome?: Record<string, string> }).__u2outcome, null, { timeout: 20_000 })
  return (await h.jsonValue())!
}

test('侧栏 / 会话 / 审批 / info-pane：U2 fixed 项亮暗数值断言 + 条件显示 + 截图', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    await env.shell.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 820) })
    const x = await createViaDialog(page, 'standard')
    await expect.poll(async () => (await devState(page)).views[x]?.cwd).toBeTruthy()
    const cwd = (await devState(page)).views[x]!.cwd!
    const gate = `p5-15-working-${Date.now()}`
    rt.writeScriptCalls(x, [
      textCall(['你好，下面是一段示例代码：\n\n```ts\nconst answer = 42\n```\n']),
      bashCall(`touch ${join(cwd, 'u27-canary')}`, 'call-v'), textCall(['已执行。', '收尾'], { gateId: gate }),
      bashCall(`touch ${join(cwd, 'u2-canary')}`, 'call-w'), textCall(['完成。']),
    ])
    await send(page, '给个例子')
    await expect(page.locator('.bubble.assistant.final')).toContainText('示例代码', { timeout: 20_000 })

    const item = page.locator(`.bot-item[data-session="${x}"]`)
    await expect(item.locator('time[data-updated]')).toHaveText('刚刚') // A8（文案，无数值）
    await expect(page.locator('.sidebar-head .grok-mark')).toHaveCount(0) // A1：头部无品牌位
    await themed(page, async () => {
      // A1 待回修 P5-15.f1（→P5-11）：R2 头部 = icon 行 min-height titlebar-block、padding 12 16；main 只有 38 高空拖拽区
      expect.soft(await css(page.locator('.sidebar-head'), ['height', 'padding']), 'A1').toEqual({ height: '38px', padding: '0px' })
      expect.soft(await css(page.locator('.bot-list'), ['padding']), 'A3').toEqual({ padding: '4px 12px 24px' })
      // A4 待回修 P5-15.f2（→P5-16）：R2 固定高 54、无 min-height 58
      expect.soft(await css(item, ['min-height', 'padding']), 'A4').toEqual({ 'min-height': '58px', padding: '8px' })
      expect.soft((await item.boundingBox())!.height, 'A4 实高').toBeGreaterThanOrEqual(58)
      // A5（gap 待回修 P5-15.f2：R2 §0.1 A4 行 gap 8）
      expect.soft(await css(item, ['display', 'grid-template-columns', 'column-gap']), 'A5').toEqual({
        display: 'grid', 'grid-template-columns': expect.stringMatching(/^34px /), 'column-gap': '9px',
      })
      // A6：保持 34。R2 推断 32 未实测（R2 局限 3），待 R3 / Q-014，不按 32 改
      expect.soft(Math.round((await item.locator('.avatar').boundingBox())!.width), 'A6').toBe(34)
      expect.soft(await css(page.locator('.sidebar > .resizer'), ['right', 'width']), 'A18').toEqual({ right: '-6px', width: '12px' })
      expect.soft(await css(page.locator('.chat-col'), ['row-gap']), 'B1').toEqual({ 'row-gap': '22px' })
      expect.soft(await css(page.locator('.chat-col'), ['padding', 'max-width']), 'B2').toEqual({ padding: '28px 30px', 'max-width': '750px' })
      expect.soft(await css(page.locator('.composer'), ['padding', 'border-radius']), 'B10 shell').toEqual({ padding: '9px', 'border-radius': '16px' })
      expect.soft(await css(page.locator('[data-composer]'), ['min-height']), 'B10 输入').toEqual({ 'min-height': '48px' })
      expect.soft(await css(page.locator('.composer-wrap'), ['padding-bottom']), 'B10 dock').toEqual({ 'padding-bottom': '18px' })
      expect.soft(await css(page.locator('.code-wrap [data-action="copy-code"]'), ['top', 'right', 'opacity']), 'B15').toEqual({ top: '6px', right: '6px', opacity: '0' })
    }, 'chat')
    await themed(page, async (mode) => {
      expect.soft(await css(page.locator('html'), ['font-synthesis', 'color-scheme']), 'E3').toEqual({ 'font-synthesis': 'none', 'color-scheme': mode })
    })

    // B6 待回修 P5-15.f3（→P5-16）/ B8 待回修 P5-15.f4（→P5-31）：断言为 main 现值（0.18 规格），R2 值见 REPORT
    await send(page, '执行一下')
    const row = page.locator('.tool-row[data-call-id="call-v"]')
    const card = row.locator('.approval-card')
    await expect(card).toBeVisible({ timeout: 20_000 })
    const B6_COLLAPSED = 'matrix(0.707107, -0.707107, 0.707107, 0.707107, 0, 0)'
    const B6_OPEN = 'matrix(0.707107, 0.707107, -0.707107, 0.707107, 0, 0)'
    const b6b8 = async (chevron: string): Promise<void> => {
      expect.soft(await css(row.locator('.tool-card'), ['border-top-width', 'border-top-left-radius']), 'B6 卡').toEqual({ 'border-top-width': '1px', 'border-top-left-radius': '9px' })
      expect.soft(await css(row.locator('.tool-line'), ['min-height', 'padding']), 'B6 行').toEqual({ 'min-height': '34px', padding: '7px 9px' })
      expect.soft(await css(row.locator('.tool-chevron'), ['width', 'height', 'transform']), 'B6 chevron').toEqual({ width: '6px', height: '6px', transform: chevron })
      expect.soft(await css(card, ['border-top-left-radius', 'padding']), 'B8 卡').toEqual({ 'border-top-left-radius': '10px', padding: '14px 16px' })
      expect.soft(await css(card.locator('[data-action="approve"]'), ['padding', 'border-top-left-radius']), 'B8 钮').toEqual({ padding: '6px 9px', 'border-top-left-radius': '6px' })
    }
    await themed(page, () => b6b8(B6_COLLAPSED))
    await row.locator('.tool-line').click()
    await expect(row.locator('.tool-line')).toHaveAttribute('aria-expanded', 'true')
    await expect(row.locator('.tool-chevron')).toHaveCSS('transform', B6_OPEN) // 等 100ms 旋转过渡走完
    await themed(page, async () => {
      await b6b8(B6_OPEN)
      expect.soft(await css(row.locator('.tool-detail'), ['padding', 'max-height']), 'B6 detail').toEqual({ padding: '0px 10px 10px 25px', 'max-height': '220px' })
    }, 'approval')

    // 规则 15（亮）：作答后卡收成 outcome 单行 → 工具结果到达后由 tool-decision 接手
    const outcome: Record<Mode, Record<string, string>> = { light: await approveAndCaptureOutcome(page, card), dark: {} }
    await expect(row.locator('[data-decision="allowed-once"]')).toBeVisible({ timeout: 20_000 })
    await expect(row.locator('.approval-card')).toHaveCount(0)

    // 规则 5 / 9：收尾文本被 gate 挂住 → 运行中、无待批 → 侧栏 accent 副行 + 会话头 Working 小标
    const working = page.locator('[data-working]')
    await expect(working).toHaveText('回复中', { timeout: 20_000 })
    await expect(item.locator('.bot-sub.accent')).toHaveText('回复中')
    await themed(page, async (mode) => {
      expect.soft(await css(item.locator('.bot-sub.accent'), ['color']), '规则 5').toEqual({ color: LINK[mode] })
      expect.soft(await css(working, ['color', 'font-size']), '规则 9').toEqual({ color: LINK[mode], 'font-size': '12px' })
    })
    mkdirSync(join(rt.home, 'gates'), { recursive: true })
    writeFileSync(join(rt.home, 'gates', gate), '')
    await expect(working).toHaveCount(0, { timeout: 20_000 })

    // 规则 15（暗）：第二张卡在暗色下作答
    await page.emulateMedia({ colorScheme: 'dark' })
    await send(page, '再来一次')
    const card2 = page.locator('.tool-row[data-call-id="call-w"] .approval-card')
    await expect(card2).toBeVisible({ timeout: 20_000 })
    outcome.dark = await approveAndCaptureOutcome(page, card2)
    await expect(working).toHaveCount(0, { timeout: 20_000 })
    await page.emulateMedia({ colorScheme: 'light' })
    for (const mode of ['light', 'dark'] as const) {
      expect.soft(outcome[mode], `规则 15 ${mode}`).toEqual({ padding: '8px 0px', 'font-size': '13px', 'line-height': '18.2px', color: SECONDARY[mode] })
    }

    // C1/C2：info-pane 280–480、头部左 12、关闭钮 chevrons-right
    await page.click('[data-action="toggle-info-pane"]')
    const pane = page.locator('[data-info-pane]')
    await expect(pane).toBeVisible()
    await expect(pane.locator('.pane-head [aria-label="关闭配置栏"] .icon')).toHaveText(String.fromCodePoint(0xf31d))
    await themed(page, async () => {
      const r = pane.locator('.resizer')
      expect.soft([await r.getAttribute('aria-valuemin'), await r.getAttribute('aria-valuemax')], 'C1 范围').toEqual(['280', '480'])
      expect.soft(await css(pane, ['width']), 'C1 初始').toEqual({ width: '320px' })
      expect.soft(await css(pane.locator('.pane-head'), ['padding-left']), 'C2').toEqual({ 'padding-left': '12px' })
    }, 'settings')

    // A14：断线 → 侧栏 roster 断线态（列表保留）。只杀测试自己 spawn 的 runtime 子进程。
    rt.child.kill('SIGTERM')
    await expect(page.locator('[data-roster-state="unreachable"]')).toBeVisible({ timeout: 15_000 })
    await expect(item).toBeVisible()
    await page.screenshot({ path: join(OUT, 'roster-unreachable-light.png') })
  } finally {
    await env.stop()
  }
})

test('市场：D4 搜索框 r8 / h32 / padding 0 9；D6 行 padding 12 / min-h 56 / 行距 7；亮暗', async () => {
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
    const main = page.locator('[data-market-list] .m-main').first()
    await themed(page, async () => {
      expect.soft(await css(page.locator('.m-search'), ['border-top-left-radius', 'height', 'padding']), 'D4').toEqual({
        'border-top-left-radius': '8px', height: '32px', padding: '0px 9px',
      })
      expect.soft(await css(page.locator('[data-market-list]'), ['row-gap']), 'D6 行距').toEqual({ 'row-gap': '7px' })
      expect.soft(await css(main, ['padding', 'min-height', 'column-gap']), 'D6 行').toEqual({ padding: '12px', 'min-height': '56px', 'column-gap': '12px' })
      expect.soft(Math.round((await main.locator('.avatar').boundingBox())!.width), 'D6 头像').toBe(36)
    }, 'market')
  } finally {
    await shell.stop()
    await rt.stop()
    await server.close()
  }
})
