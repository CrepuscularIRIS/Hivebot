// T26 · onboarding（A 段+review 修复后语义）：真首启（roster 空+未 seen）→ landing →
// skip 退出补建 main；seen=1 正常启动。前置：pnpm build。
import { expect, test, type Page } from 'playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { devState, launchProduct } from '../support/ui.ts'

const seen = (page: Page) => page.evaluate(() => window.localStorage.getItem('pbots.shim.onboarding-seen'))

const INTRO_TEXT = 'Hi! I am your first bot, ready when you are.'

/** default.json：fake 兜底脚本（plugin 读 {calls:[…]}——裸数组会炸 reading '0'，T25 回执）。 */
const writeDefaultScript = (home: string, replies: string[]): void => {
  const dir = join(home, 'fake', 'scripts')
  const { mkdirSync, writeFileSync: wf } = require('node:fs') as typeof import('node:fs')
  mkdirSync(dir, { recursive: true })
  const call = (text: string) => ({ chunks: [
    { type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'stop' } },
  ], paceMs: 60 })
  wf(join(dir, 'default.json'), JSON.stringify({ calls: replies.map((r) => call(r)) }))
}

test('① 真首启：landing 出现（Welcome to Grok Bot + Get started + Skip）——main bot 未建', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct({ ready: false, onboardingFirst: true })
  try {
    const { page } = env
    const landing = page.locator('#sand-onboarding-landing-heading')
    await expect(landing).toBeVisible({ timeout: 30_000 })
    await expect(landing).toBeInViewport() // T26b #1：封面必须在视口内（曾落文档流底部 y=820 屏外）
    await expect(page.locator('.sand-agent-item')).toHaveCount(0) // review HIGH：首启不自动建 main
    expect(await seen(page)).toBeNull()
  } finally {
    await env.stop()
  }
})

test('② Skip：seen 落盘 → 退出引导 → main bot 补建（reloadRoster）→ 主界面可见', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct({ ready: false, onboardingFirst: true })
  try {
    const { page } = env
    await expect(page.locator('#sand-onboarding-landing-heading')).toBeVisible({ timeout: 30_000 })
    await page.locator('[data-action="onboarding-skip"]').click()
    await expect(page.locator('#sand-onboarding-landing-heading')).toHaveCount(0, { timeout: 15_000 })
    await expect.poll(() => seen(page), { timeout: 10_000 }).toBe('1')
    await expect(page.locator('.sand-agent-item').first(), 'skip 后补建 main bot').toBeVisible({ timeout: 30_000 })
  } finally {
    await env.stop()
  }
})

test('③ 老用户（seen=1）启动：不进引导，main bot 照常建立', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct({ ready: false, onboardingFirst: true })
  try {
    const { page } = env
    // launchProduct 起来后第一次 roster：seen 空 → landing。先等 landing 再置 seen 触发 reload？
    // 简化：等 landing 出现（证明首启路径），置 seen 后 reload
    await expect(page.locator('#sand-onboarding-landing-heading')).toBeVisible({ timeout: 30_000 })
    await page.evaluate(() => window.localStorage.setItem('pbots.shim.onboarding-seen', '1'))
    await page.reload()
    await expect(page.locator('.sand-agent-item').first()).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('#sand-onboarding-landing-heading')).toHaveCount(0)
  } finally {
    await env.stop()
  }
})

test('④ 走完 walk：landing → meet → computer-demo → jobs → role → attribution → connect → hand-off 自动建主 bot + 2 模板 bot + 介绍延后', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct({ ready: false, onboardingFirst: true })
  try {
    const { page, rt } = env
    writeDefaultScript(rt.home, [INTRO_TEXT])
    await expect(page.locator('#sand-onboarding-landing-heading')).toBeInViewport({ timeout: 30_000 })
    await page.locator('[data-action="onboarding-start"]').click()
    await expect(page.locator('#sand-onboarding-meet-heading')).toBeVisible({ timeout: 15_000 })
    // T28c：meet 页 cast 有角色子节点（T26 画面回归；aria-hidden 舞台层用 DOM 断言）
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('.sand-onboarding__cast > div').length), { timeout: 10_000 }).toBeGreaterThan(0)
    const coveredAt = async (label: string): Promise<void> => { // T32c：三点——(140,ih/2) 中点 + (34,ih-32) 账号圆 + (160,ih-34) Connect apps 药丸
      const pts = await page.evaluate(() => {
        const probe = (x: number, y: number) => { const hit = document.elementFromPoint(x, y); return { onb: hit?.closest('.sand-onboarding') != null, sb: hit?.closest('.sand-agents-sidebar, .sand-agents-sidebar__account, .sand-agents-sidebar__plugins-entry') != null, what: hit?.getAttribute?.('class')?.slice(0, 30) ?? hit?.tagName ?? 'null' } }
        return { mid: probe(140, window.innerHeight / 2), acct: probe(34, window.innerHeight - 32), pill: probe(160, window.innerHeight - 34) }
      })
      for (const [k, p] of Object.entries(pts)) {
        expect(p.onb, `${label} ${k} 点被引导层盖住`).toBe(true)
        expect(p.sb, `${label} ${k} 点不落侧栏/account/药丸(${p.what})`).toBe(false)
      }
    }
    // T32b ⑩a：meet 页标题 opacity=1（进场完）+侧栏被引导层盖住
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('#sand-onboarding-meet-heading')!).opacity), { timeout: 10_000 }).toBe('1')
    await coveredAt('meet')
    await page.evaluate(() => { (document.querySelector('.sand-onboarding__cast') as HTMLElement).__t32 = 1 }) // T32b F4：meet 打标→connect 验仍在（跨步不重挂）
    // T32b：meet→computer-demo 退场层（第二段）——首次前进即 meet→cd，观察器随点击启动
    const exitsCd = await page.evaluate(() => new Promise<unknown[]>((resolve) => {
      const seen: unknown[] = []
      const root = document.querySelector('.sand-onboarding')!
      const obs = new MutationObserver(() => {
        document.querySelectorAll('.sand-onboarding__step[aria-hidden="true"]').forEach((el) => { seen.push({ anim: (el as HTMLElement).style.animation, heading: el.querySelector('h1, [id^="sand-onboarding"]')?.id ?? el.querySelector('main')?.getAttribute('aria-labelledby') ?? '' }) })
      })
      obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden'] })
      setTimeout(() => { obs.disconnect(); resolve(seen) }, 1200)
      ;([...document.querySelectorAll('.sand-onboarding__step:not([aria-hidden]) button')] as HTMLButtonElement[]).find((b) => b.textContent === 'Next')?.click()
    }))
    expect(JSON.stringify(exitsCd), 'meet→cd 退场 anim').toContain('sand-onboarding-step-exit')
    expect(JSON.stringify(exitsCd), 'meet→cd 退场层含旧步 heading id').toContain('sand-onboarding-meet-heading')
    await expect(page.locator('#sand-onboarding-computer-demo-heading')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.sand-onboarding__step[aria-hidden="true"]')).toHaveCount(0, { timeout: 1000 }) // 退场层 1s 内消失
    // T32b ⑩b：computer-demo 底栏第一钮 Next、第二钮 Back（进场后）
    await page.waitForTimeout(250)
    const cdBtns = await page.locator('.sand-onboarding__step:not([aria-hidden]) .sand-onboarding__computer-demo .sand-onboarding__footer button').allInnerTexts()
    expect(cdBtns[0], 'cd 底栏 Next 先').toBe('Next')
    expect(cdBtns[1], 'cd 底栏 Back 下').toBe('Back')
    // cd → jobs（jobs 页无专属断言，仅过渡）
    await page.locator('.sand-onboarding button', { hasText: 'Next' }).first().click()
    await expect(page.locator('#sand-onboarding-jobs-heading')).toBeVisible({ timeout: 25_000 })
    // T28：0.79.3 walk 无 tools/create——jobs 后直接 role 页
    const nextBtn = page.locator('.sand-onboarding button', { hasText: 'Next' }).first()
    await nextBtn.click() // jobs → role
    await expect(page.locator('#sand-onboarding-role-heading')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('#sand-onboarding-role-heading')).toHaveText('What will you be working on most?')
    // T32 role 页：可见性（9 卡）+几何+编舞+侧栏覆盖+退场
    const visCheck = async (sel: string, expectCount: number): Promise<void> => {
      const bad = await page.locator(sel).evaluateAll((list, selArg) => {
        if (list.length === 0) return ['EMPTY: ' + selArg]
        return list.map((el, i) => {
          const r = el.getBoundingClientRect()
          const cx = r.x + r.width / 2, cy = r.y + r.height / 2
          const hit = document.elementFromPoint(cx, cy)
          const inVp = r.x >= 0 && r.y >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight
          const cls = hit?.getAttribute?.('class') ?? ''
          const cast = hit?.closest('[class^="sand-onboarding__cast-"]')?.getAttribute('class') ?? ''
          const what = cls.slice(0, 30) || cast.slice(0, 40) || hit?.tagName || 'null'
          return hit != null && (hit === el || el.contains(hit)) && inVp ? null : `${selArg}[${i}] 出框或被遮(${what})`
        }).filter(Boolean)
      }, sel)
      expect(bad, `${sel} 必须全部可见`).toEqual([])
      const n = await page.locator(sel).count()
      expect(n, `${sel} 恰 ${expectCount}`).toBe(expectCount)
    }
    const geo = async (cls: string, opts: { w?: number; cols3?: boolean; lastGap?: boolean }): Promise<void> => {
      const g = await page.evaluate((c) => {
        const h1 = document.querySelector(`${c} h1`)!.getBoundingClientRect()
        const grp = document.querySelector(`${c} [role="radiogroup"], ${c} [role="list"]`)!.getBoundingClientRect()
        const btns = [...document.querySelectorAll(`${c} [role="radiogroup"] button, ${c} [role="list"] [role="listitem"]`)].map((b) => b.getBoundingClientRect())
        const fBtn = document.querySelector(`${c} .sand-onboarding__footer button`)?.getBoundingClientRect()
        const foot = document.querySelector(`${c} .sand-onboarding__footer`)!.getBoundingClientRect()
        const sec = document.querySelector(c)!.getBoundingClientRect()
        return { h1Top: h1.top, h1Cx: h1.x + h1.width / 2, grpTop: grp.top, grpCx: grp.x + grp.width / 2, grpW: grp.width, b0: Math.round(btns[0]?.top ?? -1), b2: Math.round(btns[2]?.top ?? -1), b3: Math.round(btns[3]?.top ?? -1), bLast: Math.round(btns[btns.length - 1]?.bottom ?? -1), fBtnTop: Math.round(fBtn?.top ?? -1), footTop: foot.top, secH: sec.height, ih: window.innerHeight, iw: window.innerWidth }
      }, cls)
      expect(g.secH, `${cls} section 满视口（M1 修后）`).toBeGreaterThanOrEqual(g.ih - 2) // M2：section 覆盖断言——12px 偏移无处藏
      expect(Math.abs(g.h1Top - (g.ih / 2 - 264)), `${cls} h1 top（视口基准）`).toBeLessThanOrEqual(2)
      expect(Math.abs(g.h1Cx - g.iw / 2), `${cls} h1 cx`).toBeLessThanOrEqual(2)
      expect(Math.abs(g.grpTop - (g.ih / 2 - 147)), `${cls} grp top`).toBeLessThanOrEqual(2)
      expect(Math.abs(g.grpCx - g.iw / 2), `${cls} grp cx`).toBeLessThanOrEqual(2)
      if (opts.w !== undefined) expect(Math.abs(g.grpW - opts.w), `${cls} grp width`).toBeLessThanOrEqual(2)
      if (opts.cols3 === true) { expect(g.b0, `${cls} 前 3 同排`).toBe(g.b2); expect(g.b3, `${cls} 第 4 换排`).toBeGreaterThan(g.b0) }
      expect(Math.abs(g.footTop - (g.ih / 2 + 240)), `${cls} footer top`).toBeLessThanOrEqual(2)
      if (opts.lastGap === true) expect(g.bLast, `${cls} 末排卡 bottom ≤ 底栏首钮 top−8`).toBeLessThanOrEqual(g.fBtnTop - 8)
    }
    const castOk = async (): Promise<void> => {
      const r = await page.evaluate(() => {
        const mates = ['invoice-chaser', 'weekly-standup', 'sales-forecast'].map((id) => {
          const el = document.querySelector(`.sand-onboarding__cast-${id}`) as HTMLElement | null
          return el === null ? { id, missing: true } : { id, missing: false, opacity: getComputedStyle(el).opacity, state: el.getAttribute('data-character-state'), box: el.getBoundingClientRect().toJSON() }
        })
        const hero = document.querySelector('.sand-onboarding__cast-hero') as HTMLElement | null
        const cards = [...document.querySelectorAll('.sand-onboarding__step:not([aria-hidden]) [role="radiogroup"] button, .sand-onboarding__step:not([aria-hidden]) .sand-onboarding__footer button')].map((b) => b.getBoundingClientRect().toJSON())
        const overlap = mates.filter((m) => !m.missing).some((m) => cards.some((c) => !(m.box.right < c.x || c.right < m.box.x || m.box.bottom < c.y || c.bottom < m.box.y)))
        return { mates, heroOpacity: hero === null ? 'n/a' : getComputedStyle(hero).opacity, overlap }
      })
      for (const m of r.mates) expect(m.missing, `${m.id} cast 在`).toBe(false)
      for (const m of r.mates) if (!m.missing) expect(m.opacity, `${m.id} opacity`).toBe('1')
      expect(r.heroOpacity, 'hero 隐藏').toBe('0')
      expect(r.overlap, 'teammate 不压卡/底栏').toBe(false)
      expect(r.mates.every((m: { state: string | null }) => m.state === 'idle'), '三 teammate idle（state 在角色元素自身）').toBe(true)

    }
    await visCheck('.sand-onboarding__role-choices button', 9)
    await visCheck('.sand-onboarding__role h1', 1)
    await geo('.sand-onboarding__role', { w: 624, cols3: true, lastGap: true })
    await page.waitForTimeout(900)
    await castOk()
    await coveredAt('role')
    await page.locator('[data-choice="engineering"]').click() // 先选——选中后前进钮才是 Next（未选是 Skip）
    const exits = await page.evaluate(() => new Promise<unknown[]>((resolve) => {
      const seen: unknown[] = []
      const root = document.querySelector('.sand-onboarding')!
      const obs = new MutationObserver(() => {
        document.querySelectorAll('.sand-onboarding__step[aria-hidden="true"]').forEach((el) => {
          seen.push({ anim: (el as HTMLElement).style.animation, heading: el.querySelector('h1, [id^="sand-onboarding"]')?.id ?? el.querySelector('main')?.getAttribute('aria-labelledby') ?? '' })
        })
      })
      obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden'] })
      setTimeout(() => { obs.disconnect(); resolve(seen) }, 1200)
      ;([...document.querySelectorAll('.sand-onboarding__step:not([aria-hidden]) button')] as HTMLButtonElement[]).find((b) => b.textContent === 'Next')?.click()
    }))
    expect(exits.length, 'role→attribution 有退场层').toBeGreaterThan(0)
    expect(JSON.stringify(exits)).toContain('sand-onboarding-step-exit')
    expect(JSON.stringify(exits), 'role→attribution 退场层含旧步 heading id').toContain('sand-onboarding-role-heading')
    await expect(page.locator('#sand-onboarding-attribution-heading')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('#sand-onboarding-attribution-heading')).toHaveText('How did you first hear about Grok Bot?')
    await page.waitForTimeout(350) // 进场动画 200ms+进场期 elementFromPoint 命中旧层 span——稳定后再检
    await visCheck('.sand-onboarding__attribution-choices button', 12)
    await geo('.sand-onboarding__attribution', { w: 744, cols3: true, lastGap: true })
    await page.waitForTimeout(900)
    await castOk()
    // attribution 无选择 Skip（tertiary 主钮）
    await page.locator('button[data-action="skip"]', { hasText: 'Skip' }).first().click() // attribution → connect
    await expect(page.locator('#sand-onboarding-connect-heading')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('#sand-onboarding-connect-heading')).toHaveText('Connect your apps')
    await visCheck('.sand-onboarding__connect [role="listitem"]', 2)
    await visCheck('.sand-onboarding__connect h1', 1)
    await geo('.sand-onboarding__connect', {})
    await page.waitForTimeout(900)
    await castOk()
    expect(await page.evaluate(() => (document.querySelector('.sand-onboarding__cast') as HTMLElement).__t32), 'cast meet→connect 不重挂').toBe(1)
    await expect(page.locator('.sand-onboarding__connect button:has-text("Connect")')).toHaveCount(2)

    await page.locator('.sand-onboarding__step:not([aria-hidden]) button', { hasText: 'Skip for now' }).click() // connect → hand-off（排除退场层副本）
    // tools/create 不出现在 walk
    await expect(page.locator('#sand-onboarding-tools-heading, #sand-onboarding-create-name')).toHaveCount(0)
    // 介绍延后断言：Skip for now 后 250ms 内无介绍（dwell 至数百 ms）
    await page.waitForTimeout(250)
    let req = ''
    try { req = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8') } catch { /* 可能整个不存在 */ }
    expect(req, 'walk 内不发介绍（延后到 seen 落盘后）').not.toContain('bot_introduction_request')
    await page.waitForTimeout(2500)
    // hand-off 自动建主 bot + 2 个模板 bot（T28b：engineering 前 2）——后台串行建，轮询等到恰 3
    await expect(page.locator('.sand-agent-item')).toHaveCount(3, { timeout: 45_000 })
    const sidebarText = await page.locator('.sand-agents-sidebar').innerText()
    expect(sidebarText).toContain('Bug Reproduction')
    expect(sidebarText).toContain('Product Performance')
    // order 前三 = 主 bot + 两个模板 bot；mainBotId = 主 bot（标题空——不是模板名）
    const st = await devState(page)
    expect(st.order).toHaveLength(3)
    expect(st.meta.mainBotId).toBe(st.order[0])
    expect(st.meta.mainBotId).not.toBe(st.order[1])
    // T28b review NOTE：order[1]/[2] 对应两个模板——侧栏行序断（第 2/3 行各含一个模板名）
    const rowTexts = await page.locator('.sand-agent-item').allInnerTexts()
    expect(rowTexts[2], '主 bot 行（新 bot 置顶——主在后）').toContain('New chat')
    expect(rowTexts[0]).toMatch(/Bug Reproduction|Product Performance/)
    expect(rowTexts[1]).toMatch(/Bug Reproduction|Product Performance/)
    expect(rowTexts[0]).not.toBe(rowTexts[1])
    // hand-off 后介绍发出（主 bot+2 模板 bot 各一条，≥3 次），creatorContext/模板名都在
    await expect.poll(async () => { try { return readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8') } catch { return '' } }, { timeout: 60_000 }).toContain('bot_introduction_request')
    await expect.poll(async () => { try { return readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8') } catch { return '' } }, { timeout: 45_000 }).toContain('Your name is Bug Reproduction.')
    const finalReq = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8')
    expect(finalReq, 'role 设定句进模型请求').toContain('The user primarily works in Engineering')
    expect(finalReq).toContain('Your name is Product Performance.')
    expect(finalReq).toContain('Repros the bug in staging and drops a pack with steps and screenshots The user primarily works in Engineering')
    expect(finalReq.match(/bot_introduction_request/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    // T60：介绍已发出（≥3 次）后，界面任何显示位都不吃提示原文（dsh 自动标题=第一条 user 消息截断）
    await page.reload()
    await expect(page.locator('.sand-agent-item'), 'reload 后三行侧栏回来').toHaveCount(3, { timeout: 30_000 })
    const after = await page.locator('.sand-agents-sidebar').innerText()
    expect(after, 'T60 侧栏行不吃提示原文').not.toContain('<bot_introduction_request>')
    expect(await page.locator('.sand-chat-composer, textarea, [contenteditable]').first().getAttribute('placeholder') ?? '', 'T60 composer placeholder 不吃提示原文').not.toContain('<bot_introduction_request>')
    // T60 证据：onboarding 完成后的主界面（侧栏+会话头+composer 可见，名字全是正常口径）
    mkdirSync('/home/lingxufeng/bot/work/ui-polish-win/evidence/T60', { recursive: true })
    await page.screenshot({ path: '/home/lingxufeng/bot/work/ui-polish-win/evidence/T60/after-onboarding.png' })
  } finally {
    await env.stop()
  }
})

test('⑤ Back 往返：role 选中→Back→再前进，选择保留', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct({ ready: false, onboardingFirst: true })
  try {
    const { page } = env
    await page.locator('[data-action="onboarding-start"]').click()
    for (const st of ['computer-demo', 'jobs']) { await page.locator('.sand-onboarding button', { hasText: 'Next' }).first().click(); await expect(page.locator(`#sand-onboarding-${st}-heading`)).toBeVisible({ timeout: 20_000 }) }
    await page.locator('.sand-onboarding button', { hasText: 'Next' }).first().click() // → role
    await page.locator('[data-choice="design"]').click()
    await page.locator('.sand-onboarding button', { hasText: 'Back' }).first().click() // ← jobs
    await expect(page.locator('#sand-onboarding-jobs-heading')).toBeVisible({ timeout: 20_000 })
    await page.locator('.sand-onboarding button', { hasText: 'Next' }).first().click() // → role
    await expect(page.locator('[data-choice="design"]')).toHaveAttribute('aria-checked', 'true') // 选择保留
  } finally { await env.stop() }
})

test('⑥ 全 Skip：landing Skip 不建也不介绍；走 walk 全 Skip 也建默认 bot（0.79.3 语义：全跳过仍 hand-off 建 bot）', async () => {
  test.setTimeout(150_000)
  const env = await launchProduct({ ready: false, onboardingFirst: true })
  try {
    const { page, rt } = env
    writeDefaultScript(rt.home, [INTRO_TEXT])
    await page.locator('[data-action="onboarding-start"]').click()
    for (const st of ['computer-demo', 'jobs']) { await page.locator('.sand-onboarding button', { hasText: 'Next' }).first().click(); await expect(page.locator(`#sand-onboarding-${st}-heading`)).toBeVisible({ timeout: 20_000 }) }
    await page.locator('.sand-onboarding__step:not([aria-hidden]) button', { hasText: 'Next' }).first().click() // jobs → role（前循环只到 jobs）
    await expect(page.locator('#sand-onboarding-role-heading')).toBeVisible({ timeout: 20_000 })
    await page.locator('.sand-onboarding__step:not([aria-hidden]) button[data-action="skip"]').click() // role Skip（未选；退场层 aria-hidden 副本须排除——工单边界 5）
    await expect(page.locator('#sand-onboarding-attribution-heading')).toBeVisible({ timeout: 20_000 })
    await page.locator('.sand-onboarding__step:not([aria-hidden]) button[data-action="skip"]').click() // attribution Skip
    await expect(page.locator('#sand-onboarding-connect-heading')).toBeVisible({ timeout: 20_000 })
    await page.locator('button', { hasText: 'Skip for now' }).click() // → hand-off
    await expect(page.locator('.sand-agent-item')).toHaveCount(1, { timeout: 30_000 }) // 全跳过仍建默认 bot
    // creatorContext 空（没选 role）→ 请求里无设定句
    await expect.poll(async () => { try { return readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8') } catch { return '' } }, { timeout: 45_000 }).toContain('bot_introduction_request')
    expect(readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8')).not.toContain('primarily works in')
    expect(readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8'), 'T28b review NOTE：全 Skip 不建模板').not.toContain('Your name is')
  } finally { await env.stop() }
})
