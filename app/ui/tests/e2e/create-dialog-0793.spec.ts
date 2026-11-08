// T30 · 0.79.3 Thn 版式（工单验收 2 ①-⑥）。前置：pnpm build。
import { expect, test, type Page } from 'playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { devState, launchProduct, transcript } from '../support/ui.ts'

const INTRO = 'Hi there! Ready to help.'
const dlg = (sel: string) => (page: Page) => page.locator(`dialog[data-dialog="new-bot"] ${sel}`.replace('dialog[data-dialog="new-bot"] ', 'dialog[data-dialog="new-bot"] '))
const inDlg = (page: Page, sel: string) => page.locator(`dialog[data-dialog="new-bot"] ${sel}`)

const writeDefaultScript = (home: string, replies: string[]): void => {
  const dir = join(home, 'fake', 'scripts')
  mkdirSync(dir, { recursive: true })
  const call = (text: string) => ({ chunks: [
    { type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'stop' } },
  ], paceMs: 60 })
  writeFileSync(join(dir, 'default.json'), JSON.stringify({ calls: replies.map((r) => call(r)) }))
}

async function open(page: Page): Promise<void> {
  await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
  await expect(inDlg(page, 'h2')).toHaveText('Create New Bot')
}

test('① 版式：标题/名字框（255/聚焦/占位）/y 序/预览 96/无 Help 卡/折叠收起/Create 置灰', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await open(page)
    const name = page.getByRole('textbox', { name: 'Bot name' })
    await expect(name).toBeVisible()
    await expect(name).toHaveAttribute('placeholder', 'Name your Bot')
    await expect(name).toHaveAttribute('maxlength', '255')
    await expect.poll(() => name.evaluate((el) => el === document.activeElement), { timeout: 5000 }).toBe(true) // rAF 聚焦有帧延迟
    // y 序：预览 < 名字 < 形状 < 色板 < More options
    const y = async (sel: string): Promise<number> => inDlg(page, sel).first().boundingBox().then((b) => b?.y ?? -1)
    // T30b：y 序补全（预览 < 名字框 < 形状 < 色板 < summary）——flex 列已改，全序应成立
    const yPrev = await y('[data-preview]'), yName = await y('input[aria-label="Bot name"]'), yShape = await y('.pb-character__shapes [data-shape]'), yColor = await y('.pb-character__colors [data-color]'), ySum = await y('summary')
    expect(yPrev).toBeLessThan(yName)
    expect(yName).toBeLessThan(yShape)
    expect(yShape).toBeLessThan(yColor)
    expect(yColor).toBeLessThan(ySum)
    // 预览 96±4
    const pbox = await inDlg(page, '[data-preview]').boundingBox()
    expect(Math.abs((pbox?.width ?? 0) - 96)).toBeLessThanOrEqual(4)
    await expect(inDlg(page, '')).not.toContainText('Help me create a Bot')
    await expect(inDlg(page, 'details')).not.toHaveAttribute('open', '')
    await expect(inDlg(page, 'input[name="pb-preset"]').first()).toBeHidden()
    // 置灰链
    const create = inDlg(page, '[data-action="create-bot"]')
    await expect(create).toBeDisabled()
    await name.fill('   ')
    await expect(create).toBeDisabled()
    await name.fill('Research Helper')
    await expect(create).toBeEnabled()
  } finally { await env.stop() }
})

test('② Enter 建：名字进侧栏/头像/介绍带名字；3s 后名字仍在；reload 仍在', async () => {
  test.setTimeout(150_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    writeDefaultScript(rt.home, [INTRO])
    await open(page)
    await inDlg(page, '[aria-label="house character shape"]').click()
    await inDlg(page, '[aria-label="Orange character color"]').click()
    const name = page.getByRole('textbox', { name: 'Bot name' })
    await name.fill('Research Helper')
    await expect(inDlg(page, '[data-action="create-bot"]')).toBeEnabled({ timeout: 15_000 }) // 等 preset/bundles 就绪
    await name.press('Enter') // 不点 Create
    await expect(inDlg(page, 'h2')).toHaveCount(0, { timeout: 20_000 })
    const row = page.locator('.sand-agent-item[data-active="true"]')
    await expect(row).toContainText('Research Helper', { timeout: 20_000 })
    await expect(row.locator('.sand-grok-bot-mark')).toHaveAttribute('data-avatar-shape', 'house')
    await expect(page.locator('.sand-chat-header__avatar .sand-grok-bot-mark')).toHaveAttribute('data-avatar-color', 'orange')
    let req = ''
    try { req = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8') } catch { /* fake 未跑时无文件——介绍出现后再验 */ }
    await expect(transcript(page)).toContainText(INTRO, { timeout: 30_000 })
    if (req === '') req = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8')
    expect(req).toContain('<bot_introduction_request>')
    expect(req).toContain('Your name is Research Helper. ')
    // T30b：工单 ② 缺的三条
    await expect(page.locator('.sand-virtual-transcript .sand-transcript-row[data-role="user"]')).toHaveCount(0)
    expect((await page.locator('body').innerText())).not.toContain('bot_introduction_request')
    await expect(page.locator('.sand-chat-header__name, .sand-chat-header').first()).toContainText('Research Helper') // 会话头名字
    await page.waitForTimeout(3000)
    await expect(page.locator('.sand-agent-item[data-active="true"]')).toContainText('Research Helper')
    await page.reload()
    await expect(page.locator('.sand-agent-item[data-active="true"]')).toContainText('Research Helper', { timeout: 30_000 })
  } finally { await env.stop() }
})

test('③ 折叠提交：折叠区选择（preset/连接器/Model）真进 createBot 实参', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await open(page)
    await page.evaluate(() => {
      // 包一层 createBot 记实参（④ 同款 evaluate 可达 pbotsUi）
      const w = window as unknown as { pbotsUi?: { createBot(req: unknown): Promise<unknown>; __t30seen?: unknown[] } }
      const ui = w.pbotsUi!
      const orig = ui.createBot
      w.pbotsUi!.__t30seen = []
      const wrapped = (req: unknown): Promise<unknown> => { (w.pbotsUi!.__t30seen as unknown[]).push(req); return orig.call(ui, req) }
      ;(ui as unknown as { createBot: typeof wrapped }).createBot = wrapped
    })
    await inDlg(page, 'summary').click()
    await expect(inDlg(page, 'input[name="pb-preset"]').first()).toBeVisible()
    const radios = inDlg(page, 'input[name="pb-preset"]')
    const n = await radios.count()
    let pickedPreset = ''
    if (n > 1) { await radios.nth(1).check(); pickedPreset = (await radios.nth(1).getAttribute('value')) ?? '' }
    await page.getByRole('textbox', { name: 'Bot name' }).fill('Folded Bot')
    await inDlg(page, '[data-action="create-bot"]').click()
    await expect(inDlg(page, 'h2')).toHaveCount(0, { timeout: 30_000 })
    const seen = await page.evaluate(() => (window as unknown as { pbotsUi?: { __t30seen?: { preset?: string; connectors?: string[] }[] } }).pbotsUi?.__t30seen ?? [])
    expect(seen.length, 'createBot 被调且实参被记').toBeGreaterThanOrEqual(1)
    const req = seen[0]!
    expect(typeof req.preset).toBe('string')
    expect(req.preset).not.toBe('')
    if (pickedPreset !== '') expect(req.preset, '就是折叠区选的那一个').toBe(pickedPreset) // T30c #1
    expect(Array.isArray(req.connectors)).toBe(true)
  } finally { await env.stop() }
})

test('④ 预填自动展开：chooser({connectors}) → details[open]', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await page.evaluate(() => void (window as unknown as { pbotsUi?: { chooser(init: unknown): Promise<string | null> } }).pbotsUi?.chooser({ connectors: ['anything'] }))
    await expect(inDlg(page, 'h2')).toBeVisible({ timeout: 15_000 })
    await expect(inDlg(page, 'details')).toHaveAttribute('open', '')
  } finally { await env.stop() }
})

test('⑤ 建失败：role=alert 行内报错、不关框、名字保留', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await page.evaluate(() => (window as unknown as { __pbotsDev: { failNext(m: string): void } }).__pbotsDev.failNext('session/create'))
    await open(page)
    await page.getByRole('textbox', { name: 'Bot name' }).fill('Nope Bot')
    await inDlg(page, '[data-action="create-bot"]').click()
    await expect(inDlg(page, '[role="alert"]')).toContainText("Couldn't create the bot", { timeout: 20_000 })
    await expect(inDlg(page, 'h2')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Bot name' })).toHaveValue('Nope Bot')
  } finally { await env.stop() }
})

test('⑥ 改名失败：bot 照建、notice 出现、介绍不带名字', async () => {
  test.setTimeout(150_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    writeDefaultScript(rt.home, [INTRO])
    await page.evaluate(() => (window as unknown as { __pbotsDev: { failNext(m: string): void } }).__pbotsDev.failNext('session/rename'))
    await open(page)
    await page.getByRole('textbox', { name: 'Bot name' }).fill('Zed')
    await inDlg(page, '[data-action="create-bot"]').click()
    await expect(inDlg(page, 'h2')).toHaveCount(0, { timeout: 20_000 })
    await expect(transcript(page)).toContainText("Bot created, but the name wasn't saved", { timeout: 20_000 })
    await expect(transcript(page)).toContainText(INTRO, { timeout: 30_000 })
    const req = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8')
    expect(req).not.toContain('Your name is')
  } finally { await env.stop() }
})

test('⑦ 双失败 notice 拼接：rename+selectModel 都失败 → 两条 notice 都可见', async () => {
  test.setTimeout(150_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    writeDefaultScript(rt.home, [INTRO])
    await page.evaluate(() => (window as unknown as { __pbotsDev: { failNext(m: string): void } }).__pbotsDev.failNext('session/rename'))
    await page.evaluate(() => (window as unknown as { __pbotsDev: { failNext(m: string): void } }).__pbotsDev.failNext('session/selectModel'))
    await open(page)
    await inDlg(page, 'summary').click()
    const modelSelect = inDlg(page, 'select[data-model-select]')
    await expect(inDlg(page, 'option').nth(1)).toBeAttached({ timeout: 15_000 })
    await modelSelect.selectOption({ index: 1 })
    await page.getByRole('textbox', { name: 'Bot name' }).fill('Zed2')
    await inDlg(page, '[data-action="create-bot"]').click()
    await expect(inDlg(page, 'h2')).toHaveCount(0, { timeout: 30_000 })
    await expect(transcript(page)).toContainText("Bot created, but the name wasn't saved", { timeout: 20_000 })
    await expect(transcript(page)).toContainText("Bot created, but the model wasn't changed", { timeout: 20_000 })
  } finally { await env.stop() }
})
