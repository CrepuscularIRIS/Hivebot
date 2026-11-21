// T79 补拍：头像 canvas 像素 / More 菜单 vs 气泡 / jump & 未读 pill / 设置入场。跑法同 t79.spec.ts（TOUR_SPEC=t79b.spec.ts）
import { expect, test, type Page } from 'playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createBots, launchProduct, openBot, send, textCall } from '../../../app/ui/tests/support/ui.ts'

const OUT = '/home/lingxufeng/bot/work/ui-quality/evidence/T79-tour'
const P: Record<string, unknown> = {}
const save = (): void => writeFileSync(join(OUT, 'probes-c.json'), JSON.stringify(P, null, 1))
async function shoot(page: Page, name: string): Promise<void> {
  for (const mode of ['light', 'dark'] as const) { await page.emulateMedia({ colorScheme: mode }); await page.waitForTimeout(350); await page.screenshot({ path: join(OUT, `${name}.${mode}.png`) }) }
  await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(150)
}
async function step(name: string, fn: () => Promise<void>): Promise<void> { try { await fn() } catch (e) { P[`${name}:ERROR`] = String(e).slice(0, 400) } save() }
const box = (page: Page, sel: string) => page.evaluate((s) => Array.from(document.querySelectorAll<HTMLElement>(s)).slice(0, 6).map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round) }), sel)

test('T79 补拍', async () => {
  test.setTimeout(600_000)
  const env = await launchProduct({ extraArgs: ['--force-device-scale-factor=2'] })
  const { page, rt } = env
  try {
    const [sid] = await createBots(page, [{ title: 'T79-A', preset: 'standard' }])
    await openBot(page, 'T79-A')
    await expect(page.locator('.sand-prompt-shell')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(2000)
    if (process.env.T79_SKIP_AV) {} else await step('avatar', async () => {
      P.avatar = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.sand-grok-bot-mark')).slice(0, 4).map((m) => {
        const cv = m.querySelector('canvas'); let ink = -1
        try { const ctx = cv?.getContext('2d'); if (ctx && cv) { const d = ctx.getImageData(0, 0, cv.width, cv.height).data; ink = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) ink++ } } catch { ink = -2 }
        const r = m.getBoundingClientRect()
        return { where: m.closest('.sand-agent-item') ? 'sidebar' : m.closest('header, [class*="header"]') ? 'header' : 'other', rect: [r.width, r.height], canvas: cv ? [cv.width, cv.height] : null, ink, svg: m.querySelectorAll('svg').length, err: m.getAttribute('data-t88-err'), state: m.dataset.grokState, html: m.innerHTML.slice(0, 160) }
      }))
    })
    await step('more', async () => {
      rt.writeScriptCalls(sid!, [textCall(['short reply']), textCall(['ok'])])
      await send(page, 'first user message that is reasonably long to show a bubble')
      await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: 'short reply' })).toBeVisible({ timeout: 60_000 })
      await send(page, 'second user message')
      await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: 'ok' })).toBeVisible({ timeout: 60_000 })
      await page.waitForTimeout(800)
      P.messages = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.sand-message')).map((m) => { const r = m.getBoundingClientRect(); return { role: m.dataset.role, rect: [r.x, r.y, r.width, r.height].map(Math.round), more: m.querySelectorAll('button[aria-label="More message actions"]').length } }))
      for (const [label, idx] of [['last', -1], ['userLast', -2]] as const) {
        const msgs = page.locator('.sand-transcript-row')
        const n = await msgs.count()
        const m = msgs.nth(n + idx)
        await m.hover(); await page.waitForTimeout(300)
        const btn = m.locator('button[aria-label="More message actions"]')
        if (!(await btn.count())) { P[`more-${label}`] = 'no More button on this message'; continue }
        await btn.first().click({ force: true })
        await page.waitForTimeout(350)
        P[`more-${label}`] = { msg: await m.evaluate((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round) }), btn: await btn.first().evaluate((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round) }), menu: await box(page, 'div[aria-label="More message actions"]'), userBubbles: await box(page, '.sand-message[data-role="user"]') }
        await shoot(page, `more-menu-${label}`)
        await page.keyboard.press('Escape'); await page.waitForTimeout(300)
      }
    })
    await step('jump', async () => {
      const LONG = 'Long content line for scroll testing. '.repeat(50)
      rt.writeScriptCalls(sid!, Array.from({ length: 3 }, () => textCall([LONG])))
      for (let i = 0; i < 3; i++) { await send(page, `long ${i}`); await page.waitForTimeout(7000) }
      await page.evaluate(() => { const s = document.querySelector('.sand-virtual-transcript') as HTMLElement; s.scrollTop = s.scrollHeight - s.clientHeight - 600 })
      await page.locator('.sand-virtual-transcript').hover(); await page.waitForTimeout(600)
      const geo = () => page.evaluate(() => {
        const j = document.querySelector<HTMLElement>('.sand-jump-to-latest'); if (!j) return null
        const t = document.querySelector<HTMLElement>('.sand-virtual-transcript')!.getBoundingClientRect(), c = document.querySelector<HTMLElement>('.sand-prompt-shell')!.getBoundingClientRect(), r = j.getBoundingClientRect(), cs = getComputedStyle(j)
        return { text: j.textContent, unread: j.dataset.unread ?? null, rect: [r.x, r.y, r.width, r.height].map(Math.round), centerDxVsTranscript: Math.round(r.x + r.width / 2 - (t.x + t.width / 2)), centerDxVsComposer: Math.round(r.x + r.width / 2 - (c.x + c.width / 2)), gapToComposer: Math.round(c.top - r.bottom), font: `${cs.fontSize}/${cs.lineHeight}/${cs.fontWeight}`, bg: cs.backgroundColor, color: cs.color, radius: cs.borderRadius, shadow: cs.boxShadow.slice(0, 90), border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`, pad: cs.padding, op: cs.opacity }
      })
      P.jump = await geo()
      await shoot(page, 'jump')
      rt.writeScriptCalls(sid!, [textCall(['new incoming reply'], { paceMs: 400 })])
      await send(page, 'while scrolled')
      await page.waitForTimeout(300)
      await page.evaluate(() => { const s = document.querySelector('.sand-virtual-transcript') as HTMLElement; s.scrollTop = Math.max(0, s.scrollHeight - s.clientHeight - 900) })
      await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: 'new incoming reply' })).toBeAttached({ timeout: 60_000 })
      await page.locator('.sand-virtual-transcript').hover(); await page.waitForTimeout(600)
      P.jumpUnread = await geo()
      await shoot(page, 'jump-unread')
    })
    await step('settings-anim', async () => {
      await page.click('button[aria-label="Account"]'); await page.waitForTimeout(300)
      await page.locator('[role="menuitem"]').filter({ hasText: 'Settings' }).first().click()
      const seen: unknown[] = []
      for (let t = 0; t < 6; t++) { await page.waitForTimeout(25); seen.push(await page.evaluate(() => document.getAnimations().map((a) => `${(a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty}:${(a.effect as KeyframeEffect)?.getTiming().duration}:${((a.effect as KeyframeEffect)?.target as HTMLElement)?.className?.toString().slice(0, 40)}`))) }
      P.settingsAnim = seen
      await page.keyboard.press('Escape')
    })
  } finally { save(); await env.stop() }
})
