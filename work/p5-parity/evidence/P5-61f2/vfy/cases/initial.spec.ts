// P5-61.f2 红/绿基线探针（VERIFY-P5-61f1 initial.spec.ts 同法扩展）：暗/亮 reload（冷启首导航注入不到 init script，冷启由录像像素判），
// 每 rAF 采样 html[data-theme] + 4 个控件底色；控件挂上后任何一帧 ≠ 终值即混色。
// 4 个采样控件：composer 药丸、侧栏底部 Connect apps、顶部搜索圆钮、顶部加号（New）圆钮。
import { test, expect } from '/tmp/bot-wt/P5-61f1/app/ui/node_modules/playwright/test'
import { launchProduct, waitProductReady } from '/tmp/bot-wt/P5-61f1/app/ui/tests/support/ui.ts'
import { tmkdir } from '/tmp/bot-wt/P5-61f1/app/ui/tests/support/tmp-sweep.ts'
import { writeFileSync, mkdirSync } from 'node:fs'
const OUT = process.env.P561F2_OUT ?? '/home/lingxufeng/bot/work/p5-parity/evidence/P5-61f2/probe/out'
mkdirSync(OUT, { recursive: true })
const SEL = ['.sand-prompt-shell', '.sand-agents-sidebar__plugins-entry button', '.sand-agents-sidebar > .sand-agents-sidebar__search', '.sand-agents-sidebar__header .sand-kit-icon-button']
type Row = { t: number; theme?: string; cover: string | null; bg: (string | null)[] }
function trace(sel: string[]): void {
  const w = window as unknown as { __initial: Row[] }
  w.__initial = []
  const tick = (): void => {
    const cover = document.querySelector('#pbots-boot')
    w.__initial.push({ t: performance.now(), theme: document.documentElement.dataset.theme, cover: cover ? getComputedStyle(cover).opacity : null, bg: sel.map((s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).backgroundColor : null }) })
    if (w.__initial.length < 300) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
function judge(rows: Row[], label: string): void {
  const stable = rows.at(-1)!.bg
  // 每个控件独立判：一旦挂上（非 null），之后每帧都必须等于终值
  const bad = rows.filter((r) => r.bg.some((v, i) => v !== null && v !== stable[i]))
  writeFileSync(`${OUT}/${label}.json`, JSON.stringify({ stable, badCount: bad.length, bad, rows }, null, 1))
  expect(stable.every((v) => v !== null), `${label} 4 控件都采到`).toBe(true)
  expect(bad, `${label}: 控件挂上后无中间色帧`).toEqual([])
}
for (const mode of ['dark', 'light'] as const) {
  test(`reload ${mode}`, async ({}, info) => {
    const env = await launchProduct({ home: tmkdir('bot-p561f2-') })
    try {
      await env.page.evaluate((m) => (window as unknown as { desktop: { theme: { set(p: string): Promise<unknown> } } }).desktop.theme.set(m), mode)
      await env.page.waitForTimeout(700)
      await env.page.addInitScript(trace, SEL)
      await env.page.reload(); await waitProductReady(env.page)
      await expect(env.page.locator('#pbots-boot')).toHaveCount(0)
      await env.page.waitForTimeout(800)
      judge(await env.page.evaluate(() => (window as unknown as { __initial: Row[] }).__initial), `reload-${mode}-${info.repeatEachIndex}`)
    } finally { await env.stop() }
  })
}
