// T74：气泡宽度塌陷——agent 短回复「done」被 fit-content 父链压成 24px 竖排；user 窄
// 窗同病。四格（DPR2 亮暗）：短回复单行 / user 窄窗单行 / 长回复封顶 min(80%,560,−82) /
// hover 动作钮不丢（anchor relative 依赖）。
import { expect, test, type Page } from 'playwright/test'
import { join, resolve } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { textCall, waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const UI_ROOT = resolve(__dirname, '..', '..')
const PRESETS_PATCH = join(UI_ROOT, '..', 'sdk', 'profile', 'patches', 'presets.yml')
const LONG_REPLY = 'The border system uses four translucent hairline tokens keyed by strength. Primary marks focus and hover on the composer frame. Secondary is the resting frame of menus, dialogs and tooltips. Tertiary carries structural separators like the sidebar edge. Quaternary traces the glass ring around agent bubbles. Shadows are literal black at low alpha and vanish entirely in dark mode, where depth comes only from these half-pixel strokes.'
const OUT = '/home/lingxufeng/bot/work/ui-quality/evidence/T74'
const HIDPI = ['--force-device-scale-factor=2']

const geo = (page: Page, sel: string, which: 'first' | 'last' = 'first'): Promise<{ bubble: DOMRect; text: DOMRect; anchor: DOMRect; colW: number }> =>
  page.locator(sel)[which]().evaluate((el) => {
    const bubble = el.getBoundingClientRect()
    const prose = el.querySelector('.sand-message-prose') ?? el
    const range = document.createRange()
    range.selectNodeContents(prose)
    const text = range.getBoundingClientRect()
    const anchor = (el.closest('.sand-message-action-anchor') as HTMLElement)?.getBoundingClientRect()
    const row = (el.closest('.sand-message-action-anchor')?.parentElement as HTMLElement)?.getBoundingClientRect().width ?? 0
    return { bubble, text, anchor: anchor ?? bubble, colW: row }
  })

test('T74：气泡贴内容宽（短回复单行/user 窄窗/长回复封顶/hover 钮）', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, cwd: tmkdir('bot-t74-ws-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, extraArgs: HIDPI })
  try {
    const page = shell.page
    expect(await page.evaluate(() => devicePixelRatio), 'DPR=2 前提').toBe(2)
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    const send = async (text: string): Promise<void> => {
      const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
      await editor.click()
      await page.keyboard.type(text, { delay: 3 })
      await page.click('button[aria-label="Send message"]')
    }

    // ---- ① agent 短回复 done：单行、气泡贴内容宽 ----
    rt.writeScriptCalls(sid!, [textCall(['done'])])
    await send('hi')
    const short = page.locator('.sand-message[data-role="assistant"]')
    await expect(short.first()).toContainText('done', { timeout: 60_000 })
    const g1 = await geo(page, '.sand-message[data-role="assistant"]')
    const lineH = 20, padY = 14 // 7 上下
    expect(g1.bubble.height, `短回复单行（高 ${g1.bubble.height}）`).toBeLessThanOrEqual(lineH + padY + 2)
    expect(g1.bubble.width, `气泡宽 ${g1.bubble.width} ≥ 文本 ${g1.text.width} + 左右 padding 24 − 1`).toBeGreaterThanOrEqual(g1.text.width + 24 - 1)
    expect(g1.bubble.width, '塌陷修复（旧值 ~24）').toBeGreaterThan(g1.text.width)
    expect(g1.bubble.width, `短回复贴内容（宽 ${g1.bubble.width} ≤ 文本 ${g1.text.width} + 24 + 2——Sol 复审：防定宽 anchor 撑出空宽）`).toBeLessThanOrEqual(g1.text.width + 24 + 2)
    await page.screenshot({ path: join(OUT, 'short.light.png') })

    // ---- ② user 消息窄窗 + info pane 开（经理复现条件）：单行 ----
    await page.setViewportSize({ width: 800, height: 700 })
    await page.click('button[aria-label="View agent settings"]')
    await expect(page.locator('aside.sand-info-pane[data-open]')).toBeVisible()
    rt.writeScriptCalls(sid!, [textCall(['ok'])])
    await send('Hello, give me a sample reply')
    await expect(page.locator('.sand-message[data-role="user"]').last()).toContainText('sample reply', { timeout: 30_000 })
    // 审①：目标消息=last；info pane 保持开。口径修正：窄窗（row 内容宽≈210、封顶
    // min(80%)=168）下这句 33 字符必然折行——**两行是正确排版**（修前的病=5 行碎断）；
    // 断言 ≤2 行 + 气泡宽恰为封顶值（不塌不溢）。
    await page.screenshot({ path: join(OUT, 'user-narrow-debug.png'), fullPage: false })
    // 布局稳定门：流式中间态会瞬时取 min-content 解（实测 35px 假塌）——poll 到
    // 宽≥封顶一半再量，真塌（恒 35）超时失败仍可抓。
    await expect.poll(async () => (await geo(page, '.sand-message[data-role="user"]', 'last')).bubble.width, { timeout: 10_000 }).toBeGreaterThan(100)
    const g2 = await geo(page, '.sand-message[data-role="user"]', 'last')
    expect(g2.bubble.height, `user 窄窗 ≤2 行（高 ${g2.bubble.height}）`).toBeLessThanOrEqual(lineH * 2 + padY + 2)
    expect(Math.abs(g2.bubble.width - Math.min(g2.colW * 0.8, 560)), `气泡宽=封顶值（${g2.bubble.width}）`).toBeLessThanOrEqual(2)
    await page.screenshot({ path: join(OUT, 'user-narrow.light.png') })
    // 窄窗下的长回复（agent）——经理返修②：铺满脚本(防 no scripted call 错误行)+
    // poll 到封顶值±2(流式中间态宽度渐增,poll 收敛即「等流式结束」;上下界都在,塌了超时红)
    rt.writeScriptCalls(sid!, Array.from({ length: 10 }, () => textCall([LONG_REPLY])))
    await send('narrow long')
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: 'hairline' }).last()).toBeVisible({ timeout: 60_000 })
    const narrowCap = async (): Promise<number> => {
      const g = await geo(page, '.sand-message[data-role="assistant"]', 'last')
      return Math.min(g.colW * 0.8, 560)
    }
    await expect.poll(async () => Math.abs((await geo(page, '.sand-message[data-role="assistant"]', 'last')).bubble.width - (await narrowCap())), { timeout: 30_000 }).toBeLessThanOrEqual(2)
    const g2b = await geo(page, '.sand-message[data-role="assistant"]', 'last')
    expect(g2b.bubble.width, `窄窗长气泡≈封顶（${g2b.bubble.width}）`).toBeGreaterThan(100)
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(400)
    // 审①：暗色补几何断言（短+user）+user-narrow.dark 截图
    const gd1 = await geo(page, '.sand-message[data-role="assistant"]', 'first')
    expect(gd1.bubble.height, '暗色短回复仍单行').toBeLessThanOrEqual(lineH + padY + 2)
    const gd2 = await geo(page, '.sand-message[data-role="user"]', 'last')
    expect(gd2.bubble.height, '暗色 user 仍 ≤2 行').toBeLessThanOrEqual(lineH * 2 + padY + 2)
    const gd3 = await geo(page, '.sand-message[data-role="assistant"]', 'last')
    expect(Math.abs(gd3.bubble.width - Math.min(gd3.colW * 0.8, 560)), '暗色窄窗长气泡≈封顶(经理返修②)').toBeLessThanOrEqual(2)
    await page.screenshot({ path: join(OUT, 'user-narrow.dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.waitForTimeout(300)

    // ---- ③ agent 长回复：封顶 min(80% 容器, 560, 容器−82) ±2 ----
    await page.setViewportSize({ width: 1280, height: 800 })
    rt.writeScriptCalls(sid!, Array.from({ length: 8 }, () => textCall([LONG_REPLY]))) // 游标漂移——铺满
    await send('long please')
    const long = page.locator('.sand-message[data-role="assistant"]', { hasText: 'hairline' }).last()
    await expect(long).toBeVisible({ timeout: 60_000 })
    const g3 = await geo(page, '.sand-message[data-role="assistant"]', 'last') // 长气泡（最后一条）
    const cap3 = Math.min(g3.colW * 0.8, 560)
    expect(Math.abs(g3.bubble.width - cap3), `长回复封顶（气泡 ${g3.bubble.width} vs 期望 ${cap3}）`).toBeLessThanOrEqual(2)
    await page.screenshot({ path: join(OUT, 'long.light.png') })

    // ---- ④ hover agent 气泡：More message actions 可见（anchor relative 未丢） ----
    await page.locator('.sand-message[data-role="assistant"]').last().hover()
    const more = page.locator('button[aria-label="More message actions"], [aria-label="More message actions"]').first()
    await expect(more).toBeVisible({ timeout: 5_000 })

    // ---- 暗色一轮（短回复 + 长回复）----
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, 'short.dark.png') })
    await page.screenshot({ path: join(OUT, 'long.dark.png') })
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
