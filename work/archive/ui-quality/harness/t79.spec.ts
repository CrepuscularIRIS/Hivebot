// 经理 T79 收尾巡检（2026-11-16，任务 A）：不是测试，是取证。逐面亮暗 DPR2 截图 + 量化探针。
// 跑法同 tour.spec.ts：cd app/ui && PATH=$PWD/node_modules/.bin:$PATH NODE_PATH=$PWD/node_modules TOUR_SPEC=t79.spec.ts sh scripts/run-e2e.sh -c ../../work/ui-quality/harness/tour.config.ts
import { expect, test, type Page } from 'playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createBots, launchProduct, openBot, send, textCall } from '../../../app/ui/tests/support/ui.ts'

const OUT = '/home/lingxufeng/bot/work/ui-quality/evidence/T79-tour'
mkdirSync(OUT, { recursive: true })
const P: Record<string, unknown> = {}
const save = (): void => writeFileSync(join(OUT, 'probes.json'), JSON.stringify(P, null, 1))

async function shoot(page: Page, name: string, clip?: string): Promise<void> {
  for (const mode of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: mode })
    await page.waitForTimeout(350)
    const box = clip ? await page.locator(clip).first().boundingBox().catch(() => null) : null
    const pad = 24
    await page.screenshot({ path: join(OUT, `${name}.${mode}.png`), clip: box ? { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 } : undefined })
  }
  await page.emulateMedia({ colorScheme: 'light' })
  await page.waitForTimeout(150)
}

async function step(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn() } catch (e) { P[`${name}:ERROR`] = String(e).slice(0, 500) }
  save()
}

const rect = (page: Page, sel: string) => page.evaluate((s) => Array.from(document.querySelectorAll<HTMLElement>(s)).slice(0, 12).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }), sel)
const styleOf = (page: Page, sel: string, props: string[]) => page.evaluate(([s, ps]) => { const e = document.querySelector<HTMLElement>(s as string); if (!e) return null; const c = getComputedStyle(e); return Object.fromEntries((ps as string[]).map((p) => [p, c.getPropertyValue(p)])) }, [sel, props] as const)
const BG = ['background-color', 'background-image', 'color', 'transition']

/** 所有可见滚动容器：scrollbar-width/color、占位宽（offsetWidth-clientWidth）。 */
const scrollers = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('*')).filter((e) => { const c = getComputedStyle(e); return /(auto|scroll)/.test(c.overflowY) && e.scrollHeight > e.clientHeight + 4 && e.clientHeight > 40 }).map((e) => { const c = getComputedStyle(e); return { el: `${e.tagName.toLowerCase()}.${(e.className || '').toString().split(' ').filter((x) => !/^sand-[0-9a-z]{5,7}$/.test(x)).slice(0, 2).join('.')}`, sw: c.scrollbarWidth, sc: c.scrollbarColor, gutter: e.offsetWidth - e.clientWidth - parseFloat(c.borderLeftWidth) - parseFloat(c.borderRightWidth), sg: c.scrollbarGutter } }))

/** 打开动作后 40ms 抓 getAnimations（入场动画名/时长/缓动）。 */
async function anims(page: Page, open: () => Promise<void>): Promise<unknown> {
  await open()
  await page.waitForTimeout(40)
  return page.evaluate(() => document.getAnimations().map((a) => { const t = (a.effect as KeyframeEffect | null)?.getTiming(); const tg = (a.effect as KeyframeEffect | null)?.target as HTMLElement | null; return { name: (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? a.id, dur: t?.duration, ease: t?.easing, el: tg ? `${tg.tagName.toLowerCase()}.${(tg.className || '').toString().slice(0, 50)}` : '' } }).slice(0, 12))
}

test('T79 巡检', async () => {
  test.setTimeout(600_000)
  const env = await launchProduct({ extraArgs: ['--force-device-scale-factor=2'] })
  const { page, rt } = env
  try {
    const titles = ['T79-A', 'T79-B', 'T79-C', ...Array.from({ length: 14 }, (_, i) => `Filler ${i + 1}`)]
    const ids = await createBots(page, titles.map((title) => ({ title, preset: 'standard' })))
    const sid = ids[0]!
    await openBot(page, 'T79-A')
    await expect(page.locator('.sand-prompt-shell')).toBeVisible({ timeout: 20_000 })

    // ① 头像位
    await step('avatar', async () => {
      P.avatar = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.sand-agent-item')).slice(0, 4).map((row) => {
        const m = row.querySelector<HTMLElement>('.grok-bot-mark, [class*="avatar"], [class*="bot-mark"]')
        if (!m) return { row: row.getAttribute('aria-label'), mark: null }
        const r = m.getBoundingClientRect(); const c = getComputedStyle(m)
        return { row: row.getAttribute('aria-label'), mark: m.className.toString().slice(0, 80), rect: [r.width, r.height], display: c.display, vis: c.visibility, op: c.opacity, bg: c.backgroundColor, bgi: c.backgroundImage.slice(0, 80), kids: m.innerHTML.slice(0, 200) }
      }))
      await shoot(page, 'sidebar-rows', '.sand-agents-sidebar')
    })

    // ⑤ 多选头高度 / 行位跳 / accentSelected
    await step('multiselect', async () => {
      const hdr = '.sand-agents-sidebar__header'
      const before = { hdr: await rect(page, hdr), rows: await rect(page, '.sand-agent-item') }
      await page.locator('.sand-agent-item[aria-label="T79-B"]').click({ modifiers: ['ControlOrMeta'] })
      await page.locator('.sand-agent-item[aria-label="T79-C"]').click({ modifiers: ['ControlOrMeta'] })
      await page.waitForTimeout(400)
      const after = { hdr: await rect(page, hdr), actions: await rect(page, '.sand-agents-sidebar__selection-actions'), rows: await rect(page, '.sand-agent-item') }
      const bg = {
        selected: await styleOf(page, '.sand-agent-item[data-selected="true"]', BG),
        active: await styleOf(page, '.sand-agent-item[aria-current="page"], .sand-agent-item[data-active="true"]', BG),
        plain: await styleOf(page, '.sand-agent-item[aria-label="Filler 3"]', BG),
      }
      await page.locator('.sand-agent-item[aria-label="Filler 3"]').hover(); await page.waitForTimeout(250)
      const hover = await styleOf(page, '.sand-agent-item[aria-label="Filler 3"]', BG)
      P.multiselect = { before, after, bg, hover }
      await shoot(page, 'multiselect', '.sand-agents-sidebar')
      await page.locator('button[aria-label="Clear selection"]').click().catch(() => {})
    })

    // ② 滚动条：会话列（侧栏）
    await step('scroll-sidebar', async () => { P.scrollSidebar = await scrollers(page) })

    // ③ 右键菜单 hover
    await step('ctx-menu', async () => {
      P.ctxAnim = await anims(page, () => page.locator('.sand-agent-item[aria-label="T79-A"]').click({ button: 'right' }))
      await page.waitForTimeout(300)
      const item = page.locator('[aria-label="Agent actions"] [role="menuitem"]').first()
      const a = await item.evaluate((e) => getComputedStyle(e).backgroundColor)
      await item.hover(); await page.waitForTimeout(250)
      const b = await item.evaluate((e) => { const c = getComputedStyle(e); return [c.backgroundColor, c.backgroundImage, c.textAlign, c.justifyContent] })
      P.ctxMenu = { rest: a, hover: b, rect: await rect(page, '[aria-label="Agent actions"]') }
      await shoot(page, 'ctx-menu', '[aria-label="Agent actions"]')
      await page.keyboard.press('Escape')
    })

    // ⑥ 长对话 → 滚动条 / jump / 未读 pill；② More 菜单 vs 用户气泡
    await step('conversation', async () => {
      const LONG = 'Long content line for scroll testing. '.repeat(50)
      rt.writeScriptCalls(sid, Array.from({ length: 4 }, () => textCall([LONG])))
      for (let i = 0; i < 4; i++) {
        await send(page, `t79 question ${i}`)
        await expect(page.locator('.sand-message[data-role="assistant"]').nth(i)).toBeVisible({ timeout: 60_000 })
        await page.waitForTimeout(800)
      }
      await page.waitForTimeout(1500)
      P.scrollConv = await scrollers(page)
      await shoot(page, 'conv-bottom')
      // More 菜单：最后一条用户消息
      const um = page.locator('.sand-message[data-role="user"]').last()
      await um.hover(); await page.waitForTimeout(300)
      const moreBtn = um.locator('button[aria-label="More message actions"]')
      const hasOwn = await moreBtn.count()
      if (hasOwn) await moreBtn.first().click()
      else await page.locator('button[aria-label="More message actions"]').last().click()
      await page.waitForTimeout(300)
      const menuSel = 'div[aria-label="More message actions"]'
      const bubble = await um.evaluate((e) => { const b = (e.querySelector('[class*="bubble"]') as HTMLElement) ?? e; const r = b.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), b.className.toString().slice(0, 60)] })
      const menu = await rect(page, menuSel)
      const btn = await rect(page, 'button[aria-label="More message actions"][aria-expanded="true"], button[aria-label="More message actions"]')
      P.moreMenu = { userMoreOwn: hasOwn, bubble, menu, btn, menuStyle: await styleOf(page, menuSel, ['position', 'top', 'left', 'z-index', 'transform']) }
      await shoot(page, 'more-menu-user')
      await page.keyboard.press('Escape')
      // assistant More 对照
      const am = page.locator('.sand-message[data-role="assistant"]').last()
      await am.hover(); await page.waitForTimeout(300)
      await am.locator('button[aria-label="More message actions"]').first().click().catch(() => {})
      await page.waitForTimeout(300)
      P.moreMenuAsst = { menu: await rect(page, menuSel), msg: await am.evaluate((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }) }
      await shoot(page, 'more-menu-assistant')
      await page.keyboard.press('Escape')
      // jump
      await page.evaluate(() => { const s = document.querySelector('.sand-virtual-transcript') as HTMLElement; s.scrollTop = s.scrollHeight - s.clientHeight - 600 })
      await page.locator('.sand-virtual-transcript').hover(); await page.waitForTimeout(500)
      const jumpGeo = () => page.evaluate(() => {
        const j = document.querySelector<HTMLElement>('.sand-jump-to-latest'); const t = document.querySelector<HTMLElement>('.sand-virtual-transcript'); const c = document.querySelector<HTMLElement>('.sand-prompt-shell')
        if (!j) return null
        const r = j.getBoundingClientRect(), tr = t!.getBoundingClientRect(), cr = c!.getBoundingClientRect(), cs = getComputedStyle(j)
        return { text: j.textContent, unread: j.dataset.unread ?? null, rect: [r.x, r.y, r.width, r.height].map(Math.round), centerDx: Math.round(r.x + r.width / 2 - (tr.x + tr.width / 2)), gapToComposer: Math.round(cr.top - r.bottom), font: `${cs.fontSize}/${cs.fontWeight}`, bg: cs.backgroundColor, radius: cs.borderRadius, shadow: cs.boxShadow.slice(0, 80), border: cs.border }
      })
      P.jump = await jumpGeo()
      await shoot(page, 'jump')
      // 未读 pill：滚上时来新消息
      rt.writeScriptCalls(sid, [textCall(['new incoming reply'])])
      await send(page, 't79 while scrolled')
      await page.evaluate(() => { const s = document.querySelector('.sand-virtual-transcript') as HTMLElement; s.scrollTop = Math.max(0, s.scrollHeight - s.clientHeight - 900) })
      await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: 'new incoming reply' })).toBeAttached({ timeout: 60_000 })
      await page.locator('.sand-virtual-transcript').hover(); await page.waitForTimeout(600)
      P.jumpUnread = await jumpGeo()
      await shoot(page, 'jump-unread')
    })

    // ② info pane 滚动条
    await step('info-pane', async () => {
      await page.click('button[aria-label="View agent settings"]')
      await page.waitForTimeout(800)
      P.scrollInfo = await scrollers(page)
      await shoot(page, 'info-pane', 'aside.sand-info-pane')
      await page.click('button[aria-label="View agent settings"]').catch(() => {})
    })

    // ④ palette：入场 + 居中 + hover
    await step('palette', async () => {
      P.paletteAnim = await anims(page, () => page.locator('.sand-agents-sidebar__search').click())
      await page.waitForTimeout(400)
      P.paletteGeo = await page.evaluate(() => { const s = document.querySelector<HTMLElement>('section.sand-command-palette')!; const r = s.getBoundingClientRect(); return { rect: [r.x, r.y, r.width, r.height].map(Math.round), vw: innerWidth, vh: innerHeight, dx: Math.round(r.x + r.width / 2 - innerWidth / 2), topRatio: +(r.y / innerHeight).toFixed(3) } })
      const opts = page.locator('section.sand-command-palette [role="option"]')
      const sel = await opts.first().evaluate((e) => [e.getAttribute('aria-selected'), getComputedStyle(e).backgroundColor])
      await opts.nth(2).hover(); await page.waitForTimeout(250)
      const hov = await opts.nth(2).evaluate((e) => [e.getAttribute('aria-selected'), getComputedStyle(e).backgroundColor])
      P.paletteHover = { first: sel, hovered: hov }
      await shoot(page, 'palette')
      await page.keyboard.press('Escape')
    })

    // ③④ 设置：入场 / 导航 hover vs 选中
    await step('settings', async () => {
      await page.click('button[aria-label="Account"]')
      P.menuAnim = await anims(page, async () => {})
      await page.waitForTimeout(300)
      P.settingsAnim = await anims(page, () => page.locator('.ui-menu__content [role="menuitem"], .ui-menu__content button, [role="menuitem"]').filter({ hasText: 'Settings' }).first().click())
      await page.waitForTimeout(800)
      const items = page.locator('nav.sand-settings-nav .sand-settings-nav__item')
      const active = await items.first().evaluate((e) => { const c = getComputedStyle(e); return [c.backgroundColor, c.backgroundImage, c.transition] })
      const other = items.nth(1)
      const rest = await other.evaluate((e) => getComputedStyle(e).backgroundColor)
      await other.hover(); await page.waitForTimeout(300)
      const hov = await other.evaluate((e) => { const c = getComputedStyle(e); return [c.backgroundColor, c.backgroundImage] })
      P.settingsNav = { active, rest, hover: hov, rects: await rect(page, 'nav.sand-settings-nav .sand-settings-nav__item') }
      await shoot(page, 'settings-nav-hover', '[role="dialog"]')
      await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    })

    // ② 市场滚动条 + 入场
    await step('market', async () => {
      P.marketAnim = await anims(page, () => page.locator('.sand-agents-sidebar__plugins').click())
      await expect(page.locator('[data-market]')).toBeVisible()
      await page.waitForTimeout(1500)
      P.scrollMarket = await scrollers(page)
      const row = page.locator('[data-market-list] .pb-row').nth(1)
      const a = await row.evaluate((e) => getComputedStyle(e).backgroundColor).catch(() => null)
      await row.hover().catch(() => {}); await page.waitForTimeout(300)
      P.marketRowHover = { rest: a, hover: await row.evaluate((e) => getComputedStyle(e).backgroundColor).catch(() => null) }
      await shoot(page, 'market', '[data-market]')
      await page.keyboard.press('Escape'); await page.waitForTimeout(400); await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    })

    // ② 建 bot 对话框滚动条 + 入场
    await step('new-bot', async () => {
      P.newBotAnim = await anims(page, () => page.click('.sand-agents-sidebar__header button[aria-label="New"]'))
      await page.waitForTimeout(800)
      await page.locator('[role="dialog"] summary').click().catch(() => {})
      await page.waitForTimeout(500)
      P.scrollNewBot = await scrollers(page)
      await shoot(page, 'new-bot', '[role="dialog"]')
      await page.keyboard.press('Escape')
    })
  } finally {
    save()
    await env.stop()
  }
})
