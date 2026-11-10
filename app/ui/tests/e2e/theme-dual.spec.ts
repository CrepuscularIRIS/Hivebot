// P5-58 ① 双主题质量收口：全 UI 部件亮暗逐面对照（真实 Electron + Xvfb）。
// - 路径 A `page.emulateMedia` / 路径 B Electron `nativeTheme.themeSource` 双路翻转 `html[data-theme]`
//   （P6-03 OBS：暗色 composer / Plugins 按钮浅底字不清，疑 emulateMedia 过渡或真缺陷——两路都审，双路一致红 = 真缺陷）；
// - 机械对比度审计：固定部件清单的「文字色 vs 合成底色」WCAG 比率，
//   普通文本 ≥4.5，图标钮 / ≥18px / ≥14px 粗体 ≥3.0；
//   P5-41.f1：合成算法移到 tests/support/contrast.ts（前景 alpha 与有效底合成、背景从祖先向子级合成，单测含半透明反例）；
//   页内只采原始色串与祖先链。照原版即低于阈值的项登记在 REF_FAITHFUL（钉现值防回归，进签收单），不算「过」。
// - 逐部件亮暗成对截图 evidence（cmp-<部件>.{light,dark}.png + compare.html 并排索引）。
import { expect, test, type Page } from 'playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AUDIT, type AuditRow, type Target } from '../support/contrast.ts'
import { bashCall, createBots, evidenceOut, finalAssistant, launchProduct, openBot, openOutline, permissionDock, reasoningTextCall, send, textCall } from '../support/ui.ts'

const OUT = evidenceOut('P5-58')
type Mode = 'light' | 'dark'

/** 低于阈值、交用户签收（work/p5-parity/evidence/P5-41f1/ACCEPTED-DEVIATIONS.md §1）：钉住现值（±0.05）而不是放过——
 * 值变了就红，要么回到登记值、要么改签收单。键 = `${mode} ${id}`；ref = 0.78.1 对照台实测（ref-colors 探针，2026-11-04）。 */
const REF_FAITHFUL: Record<string, { ratio: number; why: string }> = {
  'light 工具行预览': { ratio: 3.93, why: '照原版(ref 3.93，同 text-tertiary)' },
  'light 审批卡命令': { ratio: 4.36, why: '照原版(ref 4.36，green-primary on bg-quaternary)' },
  'light 搜索面板占位': { ratio: 3.96, why: '照原版(ref 3.96，text-tertiary)' },
  'light composer 占位': { ratio: 3.96, why: '高于原版(ref .40=2.49；我们 text-tertiary)' },
  'light 侧栏副题': { ratio: 3.67, why: '0.18 上游 text-tertiary(0.78.1 值未取到)' },
}

/** 对比度审计目标：sel 元素的直接文字色 vs 合成底色；icon=true → 阈值 3.0。 */
const TARGETS: Target[] = [
  { id: '侧栏头图标钮', sel: '.sand-agents-sidebar__header button' },
  { id: '侧栏条目名', sel: '.sand-agent-item__name' },
  { id: '侧栏副题', sel: '.sand-agent-item__preview' },
  { id: 'Stop 钮', sel: 'button[data-action="stop"]' },
  { id: 'Plugins 药丸', sel: '.sand-agents-sidebar__plugins-entry button', icon: true },
  { id: '正文', sel: '.sand-transcript-row[data-role="assistant"] .sand-message-prose p' },
  { id: '正文链接', sel: '.sand-message-prose a' },
  { id: '代码块', sel: '.sand-message-prose pre' },
  { id: 'thinking 行', sel: '.sand-outline-panel .sand-outline-item[data-kind="thinking"] .sand-outline-item__row' },
  { id: '工具行预览', sel: '.sand-outline-panel .sand-outline-item[data-kind="tool-call"] .sand-outline-item__preview' },
  { id: '审批卡标题条', sel: '[aria-label="Local tool permissions"] [data-pbots="ask-titlebar"] .pb-ask__label' },
  { id: '审批卡标题', sel: '[aria-label="Local tool permissions"] strong' },
  { id: '审批卡说明', sel: '[aria-label="Local tool permissions"] [data-pbots="ask-scope"]' },
  { id: '审批卡命令', sel: '[aria-label="Local tool permissions"] pre[data-pbots="ask-command"]' },
  { id: '审批 Allow once', sel: '[aria-label="Local tool permissions"] [role="group"] button:not([aria-label^="Deny"])' },
  { id: '审批 Deny once', sel: '[aria-label="Local tool permissions"] [role="group"] button[aria-label^="Deny"]' },
  { id: 'composer 输入区', sel: '.sand-prompt-shell' },
  { id: 'composer 编辑器', sel: '.sand-prompt-shell .ProseMirror' },
  { id: '发送钮', sel: 'button[aria-label="Send message"]', icon: true },
  { id: 'info pane 标题', sel: 'aside.sand-info-pane[data-open] .sand-info-pane__section-heading' },
  { id: '时间分隔', sel: '.sand-transcript-time-separator' },
  { id: 'chat header 标题', sel: '.sand-chat-header' },
  { id: '设置面板标题', sel: '.sand-settings-panel > h2' },
  { id: '设置导航项', sel: '.sand-settings-nav__item[data-active]' },
  { id: '搜索面板输入', sel: '.sand-command-palette > input' },
  { id: '搜索面板占位', sel: '.sand-command-palette > input', pseudo: '::placeholder' },
  // 默认 profile 无目录源 → 市场是空态；列表态（Not available / 副题 / 计数）在 market.spec 里审（那边起本地目录源）
  { id: '市场空态标题', sel: '[data-market-empty] .pb-empty__title' },
  { id: '市场空态说明', sel: '[data-market-empty] .pb-note' },
]
const OVERLAY_IDS = ['设置面板标题', '设置导航项', '搜索面板输入', '搜索面板占位', '市场空态标题', '市场空态说明']
/** composer 占位（空 composer 才有 ::before；打草稿前单独审）。 */
const PLACEHOLDER: Target = { id: 'composer 占位', sel: '.sand-prompt-field p.is-editor-empty:first-child', pseudo: '::before' }

/** 截图部件清单（亮暗成对）。 */
const SHOTS: Array<{ id: string; sel: string }> = [
  { id: 'sidebar', sel: '.sand-agents-sidebar' },
  { id: 'agent-item', sel: '.sand-agent-item' },
  { id: 'plugins-entry', sel: '.sand-agents-sidebar__plugins-entry' },
  { id: 'chat-header', sel: '.sand-chat-header' },
  { id: 'transcript', sel: '.sand-virtual-transcript' },
  { id: 'prose', sel: '.sand-transcript-row[data-role="assistant"] .sand-message-prose' },
  { id: 'thinking-row', sel: '.sand-outline-panel .sand-outline-item[data-kind="thinking"]' },
  { id: 'tool-row', sel: '.sand-outline-panel .sand-outline-item[data-kind="tool-call"]' },
  { id: 'approval-card', sel: '[aria-label="Local tool permissions"]' },
  { id: 'composer', sel: '.sand-prompt-shell' },
  { id: 'info-pane', sel: 'aside.sand-info-pane[data-open]' },
]

const isBig = (t: Target, r: AuditRow): boolean =>
  t.icon === true || parseFloat(r.size) >= 24 || (parseFloat(r.size) >= 18.66 && (r.weight === 'bold' || Number(r.weight) >= 700))
/** 阈值断言：REF_FAITHFUL 项钉现值，其余 ≥4.5（大字 / 图标 3.0）。返回处置列。 */
function judge(mode: Mode, t: Target, r: AuditRow): string {
  const key = `${mode} ${t.id}`
  const pinned = REF_FAITHFUL[key]
  if (pinned !== undefined) {
    expect.soft(Math.abs(r.ratio - pinned.ratio), `${key} 签收钉值 ${pinned.ratio}，现 ${r.ratio}`).toBeLessThanOrEqual(0.05)
    return `签收:${pinned.why}`
  }
  const min = isBig(t, r) ? 3 : 4.5
  expect.soft(r.ratio, `${key} 对比度 ${r.fg} on ${r.bg} @${r.size}/${r.weight}`).toBeGreaterThanOrEqual(min)
  return r.ratio >= min ? 'pass' : 'FAIL'
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
  // P5-41.f1：computed 颜色在 CSS transition 期间是插值（composer 背景 .15s，旧审计据此量到暗色 bg=177 的中间帧）——等过渡跑完再采样。
  // 只等 CSSTransition：persona / skeleton 是无限 animation，等不完。
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.catch(() => undefined))))
}

/** 一个模式下：截图成对 + 审计。返回 [{id,ratio,…}]。 */
async function capture(page: Page, mode: Mode): Promise<{ audit: AuditRow[]; vars: string }> {
  await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
  await settle(page, mode)
  for (const s of SHOTS) {
    const el = page.locator(s.sel).first()
    if (await el.count() > 0 && await el.isVisible().catch(() => false)) await el.screenshot({ path: join(OUT, `cmp-${s.id}.${mode}.png`) })
  }
  await page.screenshot({ path: join(OUT, `cmp-window.${mode}.png`) })
  const audit = await AUDIT(page, TARGETS.filter((t) => !OVERLAY_IDS.includes(t.id)))
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
    await openOutline(page, 'T58-X') // T22：工具/thinking 行迁 outline 面板
    await page.click('button[aria-label="View agent settings"]')
    await expect(page.locator('aside.sand-info-pane[data-open]')).toBeVisible()
    // composer 占位：空 composer 才有 ::before，打草稿前亮暗各审一次
    const audits: Record<Mode, AuditRow[]> = { light: [], dark: [] }
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await settle(page, mode)
      audits[mode].push(...await AUDIT(page, [PLACEHOLDER]))
    }
    // composer 留草稿：发送钮存在（空 composer 只有 mic 钮）+ 截图带真实文字
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await editor.click()
    await page.keyboard.type('草稿', { delay: 5 })

    // 路径 A：emulateMedia（P6-03 取证用的同一路）
    await page.emulateMedia({ colorScheme: 'light' })
    const capLight = await capture(page, 'light')
    await page.emulateMedia({ colorScheme: 'dark' })
    const capDark = await capture(page, 'dark')
    audits.light.push(...capLight.audit)
    audits.dark.push(...capDark.audit)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cursor-light')
    await page.click('button[aria-label="Close full conversation"]') // 面板 dialog 的遮罩挡后续 overlay 交互（Esc 也被它吃）

    // overlay 面（设置 / 搜索面板 / 市场）：开着截亮暗两份 + 审计，再关掉——主题翻转对 overlay 同样生效
    const pick = (...ids: string[]): Target[] => TARGETS.filter((t) => ids.includes(t.id))
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await settle(page, mode)
      await page.click('button[aria-label="Account"]')
      await page.locator('[role="menuitem"]', { hasText: 'Settings' }).click()
      await expect(page.locator('.sand-settings-panel')).toBeVisible()
      await page.screenshot({ path: join(OUT, `cmp-settings-window.${mode}.png`) })
      audits[mode].push(...await AUDIT(page, pick('设置面板标题', '设置导航项')))
      await page.locator('.sand-settings-panel__close').click()
      await page.click('button[aria-label="Search"]')
      await expect(page.locator('.sand-command-palette')).toBeVisible()
      await page.locator('.sand-command-palette').screenshot({ path: join(OUT, `cmp-search-palette.${mode}.png`) })
      audits[mode].push(...await AUDIT(page, pick('搜索面板输入', '搜索面板占位')))
      await page.keyboard.press('Escape')
      await page.locator('.sand-agents-sidebar__plugins').click()
      await expect(page.locator('[data-market-empty]')).toBeVisible({ timeout: 30_000 })
      await page.screenshot({ path: join(OUT, `cmp-market-window.${mode}.png`) })
      audits[mode].push(...await AUDIT(page, pick('市场空态标题', '市场空态说明')))
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-market]')).toHaveCount(0)
    }
    await page.emulateMedia({ colorScheme: 'light' })

    // 路径 B：Electron nativeTheme（系统主题路径；emulateMedia 先复位为跟随原生）
    await page.emulateMedia({ colorScheme: null })
    await env.shell.app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cursor-dark')
    await settle(page, 'dark')
    await page.locator('.sand-prompt-shell').first().screenshot({ path: join(OUT, 'cmp-composer.native-dark.png') })
    await page.locator('.sand-agents-sidebar__plugins-entry button').first().screenshot({ path: join(OUT, 'cmp-plugins-entry.native-dark.png') })
    const nativeDark = await AUDIT(page, pick('Plugins 药丸', 'composer 输入区'))
    // 复位用显式 light（宿主 GTK 可能偏好暗：themeSource='system' 在本机会解析为 dark）
    await env.shell.app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cursor-light')

    // 审计断言：目标必须存在；比率达标（普通 4.5；icon/大字 3.0）或登记照原版钉值
    const rows = ['id\tratio(light)\tratio(dark)\tdisposition(light)\tdisposition(dark)\tfg(light)\tbg(light)\tfg(dark)\tbg(dark)\tsize\tweight']
    for (const t of [...TARGETS, PLACEHOLDER]) {
      const l = audits.light.find((r) => r.id === t.id)
      const d = audits.dark.find((r) => r.id === t.id)
      expect.soft(l, `light ${t.id} 审计目标存在（sel=${t.sel}）`).toBeDefined()
      expect.soft(d, `dark ${t.id} 审计目标存在（sel=${t.sel}）`).toBeDefined()
      if (l === undefined || d === undefined) continue
      rows.push([t.id, String(l.ratio), String(d.ratio), judge('light', t, l), judge('dark', t, d), l.fg, l.bg, d.fg, d.bg, l.size, l.weight].join('\t'))
    }
    for (const r of nativeDark) {
      expect.soft(r.ratio, `native-dark ${r.id} 对比度 ${r.fg} on ${r.bg}`).toBeGreaterThanOrEqual(r.id.includes('composer') ? 4.5 : 3)
    }
    writeFileSync(join(OUT, 'contrast.tsv'), `${rows.join('\n')}\n${capLight.vars}\n${capDark.vars}\n`)

    // 并排索引（file:// 打开即亮暗对照）
    const compareIds = [...SHOTS.map((s) => s.id), 'settings-window', 'search-palette', 'market-window', 'window']
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
