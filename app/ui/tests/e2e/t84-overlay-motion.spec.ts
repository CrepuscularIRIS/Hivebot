// T84 · 浮层出入场参数对齐（RE-MOTION §4 拆单①，纯 CSS）：
// ① pb-dialog-in 回 scale 族（4.1 sand-11nrck8-B：.18s cb(.22,1,.36,1) backwards scale .92——
//    收窄 T87 的 wipe，wipe 只留视图切换）；② 菜单/popover 位移族（4.2 sand-ef87bi-B .16s
//    cb(.16,1,.3,1) ty-6px scale .98）；③ tooltip（hw0koq .1s）；④ palette 同 menu 族；
// ⑤ reduced 全 none。退场（4.6）卸载式纯 CSS 不可达——T84b 提议（工单记）。
import { expect, test } from 'playwright/test'
import { launchProduct } from '../support/ui.ts'

const animOf = (sel: string) => `document.querySelector('${sel}') ? getComputedStyle(document.querySelector('${sel}')!).animationName + '|' + getComputedStyle(document.querySelector('${sel}')!).animationDuration + '|' + getComputedStyle(document.querySelector('${sel}')!).animationFillMode : 'MISSING'`

test('T84：pb-dialog 入场回 scale 族（.18s cb backwards .92）', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct({})
  try {
    const { page } = env
    await page.waitForSelector('.sand-agent-item', { timeout: 60_000 })
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    const dialog = page.locator('dialog.pb-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    const anim = await dialog.evaluate((el) => { const s = getComputedStyle(el); return `${s.animationName}|${s.animationDuration}|${s.animationFillMode}` })
    expect(anim, 'pb-dialog-in .18s backwards').toBe('pb-dialog-in|0.18s|backwards')
    // keyframes 帧文本：scale(.92) 起点且无 wipe 位移（translateX(40px) 是 T87 视图切换参数）
    const frames = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList | undefined
        try { rules = sheet.cssRules } catch { continue }
        if (rules == null) continue
        for (const r of Array.from(rules)) {
          if ((r as CSSKeyframesRule).cssText?.includes('pb-dialog-in') && (r as CSSKeyframesRule).type === CSSRule.KEYFRAMES_RULE) return (r as CSSKeyframesRule).cssText
        }
      }
      return ''
    })
    expect(frames, 'keyframes 存在').toContain('scale(0.92)')
    expect(frames, 'wipe 位移已收窄（不再进对话框）').not.toContain('translateX(40px)')
  } finally {
    await env.stop()
  }
})

test('T84：菜单/tooltip/palette 位移族入场 + reduced', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct({})
  try {
    const { page } = env
    await page.waitForSelector('.sand-agent-item', { timeout: 60_000 })
    // ① Account menu（FloatingSurface → .ui-menu__content）
    await page.click('button[aria-label="Account"]')
    const menu = page.locator('.ui-menu__content')
    await expect(menu.first()).toBeVisible({ timeout: 10_000 })
    const menuAnim = await menu.first().evaluate((el) => { const s = getComputedStyle(el); return `${s.animationName}|${s.animationDuration}|${s.animationFillMode}` })
    expect(menuAnim, '菜单 ef87bi 主档 .16s').toBe('t84-menu-in|0.16s|backwards')
    await page.keyboard.press('Escape')
    // ② palette（同 menu 位移族）——T84b：动画帧用独立 translate/scale 属性，
    // 不顶替 production.css 的 transform:translate(-50%,-50%) 居中（40ms 帧仍居中）
    await page.click('.sand-agents-sidebar__search')
    const palette = page.locator('section.sand-command-palette')
    await expect(palette).toBeVisible({ timeout: 10_000 })
    const palAnim = await palette.evaluate((el) => { const s = getComputedStyle(el); return `${s.animationName}|${s.animationDuration}` })
    expect(palAnim, 'palette 走 menu 族').toBe('t84-menu-in|0.16s')
    const centerDelta = await palette.evaluate((el) => {
      const anim = el.getAnimations().find((a) => a.animationName === 't84-menu-in')
      if (anim == null) return { skipped: true as const, d: 0 }
      anim.pause(); anim.currentTime = 40 // 40ms 帧（160ms 动画进行中）
      const r = el.getBoundingClientRect()
      const d = Math.hypot((r.left + r.right) / 2 - innerWidth / 2, (r.top + r.bottom) / 2 - innerHeight / 2)
      return { skipped: false as const, d }
    })
    expect(centerDelta.skipped, '入场动画存在可暂停').toBe(false)
    expect(centerDelta.d, '40ms 帧面板居中（≤8px；transform 被顶替时≈半宽偏移）').toBeLessThanOrEqual(8)
    await page.keyboard.press('Escape')
    // ③ reduced：菜单/palette/dialog 全 none
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.click('button[aria-label="Account"]')
    const menuReduced = await menu.first().evaluate((el) => getComputedStyle(el).animationName)
    expect(menuReduced, 'reduce 菜单无动画').toBe('none')
    await page.keyboard.press('Escape')
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    const dialogReduced = await page.locator('dialog.pb-dialog').evaluate((el) => getComputedStyle(el).animationName)
    expect(dialogReduced, 'reduce 对话框无动画').toBe('none')
  } finally {
    await env.stop()
  }
})
