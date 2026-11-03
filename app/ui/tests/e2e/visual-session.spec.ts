// P5-12 E2E（work/p5-parity/PLAN.md P5-12 ①–⑤，定稿 work/p5-parity/ui/P5-12-final.md）：
// ① fake 回复带 reasoning 块 → 推理阶段 live「思考中」行（无空流式气泡）→ 定稿独立 thinking 行，accent 图标、11px/600，鼠标 + 键盘开合；
// ② 时间分隔：阈值 = 0.78.1 `emt=9e5` 900000ms 或跨自然日（work/p1-re/evidence/chunks/index.eager-app-iGTgHP_Q.js
//    @1734517 常量、@1739705 判定函数 vmt）。runtime 真时钟造不出 15 分钟差，阈值 / 跨日 / 缺时在单测
//    tests/unit/session/markers.test.ts；这里测「首条上方恒 1 条、阈值内两条消息之间 0 条」+ margin 0、几何间距 22±1（容器 gap 22，不叠 44）；
// ③ 切走 bot 后它收到新回复，切回 → 未读线恰 1 条、在第一条未读之前、超一屏滚到线、停留期不动；再离开再回来 → 0 条；
// ④ 数值亮暗各一遍 computed 断言。截图存 gitignored app/ui/test-output/P5-12/（U-33）。
import { expect, test, type Locator, type Page } from 'playwright/test'
import { join } from 'node:path'
import { createViaDialog, devState, evidenceOut, launchProduct, send, textCall } from '../support/ui.ts'

const OUT = evidenceOut('P5-12')
const THEMES = ['light', 'dark'] as const

/** fake LLM 一次调用：reasoning 块（dsh-llm-pi-ai thinking_* → block-start reasoning / reasoning-delta / block-end）再接正文块。 */
function reasoningCall(reasoning: string[], text: string[], paceMs: number): object {
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      ...reasoning.map((t) => ({ type: 'reasoning-delta', index: 0, text: t })),
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: reasoning.join('') } },
      { type: 'block-start', index: 1, blockType: 'text' },
      ...text.map((t) => ({ type: 'text-delta', index: 1, text: t })),
      { type: 'block-end', index: 1, block: { type: 'text', text: text.join('') } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
    paceMs,
  }
}

const css = (loc: Locator, props: string[]): Promise<Record<string, string>> =>
  loc.evaluate((el, ps) => Object.fromEntries(ps.map((p) => [p, getComputedStyle(el).getPropertyValue(p)])), props)

/** token 的 computed 颜色（探针元素，跟随当前 data-theme）。 */
const tokenColor = (page: Page, token: string): Promise<string> => page.evaluate((t) => {
  const el = document.createElement('div')
  el.style.color = `var(${t})`
  document.body.appendChild(el)
  const c = getComputedStyle(el).color
  el.remove()
  return c
}, token)

async function theme(page: Page, mode: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: mode })
  await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
}

/** a 的下边到 b 的上边（px）。 */
async function gap(a: Locator, b: Locator): Promise<number> {
  const [ra, rb] = [(await a.boundingBox())!, (await b.boundingBox())!]
  return rb.y - (ra.y + ra.height)
}

test('B7 thinking 行（live → 定稿、鼠标 / 键盘开合）+ B14 时间分隔（首条 1 条、阈值内 0 条、几何 22）亮暗', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    await env.shell.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 820) })
    const x = await createViaDialog(page, 'standard')
    rt.writeScriptCalls(x, [
      reasoningCall(['先想一想：', '比较 A 与 B', '\n第二行推理'], ['答案是 A。'], 700),
      textCall(['第二条回复。']),
      reasoningCall(['第三问推理首行', '\n第三问推理次行'], ['第三条回复。'], 1500),
    ])
    await send(page, '问题一')

    // ① live：推理阶段只有「思考中」行，没有空流式气泡、也没有三点（同一帧原子取样）
    const live = await page.waitForFunction(() => {
      const row = document.querySelector('.thinking-row[data-live]')
      if (row === null) return false
      return {
        label: row.querySelector('.thinking-label')?.textContent,
        bubbles: document.querySelectorAll('.bubble.streaming').length,
        dots: document.querySelectorAll('.bubble.thinking').length,
      }
    }, undefined, { timeout: 20_000 })
    expect(await live.jsonValue()).toEqual({ label: '思考中', bubbles: 0, dots: 0 })

    await expect(page.locator('.bubble.assistant.final')).toHaveText('答案是 A。', { timeout: 20_000 })
    const row = page.locator('.thinking-row')
    await expect(row).toHaveCount(1)
    await expect(row).not.toHaveAttribute('data-live', /.*/)
    await expect(row.locator('.thinking-label')).toHaveText('思考')
    await expect(row.locator('.thinking-preview')).toHaveText('先想一想：比较 A 与 B')
    // 独立成行、在气泡之前
    expect(await row.evaluate((el) => el.nextElementSibling?.matches('.bubble.assistant.final'))).toBe(true)

    // 鼠标开合
    const btn = row.locator('button.tool-line')
    await expect(btn).toHaveAttribute('aria-expanded', 'false')
    await expect(row.locator('[data-thinking-detail]')).toHaveCount(0)
    await btn.click()
    await expect(btn).toHaveAttribute('aria-expanded', 'true')
    const detail = row.locator('[data-thinking-detail]')
    await expect(detail).toContainText('第二行推理')
    expect(await btn.getAttribute('aria-controls')).toBe(await detail.getAttribute('id'))
    await page.screenshot({ path: join(OUT, 'thinking-open-light.png') })
    await btn.click()
    await expect(detail).toHaveCount(0)
    // 键盘开合：Enter 开、Space 收
    await btn.focus()
    await page.keyboard.press('Enter')
    await expect(btn).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Space')
    await expect(btn).toHaveAttribute('aria-expanded', 'false')
    await expect(row.locator('[data-thinking-detail]')).toHaveCount(0)

    // ② 第二条消息（阈值内）→ 全流 1 条分隔行，在首条（用户消息「问题一」）上方
    await send(page, '问题二')
    await expect(page.locator('.bubble.assistant.final').last()).toHaveText('第二条回复。', { timeout: 20_000 })
    const seps = page.locator('.chat-col > [data-time-sep]')
    await expect(seps).toHaveCount(1)
    const sep = seps.first()
    await expect(sep).toHaveAttribute('role', 'separator')
    await expect(sep).toHaveText(/^今天 \d\d:\d\d$/)
    const first = page.locator('.bubble.user.final').first()
    await expect(first).toHaveText('问题一')
    expect(await sep.evaluate((el) => (el.nextElementSibling as HTMLElement | null)?.textContent)).toBe('问题一')
    // 几何：分隔行 → 首条 22±1（margin 0，靠容器 gap；不叠成 44）；分隔行顶 = chat-col 上内边距 28
    expect(Math.abs(await gap(sep, first) - 22)).toBeLessThanOrEqual(1)
    const colTop = (await page.locator('.chat-col').boundingBox())!.y
    expect(Math.abs((await sep.boundingBox())!.y - colTop - 28)).toBeLessThanOrEqual(1)

    // ④ 亮暗数值
    for (const mode of THEMES) {
      await theme(page, mode)
      expect(await css(sep, ['font-size', 'text-align', 'margin-top', 'margin-bottom', 'color'])).toEqual({
        'font-size': '11px', 'text-align': 'center', 'margin-top': '0px', 'margin-bottom': '0px', color: await tokenColor(page, '--sand-text-tertiary'),
      })
      expect(await css(row.locator('.tool-line > .icon'), ['color', 'font-family'])).toEqual({
        color: await tokenColor(page, '--sand-text-accent-primary'), 'font-family': 'cursor-icons',
      })
      expect(await row.locator('.tool-line > .icon').textContent()).toBe(String.fromCodePoint(0xf429))
      expect(await css(row.locator('.thinking-label'), ['font-size', 'font-weight', 'color'])).toEqual({
        'font-size': '11px', 'font-weight': '600', color: await tokenColor(page, '--dsw-alias-label-secondary'),
      })
      expect(await css(btn, ['min-height', 'padding'])).toEqual({ 'min-height': '34px', padding: '7px 9px' })
      await page.screenshot({ path: join(OUT, `thinking-sep-${mode}.png`) })
    }
    await theme(page, 'light')

    // ⑤ P5-12.f1（GU-P5-12 第 1 条）：live 期展开并聚焦 → 定稿后同一节点、仍展开、焦点不丢、行不上跳
    await send(page, '问题三')
    const liveRow = page.locator('.thinking-row[data-live]')
    const liveBtn = liveRow.locator('button.tool-line')
    await expect(liveRow.locator('.thinking-label')).toHaveText('思考中', { timeout: 20_000 })
    await liveBtn.focus()
    await page.keyboard.press('Enter')
    await expect(liveBtn).toHaveAttribute('aria-expanded', 'true')
    await liveBtn.evaluate((el) => { (el as HTMLElement & { __f1?: boolean }).__f1 = true }) // 节点身份标记
    await expect(page.locator('.bubble.assistant.final').last()).toHaveText('第三条回复。', { timeout: 20_000 })
    const after = await page.evaluate(() => {
      const rows = document.querySelectorAll('.thinking-row')
      const r = rows[rows.length - 1]!
      const b = r.querySelector<HTMLElement & { __f1?: boolean }>('button.tool-line')!
      return {
        live: r.hasAttribute('data-live'), label: r.querySelector('.thinking-label')?.textContent,
        sameNode: b.__f1 === true, expanded: b.getAttribute('aria-expanded'), focused: document.activeElement === b,
        detail: r.querySelector('[data-thinking-detail]')?.textContent,
      }
    })
    expect(after).toEqual({ live: false, label: '思考', sameNode: true, expanded: 'true', focused: true, detail: '第三问推理首行\n第三问推理次行' })
  } finally {
    await env.stop()
  }
})

test('B14 未读线：切走后对方回复 → 切回恰 1 条、在首条未读前、超一屏滚到线、停留期不动；再进 0 条；亮暗', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    await env.shell.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 820) })
    const main = (await devState(page)).meta.mainBotId!
    const x = await createViaDialog(page, 'standard')
    const long = Array.from({ length: 60 }, (_, i) => `第 ${i + 1} 段`).join('\n\n') // 段落分隔，Markdown 下真成 60 段（超一屏）
    rt.writeScriptCalls(x, [
      textCall(['第一轮。']),
      textCall(['第二轮回复\n\n', long], { paceMs: 1500 }),
      textCall(['停留期新到。']),
    ])
    const itemX = page.locator(`.bot-item[data-session="${x}"]`)
    const itemMain = page.locator(`.bot-item[data-session="${main}"]`)
    const finals = page.locator('.bubble.assistant.final')

    await send(page, '一')
    await expect(finals).toHaveText(['第一轮。'], { timeout: 20_000 })
    await expect(page.locator('[data-working]')).toHaveCount(0, { timeout: 20_000 })
    await expect(page.locator('[data-unread-line]')).toHaveCount(0) // 首次进入无基线

    // 发出第二问后立刻切走：回复在 X 不可见时到达
    await send(page, '二')
    await itemMain.click()
    await expect.poll(() => page.evaluate((sid) => {
      const st = (window as unknown as { __pbotsDev: { state: { views: Record<string, { items: Array<{ kind: string }> }>; summaries: Record<string, { running: boolean }> } } }).__pbotsDev.state
      return (st.views[sid]?.items.filter((i) => i.kind === 'assistant').length ?? 0) === 2 && st.summaries[sid]?.running === false
    }, x), { timeout: 30_000 }).toBe(true)
    await expect(itemX).toHaveAttribute('data-unread', 'true')

    await itemX.click()
    const line = page.locator('[data-unread-line]')
    await expect(line).toHaveCount(1)
    await expect(line).toHaveAttribute('role', 'separator')
    await expect(line).toHaveText('新消息')
    const next = (): Promise<string | undefined> => line.evaluate((el) => {
      let n = el.nextElementSibling
      while (n !== null && n.matches('[data-time-sep]')) n = n.nextElementSibling
      return n?.textContent?.slice(0, 5)
    })
    expect(await next()).toBe('第二轮回复')
    // 超一屏 → 线滚到视口顶下 28（不贴底）
    const tr = (await page.locator('.transcript').boundingBox())!
    expect(Math.abs((await line.boundingBox())!.y - tr.y - 28)).toBeLessThanOrEqual(2)
    // 几何：上一行 → 线、线 → 下一行 各 22±1
    const prevEl = line.locator('xpath=preceding-sibling::*[1]')
    const nextEl = line.locator('xpath=following-sibling::*[1]')
    expect(Math.abs(await gap(prevEl, line) - 22)).toBeLessThanOrEqual(1)
    expect(Math.abs(await gap(line, nextEl) - 22)).toBeLessThanOrEqual(1)

    for (const mode of THEMES) {
      await theme(page, mode)
      expect(await css(line, ['font-size', 'column-gap', 'margin-top', 'margin-bottom', 'color'])).toEqual({
        'font-size': '11px', 'column-gap': '10px', 'margin-top': '0px', 'margin-bottom': '0px', color: await tokenColor(page, '--sand-text-accent-primary'),
      })
      await page.screenshot({ path: join(OUT, `unread-${mode}.png`) })
    }
    await theme(page, 'light')

    // 停留期间新到消息：线不动、不长第二条
    await send(page, '三')
    await expect(finals.last()).toHaveText('停留期新到。', { timeout: 20_000 })
    await expect(line).toHaveCount(1)
    expect(await next()).toBe('第二轮回复')

    // 离开再回来 → 已读，0 条
    await itemMain.click()
    await itemX.click()
    await expect(finals.last()).toHaveText('停留期新到。')
    await expect(page.locator('[data-unread-line]')).toHaveCount(0)
  } finally {
    await env.stop()
  }
})
