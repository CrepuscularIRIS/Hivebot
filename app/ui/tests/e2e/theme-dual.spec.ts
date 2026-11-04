// P5-58 ① 双主题质量收口：全 UI 部件亮暗逐面对照（真实 Electron + Xvfb）。
// - 路径 A `page.emulateMedia` / 路径 B Electron `nativeTheme.themeSource` 双路翻转 `html[data-theme]`
//   （P6-03 OBS：暗色 composer / Plugins 按钮浅底字不清，疑 emulateMedia 过渡或真缺陷——两路都审，双路一致红 = 真缺陷）；
// - 机械对比度审计：固定部件清单的「文字色 vs 合成底色」WCAG 比率（祖先链 alpha 合成），
//   普通文本 ≥4.5，图标钮 / ≥18px / ≥14px 粗体 ≥3.0；
// - 逐部件亮暗成对截图 evidence（cmp-<部件>.{light,dark}.png + compare.html 并排索引）。
// 市场面（market overlay）归 P5-57，不在本表——其主题问题记 REPORT-P5-58 待合并后补。
import { expect, test, type Page } from 'playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bashCall, createBots, evidenceOut, finalAssistant, launchProduct, openBot, permissionDock, reasoningTextCall, send, textCall } from '../support/ui.ts'

const OUT = evidenceOut('P5-58')
type Mode = 'light' | 'dark'

/** 对比度审计目标：sel 元素的直接文字色 vs 合成底色；icon=true → 阈值 3.0。 */
const TARGETS: Array<{ id: string; sel: string; icon?: boolean }> = [
  { id: '侧栏头图标钮', sel: '.sand-agents-sidebar__header button' },
  { id: '侧栏条目名', sel: '.sand-agent-item__name' },
  { id: 'Plugins 药丸', sel: '.sand-agents-sidebar__plugins-entry button', icon: true },
  { id: '正文', sel: '.sand-transcript-row[data-role="assistant"] .sand-message-prose p' },
  { id: '正文链接', sel: '.sand-message-prose a' },
  { id: '代码块', sel: '.sand-message-prose pre' },
  { id: 'thinking 行', sel: '.sand-outline-item[data-kind="thinking"] .sand-outline-item__row' },
  { id: '工具行预览', sel: '.sand-outline-item[data-kind="tool-call"] .sand-outline-item__preview' },
  { id: '审批卡标题', sel: '[aria-label="Local tool permissions"] strong' },
  { id: '审批卡命令', sel: '[aria-label="Local tool permissions"] pre[data-pbots="ask-command"]' },
  { id: '审批 Allow once', sel: '[aria-label="Local tool permissions"] button:not([aria-label^="Deny"])' },
  { id: '审批 Deny once', sel: '[aria-label="Local tool permissions"] button[aria-label^="Deny"]' },
  { id: 'composer 输入区', sel: '.sand-prompt-shell' },
  { id: 'composer 编辑器', sel: '.sand-prompt-shell .ProseMirror' },
  { id: '发送钮', sel: 'button[aria-label="Send message"]', icon: true },
  { id: 'info pane 标题', sel: 'aside.sand-info-pane[data-open] .sand-info-pane__section-heading' },
  { id: '时间分隔', sel: '.sand-transcript-time-separator' },
  { id: 'chat header 标题', sel: '.sand-chat-header' },
  { id: '设置面板标题', sel: '.sand-settings-panel > h2' },
  { id: '设置导航项', sel: '.sand-settings-nav__item[data-active]' },
  { id: '搜索面板输入', sel: '.sand-command-palette > input' },
]

/** 截图部件清单（亮暗成对）。 */
const SHOTS: Array<{ id: string; sel: string }> = [
  { id: 'sidebar', sel: '.sand-agents-sidebar' },
  { id: 'agent-item', sel: '.sand-agent-item' },
  { id: 'plugins-entry', sel: '.sand-agents-sidebar__plugins-entry' },
  { id: 'chat-header', sel: '.sand-chat-header' },
  { id: 'transcript', sel: '.sand-virtual-transcript' },
  { id: 'prose', sel: '.sand-transcript-row[data-role="assistant"] .sand-message-prose' },
  { id: 'thinking-row', sel: '.sand-outline-item[data-kind="thinking"]' },
  { id: 'tool-row', sel: '.sand-outline-item[data-kind="tool-call"]' },
  { id: 'approval-card', sel: '[aria-label="Local tool permissions"]' },
  { id: 'composer', sel: '.sand-prompt-shell' },
  { id: 'info-pane', sel: 'aside.sand-info-pane[data-open]' },
]

/** 页内审计：sel 元素文字色 vs 合成底色（沿祖先链把 rgba 压到 html 底色上）的 WCAG 比率。 */
const AUDIT = (targets: typeof TARGETS): Array<{ id: string; ratio: number; fg: string; bg: string; size: string; weight: string }> => {
  const blend = (over: [number, number, number, number], under: [number, number, number]): [number, number, number] =>
    [0, 1, 2].map((i) => Math.round(over[i] * over[3] + under[i] * (1 - over[3]))) as [number, number, number]
  const parse = (c: string): [number, number, number, number] | null => {
    const m = /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/.exec(c)
    if (!m) return null
    return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
  }
  const effectiveBg = (el: Element): [number, number, number] => {
    let acc: [number, number, number] = [255, 255, 255] // html 之下若有透明：压到白底（浏览器画布底）
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n)
      let c = parse(cs.backgroundColor)
      if (c === null && cs.backgroundImage !== 'none') {
        const g = /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/.exec(cs.backgroundImage)
        c = g ? [Number(g[1]), Number(g[2]), Number(g[3]), g[4] === undefined ? 1 : Number(g[4])] : null
      }
      if (c !== null && c[3] > 0.999) return blend(c, acc)
      if (c !== null && c[3] > 0) acc = blend(c, acc)
    }
    return acc
  }
  const lum = ([r, g, b]: [number, number, number]): number => {
    const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const out: Array<{ id: string; ratio: number; fg: string; bg: string; size: string; weight: string }> = []
  for (const t of targets) {
    const el = document.querySelector(t.sel)
    if (el === null || !(el instanceof HTMLElement)) continue
    const cs = getComputedStyle(el)
    const fg = parse(cs.color)
    if (fg === null) continue
    const bg = effectiveBg(el)
    const l1 = lum([fg[0], fg[1], fg[2]])
    const l2 = lum(bg)
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    out.push({ id: t.id, ratio: Math.round(ratio * 100) / 100, fg: cs.color, bg: `rgb(${bg.join(',')})`, size: cs.fontSize, weight: cs.fontWeight })
  }
  return out
}

/** 根变量诊断行：两模式下关键底色 token（mixed-cascade 排查用）。 */
async function rootVarsLine(page: Page, mode: Mode): Promise<string> {
  const vars = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    return ['--sand-bg-base', '--sand-bg-subtle', '--sand-bg-elevated', '--sand-fill-elevated', '--sand-fill-bubble-agent', '--sand-fill-secondary-solid', '--cursor-base', '--cursor-bg-input-surface'].map((v) => `${v}=${cs.getPropertyValue(v).trim()}`).join(' ')
  })
  return `ROOTVARS\t${mode}\t${vars}`
}

/** 等「样式真翻转 + 已画出来」：P6-03 OBS 复盘——attribute 断言过、compositor 帧还没换，
 * 立即截图会拍到旧帧（整帧亮色，正是「暗色下 composer/Plugins 浅底」的假象来源）。
 * 等 --sand-bg-base 变到目标值 + 两个 rAF，旧帧不可能再出现。 */
async function settle(page: Page, mode: Mode): Promise<void> {
  const expected = mode === 'dark' ? '#070707' : '#fcfcfc'
  await page.waitForFunction((exp) => {
    void requestAnimationFrame(() => requestAnimationFrame(() => {}))
    return getComputedStyle(document.documentElement).getPropertyValue('--sand-bg-base').trim() === exp
  }, expected, { timeout: 5_000 })
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

/** 一个模式下：截图成对 + 审计。返回 [{id,ratio,…}]。 */
async function capture(page: Page, mode: Mode): Promise<{ audit: ReturnType<typeof AUDIT>; vars: string }> {
  await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
  await settle(page, mode)
  for (const s of SHOTS) {
    const el = page.locator(s.sel).first()
    if (await el.count() > 0 && await el.isVisible().catch(() => false)) await el.screenshot({ path: join(OUT, `cmp-${s.id}.${mode}.png`) })
  }
  await page.screenshot({ path: join(OUT, `cmp-window.${mode}.png`) })
  const audit = await page.evaluate(AUDIT, TARGETS)
  const vars = await rootVarsLine(page, mode)
  return { audit, vars }
}

test('P5-58① 双主题：emulateMedia / nativeTheme 双路翻转 + 逐部件亮暗对照 + 对比度审计 ≥4.5（图标 3.0）', async () => {
  test.setTimeout(240_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    await env.shell.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 820) })
    const [x] = await createBots(page, [{ title: 'T58-X', preset: 'standard' }])
    await openBot(page, 'T58-X')
    rt.writeScriptCalls(x!, [
      reasoningTextCall('先想一下示例。', '你好，这是一段示例，详见 [文档](https://example.com)：\n\n```ts\nconst answer = 42\n```\n'),
      bashCall('true', 'call-t58'), textCall(['已执行。']),
    ])
    await send(page, '给个例子')
    await expect(finalAssistant(page).last()).toContainText('示例', { timeout: 20_000 })
    await send(page, '执行一下')
    await expect(permissionDock(page)).toBeVisible({ timeout: 20_000 })
    await page.click('button[aria-label="View agent settings"]')
    await expect(page.locator('aside.sand-info-pane[data-open]')).toBeVisible()
    // composer 留草稿：发送钮存在（空 composer 只有 mic 钮）+ 截图带真实文字
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await editor.click()
    await page.keyboard.type('草稿', { delay: 5 })

    // 路径 A：emulateMedia（P6-03 取证用的同一路）
    await page.emulateMedia({ colorScheme: 'light' })
    const capLight = await capture(page, 'light')
    await page.emulateMedia({ colorScheme: 'dark' })
    const capDark = await capture(page, 'dark')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cursor-light')

    // overlay 面（设置 / 搜索面板）：开着截亮暗两份 + 审计，再关掉——主题翻转对 overlay 同样生效
    const OVERLAY_IDS = ['设置面板标题', '设置导航项', '搜索面板输入']
    const overlayTargets = TARGETS.filter((t) => OVERLAY_IDS.includes(t.id))
    const overlayAudit: Record<Mode, ReturnType<typeof AUDIT>> = { light: [], dark: [] }
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await settle(page, mode)
      await page.click('button[aria-label="Account"]')
      await page.locator('[role="menuitem"]', { hasText: 'Settings' }).click()
      await expect(page.locator('.sand-settings-panel')).toBeVisible()
      await page.screenshot({ path: join(OUT, `cmp-settings-window.${mode}.png`) })
      overlayAudit[mode].push(...await page.evaluate(AUDIT, overlayTargets.filter((t) => t.id !== '搜索面板输入')))
      await page.locator('.sand-settings-panel__close').click()
      await page.click('button[aria-label="Search"]')
      await expect(page.locator('.sand-command-palette')).toBeVisible()
      await page.locator('.sand-command-palette').screenshot({ path: join(OUT, `cmp-search-palette.${mode}.png`) })
      overlayAudit[mode].push(...await page.evaluate(AUDIT, overlayTargets.filter((t) => t.id === '搜索面板输入')))
      await page.keyboard.press('Escape')
    }
    await page.emulateMedia({ colorScheme: 'light' })
    for (const mode of ['light', 'dark'] as const) {
      for (const r of overlayAudit[mode]) expect.soft(r.ratio, `${mode} ${r.id} 对比度 ${r.fg} on ${r.bg}`).toBeGreaterThanOrEqual(4.5)
      expect.soft(overlayAudit[mode].length, `${mode} overlay 审计 3 项目标齐`).toBe(overlayTargets.length)
    }

    // 路径 B：Electron nativeTheme（系统主题路径；emulateMedia 先复位为跟随原生）
    await page.emulateMedia({ colorScheme: null })
    await env.shell.app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cursor-dark')
    await settle(page, 'dark')
    await page.locator('.sand-prompt-shell').first().screenshot({ path: join(OUT, 'cmp-composer.native-dark.png') })
    await page.locator('.sand-agents-sidebar__plugins-entry button').first().screenshot({ path: join(OUT, 'cmp-plugins-entry.native-dark.png') })
    const nativeDark = await page.evaluate(AUDIT, [TARGETS.find((t) => t.id === 'Plugins 药丸')!, TARGETS.find((t) => t.id === 'composer 输入区')!])
    // 复位用显式 light（宿主 GTK 可能偏好暗：themeSource='system' 在本机会解析为 dark）
    await env.shell.app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cursor-light')

    // 审计断言：目标必须存在，且比率达标（普通文本 4.5；icon/大字 3.0）
    const rows = ['id\tratio(light)\tratio(dark)\tfg(light)\tbg(light)\tfg(dark)\tbg(dark)\tsize\tweight']
    for (const t of TARGETS.filter((x) => !OVERLAY_IDS.includes(x.id))) {
      const l = capLight.audit.find((r) => r.id === t.id)
      const d = capDark.audit.find((r) => r.id === t.id)
      expect.soft(l, `light ${t.id} 审计目标存在（sel=${t.sel}）`).toBeDefined()
      expect.soft(d, `dark ${t.id} 审计目标存在（sel=${t.sel}）`).toBeDefined()
      if (l !== undefined && d !== undefined) {
        rows.push([t.id, String(l.ratio), String(d.ratio), l.fg, l.bg, d.fg, d.bg, l.size, l.weight].join('\t'))
        for (const [mode, r] of [['light', l], ['dark', d]] as const) {
          const big = t.icon === true || parseFloat(r.size) >= 24 || (parseFloat(r.size) >= 18.66 && (r.weight === 'bold' || Number(r.weight) >= 700))
          expect.soft(r.ratio, `${mode} ${t.id} 对比度 ${r.fg} on ${r.bg} @${r.size}/${r.weight}`).toBeGreaterThanOrEqual(big ? 3 : 4.5)
        }
      }
    }
    for (const r of nativeDark) {
      expect.soft(r.ratio, `native-dark ${r.id} 对比度 ${r.fg} on ${r.bg}`).toBeGreaterThanOrEqual(r.id.includes('composer') ? 4.5 : 3)
    }
    writeFileSync(join(OUT, 'contrast.tsv'), `${rows.join('\n')}\n${capLight.vars}\n${capDark.vars}\n${overlayAudit.light.map((r) => `overlay\tlight\t${r.id}\t${r.ratio}\t${r.fg}\t${r.bg}`).join('\n')}\n${overlayAudit.dark.map((r) => `overlay\tdark\t${r.id}\t${r.ratio}\t${r.fg}\t${r.bg}`).join('\n')}\n`)

    // 并排索引（file:// 打开即亮暗对照）
    const compareIds = [...SHOTS.map((s) => s.id), 'settings-window', 'search-palette', 'window']
    const cells = compareIds.flatMap((id) => {
      const cell = (m: string): string => `<figure><figcaption>${id} · ${m}</figcaption><img src="cmp-${id}.${m}.png"></figure>`
      return `<section><h2>${id}</h2>${cell('light')}${cell('dark')}</section>`
    }).join('\n')
    writeFileSync(join(OUT, 'compare.html'), `<!doctype html><meta charset="utf8"><title>P5-58 亮暗对照</title>
<style>body{background:#888}section{display:flex;gap:8px;align-items:flex-start;margin:12px}figure{margin:0}img{border:1px solid #000;max-width:640px;display:block}figcaption{font:12px monospace;color:#eee}</style>
<h1>P5-58 亮暗逐部件对照</h1>\n${cells}\n`)
  } finally {
    await env.stop()
  }
})
