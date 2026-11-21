// 经理取证巡检（T74 立项，2026-11-12）：不是测试，是证据采集。每面：亮/暗截图 + 三个探针
//   type   —— 该面所有可见文字元素的 font-size/line-height/weight 分布（找字阶是否成体系）
//   center —— 可点元素的文字/图标中心 vs 盒中心偏差（找「没有居中」的系统根）
//   hover  —— 可点元素 hover 前后底色/字色是否变化 + cursor（找「选项反馈」缺失）
// 产物：work/ui-quality/evidence/tour/<面>.<主题>.png + probes.json
import { expect, test, type Page } from 'playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bashCall, createBots, launchProduct, openBot, permissionDock, send, textCall } from '../../../app/ui/tests/support/ui.ts'

const OUT = '/home/lingxufeng/bot/work/ui-quality/evidence/tour'
mkdirSync(OUT, { recursive: true })
const probes: Record<string, unknown> = {}

const CLICKABLE = 'button, [role="button"], [role="menuitem"], [role="option"], [role="tab"], [role="switch"], a[href], summary, .pb-row, .sand-agent-item'

async function typeProbe(page: Page, root: string): Promise<unknown> {
  return page.evaluate((rootSel) => {
    const r = document.querySelector(rootSel) ?? document.body
    const out: Record<string, { n: number; ex: string[] }> = {}
    for (const el of Array.from(r.querySelectorAll<HTMLElement>('*'))) {
      const own = Array.from(el.childNodes).filter((c) => c.nodeType === 3 && c.textContent!.trim()).map((c) => c.textContent!.trim()).join(' ')
      if (!own) continue
      const b = el.getBoundingClientRect()
      if (b.width === 0 || b.height === 0) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue
      const k = `${cs.fontSize}/${cs.lineHeight}/${cs.fontWeight}`
      const e = (out[k] ??= { n: 0, ex: [] })
      e.n++
      if (e.ex.length < 4) e.ex.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').filter((c) => !/^sand-[0-9a-z]{5,7}$/.test(c)).slice(0, 2).join('.')}「${own.slice(0, 24)}」`)
    }
    return out
  }, root)
}

async function centerProbe(page: Page, root: string): Promise<unknown> {
  return page.evaluate(([rootSel, sel]) => {
    const r = document.querySelector(rootSel) ?? document.body
    const bad: string[] = []
    let total = 0
    for (const el of Array.from(r.querySelectorAll<HTMLElement>(sel))) {
      const b = el.getBoundingClientRect()
      if (b.width === 0 || b.height === 0 || b.height > 80) continue
      total++
      const cs = getComputedStyle(el)
      const pt = parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth), pb = parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth)
      const boxMid = b.top + pt + (b.height - pt - pb) / 2
      // 文字中心：首个非空文本节点的 range
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.textContent!.trim() ? 1 : 2 })
      const tn = walker.nextNode()
      let mid: number | null = null, what = ''
      if (tn) {
        const rg = document.createRange(); rg.selectNodeContents(tn)
        const rr = rg.getBoundingClientRect()
        if (rr.height > 0) { mid = rr.top + rr.height / 2; what = `text「${tn.textContent!.trim().slice(0, 16)}」` }
      } else {
        const svg = el.querySelector('svg, img, i, [class*="icon"]')
        if (svg) { const sr = svg.getBoundingClientRect(); if (sr.height > 0) { mid = sr.top + sr.height / 2; what = 'icon' } }
      }
      if (mid === null) continue
      const d = +(mid - boxMid).toFixed(1)
      if (Math.abs(d) > 1.5 && b.height < 60) bad.push(`${d > 0 ? '+' : ''}${d}px h${Math.round(b.height)} ${el.tagName.toLowerCase()}[${el.getAttribute('aria-label') ?? ''}] ${what} pad ${cs.paddingTop}/${cs.paddingBottom}`)
    }
    return { total, off: bad.length, bad: bad.slice(0, 30) }
  }, [root, CLICKABLE] as const)
}

async function hoverProbe(page: Page, root: string, limit = 20): Promise<unknown> {
  const els = page.locator(`${root} :is(${CLICKABLE})`)
  const n = Math.min(await els.count(), limit)
  const none: string[] = []
  let tested = 0
  for (let i = 0; i < n; i++) {
    const el = els.nth(i)
    if (!(await el.isVisible().catch(() => false))) continue
    const read = () => el.evaluate((e) => { const c = getComputedStyle(e); return `${c.backgroundColor}|${c.color}|${c.boxShadow}|${c.borderColor}|${c.opacity}` }).catch(() => '')
    const label = await el.evaluate((e) => `${e.tagName.toLowerCase()}[${e.getAttribute('aria-label') ?? (e.textContent ?? '').trim().slice(0, 18)}] cursor=${getComputedStyle(e).cursor}`).catch(() => '?')
    await page.mouse.move(1, 1)
    await page.waitForTimeout(180)
    const a = await read()
    try { await el.hover({ timeout: 1500 }) } catch { continue }
    await page.waitForTimeout(220)
    const b = await read()
    tested++
    if (a === b) none.push(label)
  }
  await page.mouse.move(1, 1)
  return { tested, noHoverChange: none.length, list: none }
}

async function shoot(page: Page, name: string, root: string): Promise<void> {
  for (const mode of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: mode })
    await page.waitForTimeout(350)
    await page.screenshot({ path: join(OUT, `${name}.${mode}.png`) })
  }
  await page.emulateMedia({ colorScheme: 'light' })
  await page.waitForTimeout(200)
  probes[name] = { type: await typeProbe(page, root), center: await centerProbe(page, root), hover: await hoverProbe(page, root) }
  writeFileSync(join(OUT, 'probes.json'), JSON.stringify(probes, null, 1))
}

async function step(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn() } catch (e) { probes[`${name}:ERROR`] = String(e).slice(0, 400); writeFileSync(join(OUT, 'probes.json'), JSON.stringify(probes, null, 1)) }
}

test('UI 巡检', async () => {
  test.setTimeout(600_000)
  const env = await launchProduct({ extraArgs: ['--force-device-scale-factor=2'] })
  const { page, rt } = env
  try {
    const [sid] = await createBots(page, [{ title: 'Tour Bot', preset: 'standard' }])
    await openBot(page, 'Tour Bot')
    await expect(page.locator('.sand-prompt-shell')).toBeVisible({ timeout: 20_000 })
    await step('empty-chat', () => shoot(page, 'empty-chat', 'body'))

    await step('conversation', async () => {
      rt.writeScriptCalls(sid!, [textCall(['Here is a short answer with **bold**, a list:\n\n- one\n- two\n\nand `inline code`.\n\n```js\nconst a = 1\n```\n'])])
      await send(page, 'Hello, give me a sample reply')
      await page.waitForTimeout(4000)
      await shoot(page, 'conversation', 'body')
    })

    await step('approval', async () => {
      rt.writeScriptCalls(sid!, [bashCall('ls /tmp', 'call-tour'), textCall(['done'])])
      await send(page, 'run a command')
      await expect(permissionDock(page)).toBeVisible({ timeout: 20_000 })
      await page.waitForTimeout(600)
      await shoot(page, 'approval', '[aria-label="Local tool permissions"]')
      await page.screenshot({ path: join(OUT, 'approval-card.light.png'), clip: (await permissionDock(page).boundingBox())! })
      await permissionDock(page).locator('button', { hasText: 'Allow once' }).click().catch(() => {})
      await page.waitForTimeout(2000)
    })

    await step('sidebar-menu', async () => {
      await page.locator('.sand-agent-item[aria-label="Tour Bot"]').click({ button: 'right' })
      await page.waitForTimeout(400)
      await shoot(page, 'sidebar-menu', '[aria-label="Agent actions"]')
      await page.keyboard.press('Escape')
    })

    await step('info-pane', async () => {
      await page.click('button[aria-label="View agent settings"]')
      await page.waitForTimeout(800)
      await shoot(page, 'info-pane', 'aside.sand-info-pane')
      await page.click('button[aria-label="View agent settings"]').catch(() => {})
    })

    await step('palette', async () => {
      await page.locator('.sand-agents-sidebar__search').click()
      await page.waitForTimeout(500)
      await shoot(page, 'palette', 'section.sand-command-palette')
      await page.keyboard.press('Escape')
    })

    await step('account-menu', async () => {
      await page.click('button[aria-label="Account"]')
      await page.waitForTimeout(400)
      await shoot(page, 'account-menu', '[role="menu"]')
      await page.keyboard.press('Escape')
    })

    await step('settings', async () => {
      await page.click('button[aria-label="Account"]')
      await page.locator('[role="menuitem"]', { hasText: 'Settings' }).click()
      await page.waitForTimeout(800)
      await shoot(page, 'settings-general', '[role="dialog"]')
      const navs = page.locator('[role="dialog"] nav button, [role="dialog"] [role="tab"]')
      const k = await navs.count()
      for (let i = 1; i < Math.min(k, 6); i++) {
        const t = ((await navs.nth(i).textContent()) ?? `nav${i}`).trim().replace(/\W+/g, '-').toLowerCase()
        await navs.nth(i).click()
        await page.waitForTimeout(600)
        await shoot(page, `settings-${t}`, '[role="dialog"]')
      }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
    })

    await step('market', async () => {
      await page.locator('.sand-agents-sidebar__plugins').click()
      await expect(page.locator('[data-market]')).toBeVisible()
      await page.waitForTimeout(1500)
      await shoot(page, 'market-list', '[data-market]')
      await page.locator('[data-market-list] .pb-row').first().locator('button[aria-label^="Open"]').click()
      await page.waitForTimeout(1000)
      await shoot(page, 'market-detail', '[data-market]')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
      await page.keyboard.press('Escape')
    })

    await step('new-bot', async () => {
      await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
      await page.waitForTimeout(800)
      await shoot(page, 'new-bot', '[role="dialog"]')
      await page.locator('[role="dialog"] summary').click().catch(() => {})
      await page.waitForTimeout(500)
      await shoot(page, 'new-bot-more', '[role="dialog"]')
      await page.keyboard.press('Escape')
    })
  } finally {
    await env.stop()
  }
})

test('onboarding 巡检', async () => {
  test.setTimeout(300_000)
  const env = await launchProduct({ ready: false, onboardingFirst: true, extraArgs: ['--force-device-scale-factor=2'] })
  const { page } = env
  try {
    await expect(page.locator('.sand-onboarding')).toBeVisible({ timeout: 60_000 })
    await page.waitForTimeout(1500)
    for (let i = 0; i < 6; i++) {
      await step(`onboarding-${i}`, () => shoot(page, `onboarding-${i}`, '.sand-onboarding'))
      const next = page.locator('.sand-onboarding button').filter({ hasText: /Continue|Next|Get started|Start|Skip/ }).first()
      if (!(await next.isVisible().catch(() => false))) break
      await next.click().catch(() => {})
      await page.waitForTimeout(1500)
    }
  } finally {
    await env.stop()
  }
})
