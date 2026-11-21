// T57：设置对话框按 0.78.1 像素规格对齐——测量+断言一体。
// 第一轮跑=第 0 步现状表（断言红、失败信息带实测值）；CSS 改后=验收（全绿）。
// 规格全部取自 work/grok-0.79.3-re/RE-UI-LAYOUT-0.78.1.md §1.1–1.6（原版 1280×800 实测）。
// ±1px 口径；颜色精确值。Switch：General 现状无实底行（P5-52），无测量对象，N/A。
import { expect, test } from 'playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchSdkRuntime } from '../support/sdk-runtime.ts'
import { fakeOverlayPath } from '../support/sdk-runtime.ts'
import { launchShell } from '../support/launch.ts'
import { tmkdir } from '../support/tmp-sweep.ts'
import { waitProductReady } from '../support/ui.ts'

const OUT = '/home/lingxufeng/bot/work/ui-polish-win/evidence/T57'
const W = 1280
const H = 800

const openSettings = async (page: import('playwright/test').Page): Promise<void> => {
  await page.click('button[aria-label="Account"]')
  await page.locator('[role="menuitem"]', { hasText: 'Settings' }).click()
  await page.locator('.sand-settings-dialog').waitFor({ state: 'visible', timeout: 10_000 })
}

test('T57 设置对话框逐项对表（亮暗）', async () => {
  test.setTimeout(240_000)
  mkdirSync(OUT, { recursive: true })
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('bot-t57-ws-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    await shell.app.evaluate(({ BrowserWindow }, [w, h]) => { BrowserWindow.getAllWindows()[0]?.setSize(w, h) }, [W, H] as const)
    await openSettings(page)
    await page.waitForTimeout(400) // 布局稳定

    // —— 测量脚本（一次 evaluate 取全部，避免多次往返）——
    const data = await page.evaluate(() => {
      const q = (sel: string): HTMLElement | null => document.querySelector(sel)
      const cs = (el: Element) => getComputedStyle(el)
      const pick = (el: HTMLElement | null, props: string[]): Record<string, string> | null => {
        if (el === null) return null
        const s = cs(el)
        const r = el.getBoundingClientRect()
        const out: Record<string, string> = { _w: String(Math.round(r.width * 10) / 10), _h: String(Math.round(r.height * 10) / 10), _x: String(Math.round(r.x)), _y: String(Math.round(r.y)) }
        for (const p of props) out[p] = String((s as unknown as Record<string, string>)[p])
        return out
      }
      const navItems = [...document.querySelectorAll('.sand-settings-nav__item')]
      const active = navItems.find((n) => n.getAttribute('data-active') !== null) ?? navItems[0]
      const inactive = navItems.find((n) => n.getAttribute('data-active') === null) ?? navItems[1]
      const secs = [...document.querySelectorAll('.sand-settings-general section')]
      const rowOf = (sec: Element | undefined): HTMLElement[] => (sec === undefined ? [] : [...sec.children].flatMap((c) => c.tagName === 'DIV' ? [...c.children] as HTMLElement[] : [c as HTMLElement]).filter((c) => c.tagName === 'LABEL' || c.classList.contains('sand-settings-row')))
      const themeRow = rowOf(secs.find((s) => s.textContent?.includes('Theme')))[0] ?? null
      const tzRows = rowOf(secs.find((s) => s.textContent?.includes('Timezone')))
      const row = tzRows[0] ?? document.querySelector('.sand-settings-general section > label')
      return {
        vw: window.innerWidth, vh: window.innerHeight,
        surface: pick(q('.sand-settings-dialog'), ['width', 'height', 'backgroundColor', 'borderTopWidth', 'borderTopColor', 'borderRadius']),
        scrim: (() => { const el = q('.sand-dialog__scrim'); return el === null ? 'MISSING' : getComputedStyle(el).backgroundColor })(),
        nav: pick(q('.sand-settings-nav'), ['width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderRightWidth']),
        navItem: pick(navItems[0] as HTMLElement | undefined ?? null, ['paddingTop', 'paddingRight', 'columnGap', 'fontSize', 'lineHeight', 'borderTopWidth']),
        navItem2Y: navItems[1] !== undefined ? String(Math.round(navItems[1].getBoundingClientRect().y)) : 'MISSING',
        navItem1Y: navItems[0] !== undefined ? String(Math.round(navItems[0].getBoundingClientRect().y)) : 'MISSING',
        navActive: pick(active as HTMLElement | null, ['backgroundColor', 'borderRadius', 'borderTopWidth']),
        navIcon: (() => { const ic = navItems[0]?.querySelector('[data-icon-name]') ?? null; return ic === null ? 'MISSING' : String(Math.round(ic.getBoundingClientRect().width * 10) / 10) })(),
        h2: pick(q('.sand-settings-panel > h2'), ['fontSize', 'fontWeight', 'color', 'paddingTop', 'paddingRight', 'paddingBottom']),
        h3: pick(q('.sand-settings-general section > h3'), ['fontSize', 'fontWeight', 'color', 'paddingLeft', 'paddingTop', 'paddingBottom', 'marginBottom']),
        close: pick(q('.sand-settings-panel__close'), []),
        body: pick(q('.sand-settings-panel__body'), ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']),
        group: pick(q('.sand-settings-general section'), ['rowGap']),
        // T57c：真实卡层 rect 链（probe 行 18/33/39/52——相邻元素 rect 相减，不再只断 gap 计算值）
        card: pick(q('.sand-settings-group__card'), ['paddingTop', 'paddingBottom', 'borderRadius', 'backgroundColor', 'borderTopWidth', 'borderTopColor']),
        h3Rect: pick(q('.sand-settings-general section > h3'), []),
        bodyRect: pick(q('.sand-settings-panel__body'), []),
        sec2: pick(secs[1] ?? null, []),
        accountCard: pick(q('.sand-account-card'), ['backgroundColor', 'borderTopWidth']),
        generalGap: (() => { const g = q('.sand-settings-general'); return g === null ? 'MISSING' : getComputedStyle(g).rowGap })(),
        navInactive: pick(inactive as HTMLElement | null ?? null, ['backgroundColor', 'borderTopWidth']),
        h2pad: pick(q('.sand-settings-panel > h2'), ['paddingLeft', 'letterSpacing', 'borderBottomWidth']),
        themeRow: pick(themeRow, ['borderRadius', 'backgroundColor', 'justifyContent']),
        row: pick(row, ['rowGap', 'columnGap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderRadius', 'backgroundColor', 'borderTopWidth', 'borderTopColor']),
        rowLabel: pick(row?.querySelector('span') ?? null, ['fontSize', 'fontWeight', 'color']),
        select: pick(q('.ui-select-trigger'), ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'columnGap', 'borderRadius', 'fontSize', 'lineHeight', 'letterSpacing', 'backgroundColor', 'borderTopWidth', 'borderTopColor']),
      }
    })
    console.log('T57 现状表(亮):', JSON.stringify(data, null, 1))

    const near = (got: number, want: number, tol = 1.05): boolean => Math.abs(got - want) <= tol
    const s = data as Record<string, Record<string, string> | string | number | null>
    const surf = s.surface as Record<string, string>
    const nav = s.nav as Record<string, string>
    const navItem = s.navItem as Record<string, string>
    const navActive = s.navActive as Record<string, string>
    const h2 = s.h2 as Record<string, string>
    const h3 = s.h3 as Record<string, string>
    const close = s.close as Record<string, string>
    const body = s.body as Record<string, string>
    const group = s.group as Record<string, string>
    const row = s.row as Record<string, string>
    const rowLabel = s.rowLabel as Record<string, string>
    const select = s.select as Record<string, string>

    // §1.1 外壳
    expect(Number(surf._w), '§1.1 宽 min(900,vw-32)').toBeCloseTo(900, 0)
    expect(Number(surf._h), '§1.1 内容高 min(700,vh-96)').toBeCloseTo(Math.min(700, Number(s.vh) - 96), 0)
    expect(surf.backgroundColor, '§1.1 底 --sand-bg-chrome(亮 #fcfcfc)').toBe('rgb(252, 252, 252)')
    expect(surf.borderRadius, '§1.1 圆角 14').toBe('14px')
    // §1.1 边 .5px translucent：CSS 指定值 0.5px 已写（见 settings-view-t57.css）；
    // 本环境 DPR=1，getComputedStyle 报 used 值会把 0.5 round 成 1（原版 0.5 实测出自
    // DPR=2 的 mac）。按工单 ±1px 口径接受 0.5~1.5。
    const bw = Number.parseFloat(surf.borderTopWidth)
    expect(bw, '§1.1 边 .5px（DPR1 used round）').toBeGreaterThanOrEqual(0.5)
    expect(bw).toBeLessThanOrEqual(1.5)
    expect(surf.borderTopColor, '§1.1 边色 translucent').toContain('28, 28, 28')
    // §1.2 导航
    expect(Number(nav._w), '§1.2 nav 宽 198').toBeCloseTo(198, 0)
    expect(nav.paddingTop, '§1.2 nav padding 上 16').toBe('16px')
    expect(nav.paddingRight, '§1.2 nav padding 右 12').toBe('12px')
    expect(navItem.paddingTop, '§1.2 项 padding 7').toBe('7px')
    expect(navItem.paddingRight, '§1.2 项 padding 9').toBe('9px')
    expect(navItem.columnGap, '§1.2 项 gap 9').toBe('9px')
    expect(navItem.fontSize, '§1.2 项字 13').toBe('13px')
    expect(navItem.lineHeight, '§1.2 项行高 18').toBe('18px')
    expect(Number(s.navItem2Y) - Number(s.navItem1Y), '§1.2 行距 34').toBeCloseTo(34, 0)
    expect(navActive.borderRadius, '§1.2 选中 radius 8').toBe('8px')
    // Sol MAJOR 补断言：选中底 --sand-bg-active ≈8%（token #1c1c1c14=0.0784，computed
    // 取 0.07~0.09 区间；旧值是 :46 钉的 0.06）
    const navA = Number.parseFloat((navActive.backgroundColor.match(/([\d.]+)\)$/) ?? ['0', '0'])[1])
    expect(navActive.backgroundColor, '§1.2 选中底亮=28,28,28').toContain('28, 28, 28')
    expect(navA, '§1.2 选中底 alpha≈0.08（非 0.06）').toBeGreaterThanOrEqual(0.07)
    expect(navA).toBeLessThanOrEqual(0.09)
    // §1.1 scrim（Sol MINOR）：亮 #00000080=50%（overlay frame=最近非透明 fixed 祖先）
    expect(String(s.scrim), '§1.1 scrim 亮 50%').toBe('rgba(0, 0, 0, 0.5)')
    expect(Number(s.navIcon), '§1.2 icon 15').toBeCloseTo(15, 0)
    // T57b①：未选中项也透明无边（probe 行 6/9/12——:46 钉的 bg-secondary+1px 边要全部反压）
    const navInactive = s.navInactive as Record<string, string>
    expect(navInactive.backgroundColor, '§1.2 未选中底透明').toBe('rgba(0, 0, 0, 0)')
    expect(navItem.borderTopWidth, '§1.2 项无边(T57b①)').toBe('0px')
    expect(navActive.borderTopWidth, '§1.2 选中项无边(T57b①)').toBe('0px')
    // §1.3 标题（T57b② probe 行 18-20）：pane 头 62 高、h2 padding 32/54/6/32（pane 层
    // 32+54 由 body/h2 合成：h2 padding 32 54 6 32 中 inline-start 另加 8 → 以下断 h2
    // 自身值）、无 border-bottom、字距 -0.136px；body padding 22/32/28。
    const h2pad = s.h2pad as Record<string, string>
    expect(h2.fontSize, '§1.3 h2 17').toBe('17px')
    expect(h2.fontWeight, '§1.3 h2 500').toBe('500')
    expect(h2.paddingTop, '§1.3 h2 padding 上 32').toBe('32px')
    expect(h2.paddingBottom, '§1.3 h2 padding 下 6').toBe('6px')
    expect(h2pad.paddingLeft, '§1.3 h2 padding-inline-start 40（pane 32+h2 自身 8 合成）').toBe('40px')
    expect(h2pad.letterSpacing, '§1.3 h2 字距 -0.136px').toBe('-0.136px')
    expect(h2pad.borderBottomWidth, '§1.3 h2 无分隔线(T57b②)').toBe('0px')
    expect(body.paddingTop, '§1.3 body padding 上 22').toBe('22px')
    expect(body.paddingRight, '§1.3 body padding 右 32').toBe('32px')
    expect(body.paddingBottom, '§1.3 body padding 下 28').toBe('28px')
    expect(h3.fontSize, '§1.3 h3 12').toBe('12px')
    expect(h3.fontWeight, '§1.3 h3 400').toBe('400')
    expect(Number(close._w), '§1.3 Close 32×32').toBeCloseTo(32, 0)
    // §1.4 行 vs 分组卡（T57c：真实卡层 DOM——SettingsGroup 包 .sand-settings-group__card；
    // probe 行 18/33/39/52。断言=相邻元素 rect 相减（T57b 栽在属性对画面不对）。
    expect(group.rowGap, '§1.4 section gap 8（h3↔卡）').toBe('8px')
    expect(String(s.generalGap), '§1.4 分组间 gap 28').toBe('28px')
    expect(row.rowGap, '§1.4 行 rowGap 8').toBe('8px')
    expect(row.columnGap, '§1.4 行 columnGap 20').toBe('20px')
    expect(row.paddingTop, '§1.4 行 padding-block 10').toBe('10px')
    expect(row.paddingLeft, '§1.4 行 padding-inline 14').toBe('14px')
    expect(row.borderRadius, '§1.4 行 radius 0（卡层承载圆角）').toBe('0px')
    expect(row.backgroundColor, '§1.4 行透明底（卡承载白底）').toBe('rgba(0, 0, 0, 0)')
    expect(Number(row._h), '§1.4 行高 48').toBeCloseTo(48, 0)
    expect(rowLabel.fontSize, '§1.4 label 13').toBe('13px')
    expect(rowLabel.fontWeight, '§1.4 label 400').toBe('400')
    // 卡层本体（probe 行 39：padding 8px 0、r14、白底+1px 边）
    const card = s.card as Record<string, string>
    expect(card.paddingTop, '§1.4 卡 padding 上 8').toBe('8px')
    expect(card.paddingBottom, '§1.4 卡 padding 下 8').toBe('8px')
    expect(card.borderRadius, '§1.4 卡 radius 14').toBe('14px')
    expect(card.backgroundColor, '§1.4 卡底 elevated').toBe('rgb(255, 255, 255)')
    expect(Number.parseFloat(card.borderTopWidth), '§1.4 卡边宽 >0').toBeGreaterThan(0)
    // rect 链（T57c 核心——±1）
    const h3R = s.h3Rect as Record<string, string>
    const bodyR = s.bodyRect as Record<string, string>
    const sec2 = s.sec2 as Record<string, string>
    const h3Y = Number(h3R._y); const bodyY = Number(bodyR._y)
    expect(h3Y - bodyY, '§1.4 首个 h3 顶−body 顶=22（probe 137-115）').toBeCloseTo(22, 0)
    expect(Number(card._y) - (h3Y + Number(h3R._h)), '§1.4 h3 底→卡顶 8').toBeCloseTo(8, 0)
    expect(Number(sec2._y) - Number(card._h) - Number(card._y), '§1.4 卡底→下一 section 顶 28').toBeCloseTo(28, 0)
    expect(Number(h3R._x) - Number(card._x), '§1.4 h3 左=卡左（文字另 +14）').toBeCloseTo(0, 0)
    expect(h3.paddingLeft, '§1.4 h3 padding-inline-start 14（文字 x=卡+14）').toBe('14px')
    expect(h3.marginBottom, '§1.4 h3 margin 0').toBe('0px')
    // Account 在卡内透明无边（view.css:36 的灰底+深边压掉）
    const accountCard = s.accountCard as Record<string, string>
    expect(accountCard.backgroundColor, '§1.4 Account 卡内透明').toBe('rgba(0, 0, 0, 0)')
    expect(accountCard.borderTopWidth, '§1.4 Account 无边').toBe('0px')
    // Sol T57c MAJOR 断言：布局语义——space-between + 控件贴行右缘（差=行 padding 14±1）
    expect(String((s.themeRow as Record<string, string>).justifyContent), '§1.4 行 space-between').toBe('space-between')
    const selR = await page.evaluate(() => { const r = document.querySelector('.ui-select-trigger')?.getBoundingClientRect(); const l = document.querySelector('.sand-settings-group__card > label')?.getBoundingClientRect(); return r != null && l != null ? String(Math.round(l.right - r.right)) : 'MISSING' })
    expect(Number(selR), '§1.4 控件贴行右缘（差=行 padding 14）').toBeCloseTo(14, 0)
    // §1.6 Select
    expect(Number(select._h), '§1.6 Select 高 28').toBeCloseTo(28, 0)
    expect(select.paddingTop, '§1.6 Select padding 上 4').toBe('4px')
    expect(select.paddingLeft, '§1.6 Select padding 左 7').toBe('7px')
    expect(select.borderRadius, '§1.6 Select radius 10').toBe('10px')
    expect(select.fontSize, '§1.6 Select 字 13').toBe('13px')
    expect(select.backgroundColor, '§1.6 Select 透明底').toBe('rgba(0, 0, 0, 0)')
    expect(select.borderTopWidth, '§1.6 Select 边 1px').toBe('1px')
    expect(select.columnGap, '§1.6 Select gap 4（Sol MINOR）').toBe('4px')

    await page.screenshot({ path: join(OUT, 'settings-light.png') })
    // 暗色同表（emu dark）
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(400)
    const d = await page.evaluate(() => {
      const q = (sel: string): HTMLElement | null => document.querySelector(sel)
      const surfEl = q('.sand-settings-dialog')
      const navA = [...document.querySelectorAll('.sand-settings-nav__item')].find((n) => n.getAttribute('data-active') !== null)
      return {
        surfaceBg: surfEl !== null ? getComputedStyle(surfEl).backgroundColor : 'MISSING',
        navActiveBg: navA !== undefined ? getComputedStyle(navA).backgroundColor : 'MISSING',
        scrimBg: (() => { const el = q('.sand-dialog__scrim'); return el === null ? 'MISSING' : getComputedStyle(el).backgroundColor })(),
        // Sol T57c MINOR：卡层 rect/底色暗色同测（此前新增断言只跑亮色）
        cardDark: (() => { const el = q('.sand-settings-group__card'); return el === null ? 'MISSING' : JSON.stringify({ bg: getComputedStyle(el).backgroundColor, top: Math.round(el.getBoundingClientRect().y), bottom: Math.round(el.getBoundingClientRect().bottom) }) })(),
        h3DarkTop: (() => { const el = q('.sand-settings-general section > h3'); return el === null ? 'MISSING' : String(Math.round(el.getBoundingClientRect().y)) })(),
      }
    })
    console.log('T57 现状表(暗):', JSON.stringify(d))
    const dd = d as { surfaceBg: string; navActiveBg: string; scrimBg: string; cardDark: string; h3DarkTop: string }
    expect(dd.surfaceBg, '§1.1 暗底 #121212').toBe('rgb(18, 18, 18)')
    // Sol T57c MINOR：暗色卡 token 与 rect 链（h3 顶→卡顶 8）
    const cardD = JSON.parse(dd.cardDark === 'MISSING' ? '{"bg":"MISSING","top":0,"bottom":0}' : dd.cardDark) as { bg: string; top: number; bottom: number }
    expect(cardD.bg, '§1.4 暗卡底 #1f1f1f').toBe('rgb(31, 31, 31)')
    expect(cardD.top - Number(dd.h3DarkTop === 'MISSING' ? 0 : dd.h3DarkTop) - 16, '§1.4 暗 h3 底→卡顶 8（h3 高 16）').toBeCloseTo(8, 0)
    // Sol MAJOR 补断言：暗选中底 --sand-bg-active=#f5f5f514≈0.08（旧 0.04）
    expect(dd.navActiveBg, '§1.2 暗选中底=245,245,245').toContain('245, 245, 245')
    const navAd = Number.parseFloat((dd.navActiveBg.match(/([\d.]+)\)$/) ?? ['0', '0'])[1])
    expect(navAd, '§1.2 暗选中底 alpha≈0.08（非 0.04）').toBeGreaterThanOrEqual(0.07)
    expect(navAd).toBeLessThanOrEqual(0.09)
    // §1.1 暗 scrim #000000b2=178/255=0.698（Sol MINOR）
    expect(dd.scrimBg, '§1.1 暗 scrim 69.7%').toBe('rgba(0, 0, 0, 0.698)')
    await page.screenshot({ path: join(OUT, 'settings-dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })
    void body; void near; void s
  } finally {
    await shell.stop(); await rt.stop()
  }
})
