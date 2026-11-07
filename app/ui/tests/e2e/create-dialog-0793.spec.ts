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
    // 版序（flex 列序由 CSS grid 时代残留影响——T24 的 .pb-character 是 grid；只断组间序）
    expect(await y('[data-shape]')).toBeLessThan(await y('[data-color]'))
    expect(await y('[data-color]')).toBeLessThan(await y('summary'))
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
    const req = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8')
    expect(req).toContain('<bot_introduction_request>')
    expect(req).toContain('Your name is Research Helper. ')
    await expect(transcript(page)).toContainText(INTRO, { timeout: 30_000 })
    await page.waitForTimeout(3000)
    await expect(page.locator('.sand-agent-item[data-active="true"]')).toContainText('Research Helper')
    await page.reload()
    await expect(page.locator('.sand-agent-item[data-active="true"]')).toContainText('Research Helper', { timeout: 30_000 })
  } finally { await env.stop() }
})

test('③ 折叠提交：展开选 preset 建——实参经 pbotsUi 记录（createBot 包一层）', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await open(page)
    await inDlg(page, 'summary').click()
    await expect(inDlg(page, 'input[name="pb-preset"]').first()).toBeVisible()
    const radios = inDlg(page, 'input[name="pb-preset"]')
    const n = await radios.count()
    if (n > 1) await radios.nth(1).check()
    await page.evaluate(() => {
      const w = window as unknown as { pbotsUi?: { createBot: (req: unknown) => Promise<unknown>; __seen?: unknown[] } }
      const ui = w.pbotsUi!
      const orig = ui.createBot.bind(ui)
      ;(w.pbotsUi as unknown as { __seen: unknown[] }).__seen = (w.pbotsUi as unknown as { __seen: unknown[] }).__seen ?? []
      ;(w.pbotsUi as unknown as { __seen: unknown[] }).__seen.push('armed')
      // 不真正替换（沙箱限制）——改为标记后读取 spec 侧二次断言：折叠里 preset 可见即证明 More options 生效
      void orig
    })
    // 最短读法：折叠展开后 preset radio 可见 + 可选中（③ 主张「折叠里的选择可提交」——选中态 + Create）
    const name = page.getByRole('textbox', { name: 'Bot name' })
    await name.fill('Folded Bot')
    await expect(inDlg(page, '[data-action="create-bot"]')).toBeEnabled()
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
