# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: red.probe.ts >> reload dark
- Location: ../../../../../home/lingxufeng/bot/work/p5-parity/evidence/P5-61f2/vfy/red.probe.ts:31:7

# Error details

```
Error: reload-dark-1: 控件挂上后无中间色帧

expect(received).toEqual(expected) // deep equality

- Expected  -   1
+ Received  + 211

- Array []
+ Array [
+   Object {
+     "bg": Array [
+       null,
+       "rgb(252, 252, 252)",
+       "rgb(252, 252, 252)",
+       "rgb(252, 252, 252)",
+     ],
+     "cover": "1",
+     "t": 62,
+     "theme": undefined,
+   },
+   Object {
+     "bg": Array [
+       null,
+       "rgb(252, 252, 252)",
+       "rgb(252, 252, 252)",
+       "rgb(252, 252, 252)",
+     ],
+     "cover": "1",
+     "t": 81.90000000596046,
+     "theme": "cursor-dark",
+   },
+   Object {
+     "bg": Array [
+       null,
+       "rgb(252, 252, 252)",
+       "rgb(252, 252, 252)",
+       "rgb(252, 252, 252)",
+     ],
+     "cover": "0.599832",
+     "t": 86.30000001192093,
+     "theme": "cursor-dark",
+   },
+   Object {
+     "bg": Array [
+       "rgb(31, 31, 31)",
+       "rgb(249, 249, 249)",
+       "rgb(221, 221, 221)",
+       "rgb(221, 221, 221)",
+     ],
+     "cover": "0.366758",
+     "t": 103.90000000596046,
+     "theme": "cursor-dark",
+   },
+   Object {
+     "bg": Array [
+       "rgb(31, 31, 31)",
+       "rgb(225, 225, 225)",
+       "rgb(176, 176, 176)",
+       "rgb(176, 176, 176)",
+     ],
+     "cover": "0.223634",
+     "t": 113.90000000596046,
+     "theme": "cursor-dark",
+   },
+   Object {
+     "bg": Array [
+       "rgb(31, 31, 31)",
+       "rgb(178, 178, 178)",
+       "rgb(135, 135, 135)",
+       "rgb(135, 135, 135)",
+     ],
+     "cover": "0.133584",
+     "t": 131.19999998807907,
+     "theme": "cursor-dark",
+   },
+   Object {
+     "bg": Array [
+       "rgb(31, 31, 31)",
+       "rgb(141, 141, 141)",
+       "rgb(100, 100, 100)",
+       "rgb(100, 100, 100)",
+     ],
+     "cover": "0.0758102",
+     "t": 148.09999999403954,
+     "theme": "cursor-dark",
+   },
+   Object {
+     "bg": Array [
+       "rgb(31, 31, 31)",
+       "rgb(115, 115, 115)",
+       "rgb(70, 70, 70)",
+       "rgb(70, 70, 70)",
+     ],
+     "cover": "0.0395357",
+     "t": 163.90000000596046,
+     "theme": "cursor-dark",
+   },
+   Object {
+     "bg": Array [
+       "rgb(31, 31, 31)",
+       "rgb(96, 96, 96)",
+       "rgb(47, 47, 47)",
+       "rgb(47, 47, 47)",
+     ],
+     "cover": "0.0178127",
+     "t": 180.90000000596046,
+     "theme": "cursor-dark",
+   },
+   Object {
+     "bg": Array [
+       "rgb(31, 31, 31)",
+       "rgb(82, 82, 82)",
+       "rgb(34, 34, 34)",
+       "rgb(34, 34, 34)",
+     ],
+     "cover": "0.00588799",
+     "t": 197.69999998807907,
+     "theme": "cursor-dark",
+   },
+   Object {
+     "bg": Array [
+       "rgb(31, 31, 31)",
+       "rgb(70, 70, 70)",
+       "rgb(31, 31, 31)",
+       "rgb(31, 31, 31)",
+     ],
+     "cover": "0.000724293",
+     "t": 214.59999999403954,
+     "theme": "cursor-dark",
+   },
+   Object {
+     "bg": Array [
+       "rgb(31, 31, 31)",
+       "rgb(61, 61, 61)",
+       "rgb(31, 31, 31)",
+       "rgb(31, 31, 31)",
+     ],
+     "cover": "0",
+     "t": 230.80000001192093,
+     "theme": "cursor-dark",
+   },
+   Object {
+     "bg": Array [
+       "rgb(31, 31, 31)",
+       "rgb(54, 54, 54)",
+       "rgb(31, 31, 31)",
+       "rgb(31, 31, 31)",
+     ],
+     "cover": null,
+     "t": 248,
+     "theme": "cursor-dark",
+   },
+   Object {
+     "bg": Array [
+       "rgb(31, 31, 31)",
+       "rgb(48, 48, 48)",
+       "rgb(31, 31, 31)",
+       "rgb(31, 31, 31)",
+     ],
+     "cover": null,
+     "t": 264.40000000596046,
+     "theme": "cursor-dark",
+   },
+   Object {
+     "bg": Array [
+       "rgb(31, 31, 31)",
+       "rgb(43, 43, 43)",
+       "rgb(31, 31, 31)",
+       "rgb(31, 31, 31)",
+     ],
+     "cover": null,
+     "t": 280.80000001192093,
+     "theme": "cursor-dark",
+   },
+   Object {
+     "bg": Array [
+       "rgb(31, 31, 31)",
+       "rgb(39, 39, 39)",
+       "rgb(31, 31, 31)",
+       "rgb(31, 31, 31)",
+     ],
+     "cover": null,
+     "t": 298,
+     "theme": "cursor-dark",
+   },
+   Object {
+     "bg": Array [
+       "rgb(31, 31, 31)",
+       "rgb(36, 36, 36)",
+       "rgb(31, 31, 31)",
+       "rgb(31, 31, 31)",
+     ],
+     "cover": null,
+     "t": 314.30000001192093,
+     "theme": "cursor-dark",
+   },
+   Object {
+     "bg": Array [
+       "rgb(31, 31, 31)",
+       "rgb(34, 34, 34)",
+       "rgb(31, 31, 31)",
+       "rgb(31, 31, 31)",
+     ],
+     "cover": null,
+     "t": 330.69999998807907,
+     "theme": "cursor-dark",
+   },
+   Object {
+     "bg": Array [
+       "rgb(31, 31, 31)",
+       "rgb(32, 32, 32)",
+       "rgb(31, 31, 31)",
+       "rgb(31, 31, 31)",
+     ],
+     "cover": null,
+     "t": 347.19999998807907,
+     "theme": "cursor-dark",
+   },
+ ]
```

# Test source

```ts
  1  | // P5-61.f2 红/绿基线探针（VERIFY-P5-61f1 initial.spec.ts 同法扩展）：暗/亮 reload（冷启首导航注入不到 init script，冷启由录像像素判），
  2  | // 每 rAF 采样 html[data-theme] + 4 个控件底色；控件挂上后任何一帧 ≠ 终值即混色。
  3  | // 4 个采样控件：composer 药丸、侧栏底部 Connect apps、顶部搜索圆钮、顶部加号（New）圆钮。
  4  | import { test, expect } from '/tmp/bot-wt/P5-61f1/app/ui/node_modules/playwright/test'
  5  | import { launchProduct, waitProductReady } from '/home/lingxufeng/bot/work/p5-parity/evidence/P5-61f2/vfy/old-src/app/ui/tests/support/ui.ts'
  6  | import { tmkdir } from '/home/lingxufeng/bot/work/p5-parity/evidence/P5-61f2/vfy/old-src/app/ui/tests/support/tmp-sweep.ts'
  7  | import { writeFileSync, mkdirSync } from 'node:fs'
  8  | const OUT = process.env.P561F2_OUT ?? '/home/lingxufeng/bot/work/p5-parity/evidence/P5-61f2/probe/out'
  9  | mkdirSync(OUT, { recursive: true })
  10 | const SEL = ['.sand-prompt-shell', '.sand-agents-sidebar__plugins-entry button', '.sand-agents-sidebar > .sand-agents-sidebar__search', '.sand-agents-sidebar__header .sand-kit-icon-button']
  11 | type Row = { t: number; theme?: string; cover: string | null; bg: (string | null)[] }
  12 | function trace(sel: string[]): void {
  13 |   const w = window as unknown as { __initial: Row[] }
  14 |   w.__initial = []
  15 |   const tick = (): void => {
  16 |     const cover = document.querySelector('#pbots-boot')
  17 |     w.__initial.push({ t: performance.now(), theme: document.documentElement.dataset.theme, cover: cover ? getComputedStyle(cover).opacity : null, bg: sel.map((s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).backgroundColor : null }) })
  18 |     if (w.__initial.length < 300) requestAnimationFrame(tick)
  19 |   }
  20 |   requestAnimationFrame(tick)
  21 | }
  22 | function judge(rows: Row[], label: string): void {
  23 |   const stable = rows.at(-1)!.bg
  24 |   // 每个控件独立判：一旦挂上（非 null），之后每帧都必须等于终值
  25 |   const bad = rows.filter((r) => r.bg.some((v, i) => v !== null && v !== stable[i]))
  26 |   writeFileSync(`${OUT}/${label}.json`, JSON.stringify({ stable, badCount: bad.length, bad, rows }, null, 1))
  27 |   expect(stable.every((v) => v !== null), `${label} 4 控件都采到`).toBe(true)
> 28 |   expect(bad, `${label}: 控件挂上后无中间色帧`).toEqual([])
     |                                       ^ Error: reload-dark-1: 控件挂上后无中间色帧
  29 | }
  30 | for (const mode of ['dark', 'light'] as const) {
  31 |   test(`reload ${mode}`, async ({}, info) => {
  32 |     const env = await launchProduct({ home: tmkdir('bot-p561f2-') })
  33 |     try {
  34 |       await env.page.evaluate((m) => (window as unknown as { desktop: { theme: { set(p: string): Promise<unknown> } } }).desktop.theme.set(m), mode)
  35 |       await env.page.waitForTimeout(700)
  36 |       await env.page.addInitScript(trace, SEL)
  37 |       await env.page.reload(); await waitProductReady(env.page)
  38 |       await expect(env.page.locator('#pbots-boot')).toHaveCount(0)
  39 |       await env.page.waitForTimeout(800)
  40 |       judge(await env.page.evaluate(() => (window as unknown as { __initial: Row[] }).__initial), `reload-${mode}-${info.repeatEachIndex}`)
  41 |     } finally { await env.stop() }
  42 |   })
  43 | }
  44 | 
```