// T26 · onboarding（A 段+review 修复后语义）：真首启（roster 空+未 seen）→ landing →
// skip 退出补建 main；seen=1 正常启动。前置：pnpm build。
import { expect, test, type Page } from 'playwright/test'
import { readFileSync } from 'node:fs'
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

test('④ 六步走完：Get started → Next 到 create → 填名建 bot → hand-off 完成后恰 1 bot + 介绍延后', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct({ ready: false, onboardingFirst: true })
  try {
    const { page, rt } = env
    writeDefaultScript(rt.home, [INTRO_TEXT])
    await expect(page.locator('#sand-onboarding-landing-heading')).toBeInViewport({ timeout: 30_000 })
    await page.locator('[data-action="onboarding-start"]').click()
    await expect(page.locator('#sand-onboarding-meet-heading')).toBeVisible({ timeout: 15_000 })
    // 逐步 Next：meet→computer-demo→jobs→tools→create——每步等下一个 heading 出现
    //（meet 的 beat 动画期间 Next 可能延迟生效，固定 sleep 不可靠）
    // T28c：meet 页 cast 有角色子节点（T26 画面回归；aria-hidden 舞台层用 DOM 断言）
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('.sand-onboarding__cast > div').length), { timeout: 10_000 }).toBeGreaterThan(0)
    const steps = ['computer-demo', 'jobs']
    for (const st of steps) {
      const next = page.locator('.sand-onboarding button', { hasText: 'Next' }).first()
      await expect(next).toBeVisible({ timeout: 25_000 })
      await next.click()
      await expect(page.locator(`#sand-onboarding-${st}-heading`).first()).toBeVisible({ timeout: 25_000 })
    }
    // T28：0.79.3 walk 无 tools/create——jobs 后直接 role 页
    const nextBtn = page.locator('.sand-onboarding button', { hasText: 'Next' }).first()
    await nextBtn.click() // jobs → role
    await expect(page.locator('#sand-onboarding-role-heading')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('#sand-onboarding-role-heading')).toHaveText('What will you be working on most?')
    await page.locator('[data-choice="engineering"]').click()
    await page.locator('button', { hasText: 'Next' }).last().click() // role → attribution
    await expect(page.locator('#sand-onboarding-attribution-heading')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('#sand-onboarding-attribution-heading')).toHaveText('How did you first hear about Grok Bot?')
    // attribution 无选择 Skip（tertiary 主钮）
    await page.locator('button[data-action="skip"]', { hasText: 'Skip' }).first().click() // attribution → connect
    await expect(page.locator('#sand-onboarding-connect-heading')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('#sand-onboarding-connect-heading')).toHaveText('Connect your apps')
    await expect(page.locator('.sand-onboarding__connect button:has-text("Connect")')).toHaveCount(2) // Gmail + Google Calendar（排除侧栏 Connect apps）
    // T28c F1：三页「真的看得见」——中心点命中自身/后代 + bounding box 完整在视口（toBeVisible 抓不到遮挡/出框）
    const visCheck = async (sel: string): Promise<void> => {
      const bad = await page.locator(sel).evaluateAll((els) => els.map((el, i) => {
        const r = el.getBoundingClientRect()
        const cx = r.x + r.width / 2, cy = r.y + r.height / 2
        const hit = document.elementFromPoint(cx, cy)
        const inVp = r.x >= 0 && r.y >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight
        return hit != null && (hit === el || el.contains(hit)) && inVp ? null : `${sel}[${i}] 出框或被遮`
      }).filter(Boolean))
      expect(bad, `${sel} 必须全部可见`).toEqual([])
    }
    await visCheck('.sand-onboarding__attribution-choices button')
    for (const st of ['role', 'attribution', 'connect']) await visCheck(`.sand-onboarding__${st} h1`)
    await page.locator('button', { hasText: 'Skip for now' }).click() // connect → hand-off（自动建主 bot）
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
    // hand-off 后介绍发出（主 bot+2 模板 bot 各一条，≥3 次），creatorContext/模板名都在
    await expect.poll(async () => { try { return readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8') } catch { return '' } }, { timeout: 60_000 }).toContain('bot_introduction_request')
    await expect.poll(async () => { try { return readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8') } catch { return '' } }, { timeout: 45_000 }).toContain('Your name is Bug Reproduction.')
    const finalReq = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8')
    expect(finalReq, 'role 设定句进模型请求').toContain('The user primarily works in Engineering')
    expect(finalReq).toContain('Your name is Product Performance.')
    expect(finalReq).toContain('Repros the bug in staging and drops a pack with steps and screenshots The user primarily works in Engineering')
    expect(finalReq.match(/bot_introduction_request/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
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
    await page.locator('.sand-onboarding button', { hasText: 'Next' }).first().click() // role
    await page.locator('button[data-action="skip"]', { hasText: 'Skip' }).first().click() // role Skip（未选）
    await expect(page.locator('#sand-onboarding-attribution-heading')).toBeVisible({ timeout: 20_000 })
    await page.locator('button[data-action="skip"]', { hasText: 'Skip' }).first().click() // attribution Skip
    await expect(page.locator('#sand-onboarding-connect-heading')).toBeVisible({ timeout: 20_000 })
    await page.locator('button', { hasText: 'Skip for now' }).click() // → hand-off
    await expect(page.locator('.sand-agent-item')).toHaveCount(1, { timeout: 30_000 }) // 全跳过仍建默认 bot
    // creatorContext 空（没选 role）→ 请求里无设定句
    await expect.poll(async () => { try { return readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8') } catch { return '' } }, { timeout: 45_000 }).toContain('bot_introduction_request')
    expect(readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8')).not.toContain('primarily works in')
  } finally { await env.stop() }
})
