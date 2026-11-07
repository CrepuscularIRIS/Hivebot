// T25 · kickstart 自我介绍（工单验收 2 ①-⑥）：创建成功即发介绍提示（模型现场写文案），
// 提示本身在 transcript/outline 两处隐藏（reload 后仍认得）；kickstart:false 抑制；
// 失败 notice 不被介绍提示顶掉。前置：pnpm build。
import { expect, test, type Page } from 'playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { finalAssistant, launchProduct, openOutline, transcript } from '../support/ui.ts'

const INTRO = 'Hi! I am your new bot, happy to help.'

/** default.json：fake LLM 的兜底脚本（介绍轮没有 sid 专属脚本时走它）。 */
const writeDefaultScript = (home: string, replies: string[]): void => {
  const dir = join(home, 'fake', 'scripts')
  mkdirSync(dir, { recursive: true })
  const call = (text: string) => ({ chunks: [
    { type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'stop' } },
  ], paceMs: 60 })
  writeFileSync(join(dir, 'default.json'), JSON.stringify({ calls: replies.map((r) => call(r)) })) // fake plugin 读 {calls:[…]} 形态
}

const userRows = (page: Page) => transcript(page).locator('.sand-transcript-row[data-role="user"]')

test('① 介绍出现：提示到模型（requests.jsonl 可证）、user 行 0、正文不含标签', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    writeDefaultScript(rt.home, [INTRO])
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    await page.locator('dialog[data-dialog="new-bot"] [data-action="create-bot"]').click()
    await expect(finalAssistant(page).last()).toContainText(INTRO, { timeout: 30_000 })
    await expect(userRows(page)).toHaveCount(0)
    expect((await page.locator('body').innerText())).not.toContain('bot_introduction_request')
    // 提示真的到了模型（不是本地伪造）
    const reqLine = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8')
    expect(reqLine).toContain('<bot_introduction_request>')
  } finally {
    await env.stop()
  }
})

test('② reload 后介绍仍在、user 行仍 0（按内容匹配经历史重放有效）', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    writeDefaultScript(rt.home, [INTRO])
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    await page.locator('dialog[data-dialog="new-bot"] [data-action="create-bot"]').click()
    await expect(finalAssistant(page).last()).toContainText(INTRO, { timeout: 30_000 })
    await page.reload()
    await expect(page.locator('.sand-agent-item').first()).toBeVisible({ timeout: 60_000 })
    await expect(finalAssistant(page).last()).toContainText(INTRO, { timeout: 30_000 })
    await expect(userRows(page)).toHaveCount(0)
  } finally {
    await env.stop()
  }
})

test('③ outline：无 user 行、介绍是 assistant-text', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    writeDefaultScript(rt.home, [INTRO])
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    await page.locator('dialog[data-dialog="new-bot"] [data-action="create-bot"]').click()
    await expect(finalAssistant(page).last()).toContainText(INTRO, { timeout: 30_000 })
    const rowLabel = await page.locator('.sand-agent-item[data-active="true"]').getAttribute('aria-label') ?? 'New chat'
    const panel = await openOutline(page, rowLabel)
    await expect(panel.locator('.sand-outline-item[data-kind="user"]')).toHaveCount(0)
    await expect(panel.locator('.sand-outline-item[data-kind="assistant-text"]', { hasText: INTRO })).toHaveCount(1)
  } finally {
    await env.stop()
  }
})

test('④ 用户接着说话：恰 1 条 user 行（hello there），介绍在上方', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    writeDefaultScript(rt.home, [INTRO, 'reply']) // 介绍轮消费 default[0]，用户轮消费 default[1]
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    await page.locator('dialog[data-dialog="new-bot"] [data-action="create-bot"]').click()
    await expect(finalAssistant(page).last()).toContainText(INTRO, { timeout: 30_000 })
    const { send } = await import('../support/ui.ts')
    await send(page, 'hello there')
    await expect(finalAssistant(page).last()).toContainText('reply', { timeout: 30_000 })
    await expect(userRows(page)).toHaveCount(1)
    await expect(userRows(page).first()).toContainText('hello there')
  } finally {
    await env.stop()
  }
})

test('⑤ kickstart:false 抑制：无 prompt 行、无 assistant 行', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const before = (await import('../support/ui.ts')).devState ? await (await import('../support/ui.ts')).devState(page) : null
    const presets = await page.evaluate(async () => {
      const r = await (window as unknown as { pbots: { api(m: string, a?: unknown): Promise<{ value: unknown }> } }).pbots.api('agentPresets/list', {})
      const list = ((r as { value: { presets?: Array<{ id: string; isDefault?: boolean }> } }).value ?? {}).presets ?? []
      return list.find((p) => p.isDefault)?.id ?? list[0]?.id ?? ''
    })
    const beforeCount = before?.order.length ?? 0
    await page.evaluate(async (preset) => {
      const w = window as unknown as { pbotsUi?: { createBot(req: unknown): Promise<{ ok: boolean; sessionId: string | null }> } }
      await w.pbotsUi?.createBot({ preset, connectors: [], kickstart: false })
    }, presets)
    await page.waitForTimeout(5000)
    // kickstart:false + 无脚本 → fake 从未被调，requests.jsonl 可能整个不存在
    let reqLine = ''
    try { reqLine = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8') } catch { /* 无调用 = 无文件，同样证明没发 */ }
    const st = await (await import('../support/ui.ts')).devState(page)
    const newSids = st.order.filter((id: string) => !(before?.order ?? []).includes(id))
    for (const sid of newSids) expect(reqLine, `${sid} 不应有 prompt`).not.toContain(sid)
    expect(st.order.length).toBe(beforeCount + 1)
    // view 层兜底（M4 咬合）：被忽略的 kickstart:false 会在新 bot 的 view 里留下
    // kickstart user + 失败 notice（fake 无脚本）——抑制生效时 items 恒空
    for (const sid of newSids) expect(st.views[sid]?.items ?? [], `${sid} 不应有任何条目`).toEqual([])
  } finally {
    await env.stop()
  }
})

test('⑦ model notice 与介绍共存（M5 咬合）：kickstart user 不得撤掉 model 失败的 notice', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    writeDefaultScript(rt.home, [INTRO])
    await page.evaluate(() => (window as unknown as { __pbotsDev: { failNext(m: string): void } }).__pbotsDev.failNext('session/selectModel'))
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    // 选一个具体 model（默认空 = 不调 selectModel）
    const modelSelect = page.locator('dialog[data-dialog="new-bot"] select[data-model-select]')
    await expect(modelSelect).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(1500) // 等 modelCatalog 加载
    const options = await modelSelect.locator('option').all()
    if (options.length > 1) await modelSelect.selectOption({ index: 1 })
    await page.locator('dialog[data-dialog="new-bot"] [data-action="create-bot"]').click()
    // 介绍照常出现（prompt 成功；kickstart user 已落 view）
    await expect(finalAssistant(page).last()).toContainText(INTRO, { timeout: 30_000 })
    // model 失败的 notice 仍在（M5 变异下会被 kickstart user 顶掉）
    await expect(transcript(page)).toContainText("Bot created, but the model wasn't changed", { timeout: 20_000 })
  } finally {
    await env.stop()
  }
})

test('⑥ 失败 notice：failNext(session/prompt) → bot 照常建好 + Your Bot couldn\'t introduce itself', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await page.evaluate(() => (window as unknown as { __pbotsDev: { failNext(m: string): void } }).__pbotsDev.failNext('session/prompt'))
    const before = await (await import('../support/ui.ts')).devState(page)
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    await page.locator('dialog[data-dialog="new-bot"] [data-action="create-bot"]').click()
    await expect(page.locator('.sand-agent-item')).toHaveCount(before.order.length + 1, { timeout: 30_000 })
    await expect(transcript(page)).toContainText("Your Bot couldn't introduce itself", { timeout: 20_000 })
  } finally {
    await env.stop()
  }
})
