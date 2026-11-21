// 经理取证第二轮：字体族分叉 / 审批卡 / 气泡宽 / 滚动条 / 菜单项与原生按钮样式泄漏
import { expect, test } from 'playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bashCall, createBots, devState, launchProduct, openBot, permissionDock, send, textCall } from '../../../app/ui/tests/support/ui.ts'

const OUT = '/home/lingxufeng/bot/work/ui-quality/evidence/tour'
const fam = (page: import('playwright/test').Page, sels: string[]) => page.evaluate((ss) => Object.fromEntries(ss.map((s) => {
  const el = document.querySelector(s) as HTMLElement | null
  if (!el) return [s, null]
  const c = getComputedStyle(el)
  return [s, { ff: c.fontFamily, fs: c.fontSize, lh: c.lineHeight, ta: c.textAlign, bg: c.backgroundColor, w: Math.round(el.getBoundingClientRect().width), maxw: c.maxWidth, minw: c.minWidth, disp: c.display, sw: c.scrollbarWidth, sc: c.scrollbarColor }]
})), sels)

test('probe2', async () => {
  test.setTimeout(300_000)
  const env = await launchProduct({ extraArgs: ['--force-device-scale-factor=2'] })
  const { page, rt } = env
  const r: Record<string, unknown> = {}
  try {
    const [sid] = await createBots(page, [{ title: 'P2 Bot', preset: 'standard' }])
    await openBot(page, 'P2 Bot')
    rt.writeScriptCalls(sid!, [textCall(['done'])])
    await send(page, 'hi')
    await page.waitForTimeout(3000)
    r.shell = await fam(page, ['body', '.sand-shell', '.sand-agent-item__name', '.sand-transcript-row[data-role="assistant"] .sand-message-prose', '.sand-transcript-row[data-role="assistant"] .sand-message-prose p', '.sand-transcript-row[data-role="user"] .sand-message-prose', '.sand-virtual-transcript'])
    r.bubbleChain = await page.evaluate(() => {
      const p = document.querySelector('.sand-transcript-row[data-role="assistant"] .sand-message-prose') as HTMLElement | null
      const out: string[] = []
      for (let e: HTMLElement | null = p; e && out.length < 8; e = e.parentElement) {
        const c = getComputedStyle(e)
        out.push(`${e.tagName}.${e.className.toString().split(' ').filter((x) => !/^sand-[0-9a-z]{5,7}$/.test(x)).join('.')} w=${Math.round(e.getBoundingClientRect().width)} disp=${c.display} maxw=${c.maxWidth} width=${c.width} minw=${c.minWidth}`)
      }
      return out
    })
    await page.screenshot({ path: join(OUT, 'p2-short-reply.light.png') })
    // 菜单项 / 设置 / 市场 / 建 bot / 调色板 的字体族
    await page.locator('.sand-agent-item[aria-label="P2 Bot"]').click({ button: 'right' })
    r.menu = await fam(page, ['[aria-label="Agent actions"]', '[aria-label="Agent actions"] [role="menuitem"]'])
    await page.keyboard.press('Escape')
    await page.locator('.sand-agents-sidebar__search').click()
    r.palette = await fam(page, ['section.sand-command-palette', 'section.sand-command-palette [role="option"]', 'section.sand-command-palette button'])
    await page.keyboard.press('Escape')
    await page.click('button[aria-label="Account"]')
    await page.locator('[role="menuitem"]', { hasText: 'Settings' }).click()
    await page.waitForTimeout(600)
    r.settings = await fam(page, ['[role="dialog"]', '[role="dialog"] h2', '[role="dialog"] .sand-account-card__avatar'])
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await page.locator('.sand-agents-sidebar__plugins').click()
    await page.waitForTimeout(800)
    r.market = await fam(page, ['[data-market]', '[data-market] h2', '[data-market-list] .pb-row', '[data-market] .pb-scroll, [data-market] [class*="scroll"]'])
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    await page.waitForTimeout(600)
    r.newbot = await fam(page, ['[role="dialog"]', '[role="dialog"] h2', 'input[aria-label="Bot name"]'])
    r.fonts = await page.evaluate(async () => { await document.fonts.ready; return Array.from(document.fonts).map((f) => `${f.family}:${f.status}`) })
    r.rootVars = await page.evaluate(() => { const c = getComputedStyle(document.documentElement); return { sans: c.getPropertyValue('--cursor-font-family-sans'), fam: c.getPropertyValue('--cursor-font-family'), sandSans: c.getPropertyValue('--sand-font-family-sans') } })
  } finally {
    writeFileSync(join(OUT, 'probe2.json'), JSON.stringify(r, null, 1))
    await env.stop()
  }
})
