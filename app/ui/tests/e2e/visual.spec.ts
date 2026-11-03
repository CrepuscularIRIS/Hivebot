// U2′（P5-54）：旧 renderer 的 U2 / R8 数值断言（visual*.spec.ts，P5-15 / P5-11 / P5-12 / P5-14）迁到 renderer-grok 的等价锚点。
// 每个锚点 = 旧条目 id（A1…E5 / 规则 n）+ 新 renderer 选择器 + 计算样式属性；亮暗各量一遍，逐项与基线
// tests/e2e/visual-baseline.json 比对（= 0.18 移植树现值，防回归）。旧断言值记在 was 字段：
// 新值 ≠ was 的行就是交 P5-55 的 U2′ 差异表（跑完写 test-output/U2p/diff.tsv，报告转录）。
// P5-55 换 0.78.1 值时：改覆盖文件 → PBOTS_UPDATE_VISUAL_BASELINE=1 重写基线 → diff.tsv 里对应行消失即为收口证据。
// 无锚点的旧条目（0.18 没有该构件）以 sel=null 列出：断言「确实不存在」，同样进差异表。
import { expect, test, type Page } from 'playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bashCall, createBots, evidenceOut, finalAssistant, launchProduct, openBot, permissionDock, reasoningTextCall, send, textCall } from '../support/ui.ts'

const OUT = evidenceOut('U2p')
const BASELINE = join(__dirname, 'visual-baseline.json')
const UPDATE = process.env.PBOTS_UPDATE_VISUAL_BASELINE === '1'
type Mode = 'light' | 'dark'

interface Anchor {
  id: string
  /** 新 renderer 的锚点（取第一个匹配）；null = 0.18 无该构件。 */
  sel: string | null
  props: string[]
  /** 旧断言值（旧 renderer，R2 / R8 / 0.18 规格），与新值并列进差异表。 */
  was: string
}

const ANCHORS: Anchor[] = [
  { id: 'A1 头部', sel: '.sand-agents-sidebar__header', props: ['padding', 'column-gap', 'min-height', 'box:height'], was: 'padding 12px 16px; column-gap 8px; min-height = --sand-titlebar-block' },
  { id: 'A1 钮', sel: '.sand-agents-sidebar__header button[aria-label="New"]', props: ['width', 'height', 'border-top-left-radius'], was: '24px×24px r6' },
  { id: 'A2 搜索钮', sel: '.sand-agents-sidebar__search', props: ['height', 'border-top-left-radius', 'font-size'], was: '侧栏内搜索框（原位出现）' },
  { id: 'A3 列表', sel: '.sand-agents-list', props: ['padding'], was: 'padding 4px 12px 24px' },
  { id: 'A4 条目', sel: '.sand-agent-item', props: ['min-height', 'padding', 'box:height'], was: 'min-height 58px; padding 8px（R2：固定 54）' },
  { id: 'A5 条目栅格', sel: '.sand-agent-item', props: ['display', 'column-gap'], was: 'grid 34px …; column-gap 9px（R2：gap 8）' },
  { id: 'A6 头像', sel: '.sand-agent-item__avatar', props: ['box:width', 'box:height'], was: '34（R2 推断 32）' },
  { id: 'A13 折叠宽', sel: null, props: [], was: '折叠 78（0.18 为 88：visual-sidebar.spec 断言 88）' },
  { id: 'A18 调宽把手', sel: '.sand-sidebar-resize-handle', props: ['width', 'right', 'box:height'], was: 'right -6px; width 12px; 全高' },
  { id: 'B1 会话列', sel: '.sand-virtual-transcript', props: ['row-gap', 'padding-top', 'padding-left'], was: 'row-gap 22px' },
  { id: 'B2 会话列宽', sel: '.sand-virtual-transcript', props: ['max-width', 'padding'], was: 'padding 28px 30px; max-width 750px' },
  { id: 'B3 用户气泡', sel: null, props: [], was: '反转气泡（R2 B3）；0.18 持久用户条目落 assistant 侧（VERIFY-P5-51 OBS），无用户气泡锚点' },
  { id: 'B6 工具行', sel: '.sand-outline-item[data-kind="tool-call"] .sand-outline-item__row', props: ['min-height', 'padding', 'border-top-left-radius'], was: 'min-height 34px; padding 7px 9px（R2：高 28 r8）' },
  { id: 'B6 chevron', sel: '.sand-outline-item[data-kind="tool-call"] .sand-outline-item__chevron', props: ['width', 'height', 'transform'], was: '6×6；收起 rotate(-45deg)' },
  { id: 'B6 预览', sel: '.sand-outline-item[data-kind="tool-call"] .sand-outline-item__preview', props: ['font-size', 'font-family'], was: 'preview 13px 非等宽（R2）' },
  { id: 'B7 thinking 行', sel: '.sand-outline-item[data-kind="thinking"] .sand-outline-item__row', props: ['min-height', 'padding'], was: 'thinking 行（P5-12）' },
  { id: 'B8 审批卡', sel: '[aria-label="Local tool permissions"]', props: ['border-top-left-radius', 'padding', 'box-shadow'], was: 'r10; padding 14px 16px（R2：r24 + 阴影）' },
  { id: 'B8 钮', sel: '[aria-label="Local tool permissions"] button', props: ['padding', 'border-top-left-radius', 'height'], was: 'padding 6px 9px r6（R2：药丸 r9999）' },
  { id: 'B10 composer 壳', sel: '.sand-prompt-shell', props: ['padding', 'border-top-left-radius'], was: 'padding 9px; r16（R2：药丸 r9999）' },
  { id: 'B10 输入', sel: '.sand-prompt-shell .ProseMirror', props: ['min-height', 'font-size'], was: 'min-height 48px' },
  { id: 'B10 dock', sel: '.sand-chat-input-dock', props: ['padding-bottom'], was: 'padding-bottom 18px' },
  { id: 'B14 时间分隔', sel: '.sand-transcript-time-separator', props: ['margin-bottom', 'font-size', 'color'], was: '高 22（P5-12）' },
  { id: 'B15 代码块', sel: '.sand-message-prose pre', props: ['border-top-left-radius', 'padding', 'font-family'], was: 'copy 钮 top 6 right 6 opacity 0' },
  { id: 'C1 info pane', sel: 'aside.sand-info-pane[data-open]', props: ['box:width', 'border-left-width'], was: '初始 320；范围 280–480' },
  { id: 'E3 根', sel: 'html', props: ['font-synthesis', 'color-scheme'], was: 'font-synthesis none; color-scheme = mode' },
  { id: 'E4 正文字体', sel: '.sand-message-prose', props: ['font-family', 'font-size', 'line-height'], was: 'body 字体含 XVF（D12③）' },
  { id: '规则 5/9 链接色', sel: '.sand-message-prose a', props: ['color'], was: 'light rgb(11,109,211) / dark rgb(77,155,255)' },
  { id: '规则 15 次要文字', sel: '.sand-agent-item__name', props: ['color', 'font-size'], was: 'light rgba(28,28,28,.68) / dark rgba(245,245,245,.66)（outcome 行）' },
  { id: 'D4 市场搜索', sel: null, props: [], was: 'r8; h32; padding 0 9（P-C 市场页未移植）' },
  { id: 'D6 市场行', sel: null, props: [], was: 'padding 12; min-h 56; 行距 7; 头像 36（P-C 市场页未移植）' },
  { id: 'C2 pane 头', sel: null, props: [], was: 'pane-head padding-left 12（P-D pane 未移植）' },
]

/** 所有锚点的计算值：`id|prop` → 值；box:* 取布局盒（四舍五入 px）。 */
async function measure(page: Page): Promise<Record<string, string>> {
  return page.evaluate((anchors) => {
    const out: Record<string, string> = {}
    for (const a of anchors) {
      if (a.sel === null) continue
      const el = document.querySelector(a.sel)
      for (const p of a.props) {
        if (el === null) { out[`${a.id}|${p}`] = '<missing>'; continue }
        if (p.startsWith('box:')) {
          const r = el.getBoundingClientRect()
          out[`${a.id}|${p}`] = `${Math.round(p === 'box:width' ? r.width : r.height)}px`
        } else out[`${a.id}|${p}`] = getComputedStyle(el).getPropertyValue(p).trim()
      }
    }
    return out
  }, ANCHORS)
}

test('U2′：旧 U2 / R8 数值断言的新锚点亮暗锁定（基线 = 0.18 移植现值）+ 差异表 + 截图', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    await env.shell.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 820) })
    const [x] = await createBots(page, [{ title: 'U2-X', preset: 'standard' }, { title: 'U2-Y', preset: 'p2-beta' }])
    await openBot(page, 'U2-X')
    rt.writeScriptCalls(x!, [
      reasoningTextCall('先想一下示例。', '你好，下面是一段示例代码，详见 [文档](https://example.com)：\n\n```ts\nconst answer = 42\n```\n'),
      bashCall('true', 'call-v'), textCall(['已执行。']),
    ])
    await send(page, '给个例子')
    await expect(finalAssistant(page).last()).toContainText('示例代码', { timeout: 20_000 })
    await send(page, '执行一下')
    await expect(permissionDock(page)).toBeVisible({ timeout: 20_000 }) // 审批卡挂着时量 B8
    await page.click('button[aria-label="View agent settings"]')
    await expect(page.locator('aside.sand-info-pane[data-open]')).toBeVisible()

    const got: Record<Mode, Record<string, string>> = { light: {}, dark: {} }
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
      got[mode] = await measure(page)
      await page.screenshot({ path: join(OUT, `u2p-${mode}.png`) })
    }
    await page.emulateMedia({ colorScheme: 'light' })

    if (UPDATE || !existsSync(BASELINE)) writeFileSync(BASELINE, `${JSON.stringify(got, null, 1)}\n`)
    const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<Mode, Record<string, string>>

    // 防回归：每个锚点 × 属性 × 亮暗 一条断言（锚点必须存在；值 = 基线）
    let asserted = 0
    for (const mode of ['light', 'dark'] as const) {
      for (const a of ANCHORS) {
        if (a.sel === null) continue // 无锚点：0.18 没有该构件，只进差异表（不计断言数）
        for (const p of a.props) {
          const key = `${a.id}|${p}`
          expect.soft(got[mode][key], `${mode} ${key} 锚点存在`).not.toBe('<missing>')
          expect.soft(got[mode][key], `${mode} ${key}`).toBe(base[mode][key])
          asserted += 2
        }
      }
    }
    // 迁移前 visual*.spec.ts 源码里的 expect 调用 158 处（含 soft）；这里每锚点×属性×亮暗 2 条，执行条数须不少于它
    expect(asserted).toBeGreaterThanOrEqual(158)

    // 差异表：旧值 | 新值（亮 / 暗），交 P5-55
    const rows = ['id\tprops\twas(旧 renderer)\tnow light\tnow dark']
    for (const a of ANCHORS) {
      const now = (m: Mode): string => a.sel === null ? '—（0.18 无此构件）' : a.props.map((p) => `${p}=${got[m][`${a.id}|${p}`]}`).join('; ')
      rows.push([a.id, a.props.join(','), a.was, now('light'), now('dark')].join('\t'))
    }
    writeFileSync(join(OUT, 'diff.tsv'), `${rows.join('\n')}\n`)
  } finally {
    await env.stop()
  }
})
