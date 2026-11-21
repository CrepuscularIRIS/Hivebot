// B4.1 e2e：斜杠命令菜单——'/' 触发弹层 → 过滤 → Enter 执行（new-bot 打开创建对话框）。
// 1.1.0 规格：命令对象 {id,label,icon,keywords}；面板复用 suggestion renderer（mention 同款视觉）。
// 注意：空 app 空态无 composer（prompt-shell 未挂）——①③照 t90b 起场（launchShell+建 bot 后回输入）。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { launchProduct, waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const editor = (page: import('playwright/test').Page) => page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
const listbox = (page: import('playwright/test').Page) => page.locator('.sand-slash-listbox')
const option = (page: import('playwright/test').Page) => page.locator('.sand-slash-option')

test('① '/' 触发命令菜单：弹层可见 + 4 命令 + Esc 关闭', async () => {
  test.setTimeout(120_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b4-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    const dlg = page.locator('dialog[data-dialog="new-bot"]')
    await expect(dlg).toBeVisible()
    await dlg.getByRole('textbox', { name: 'Bot name' }).fill('B4-T1')
    await dlg.locator('[data-action="create-bot"]').click()
    await expect(dlg).toHaveCount(0, { timeout: 60_000 })
    await page.waitForTimeout(1_200)
    await editor(page).click()
    await page.keyboard.type('/')
    await expect(listbox(page)).toBeVisible({ timeout: 5_000 })
    await expect(option(page)).toHaveCount(4)
    await page.keyboard.press('Escape')
    await expect(listbox(page), 'Esc 后面板藏').toBeHidden({ timeout: 5_000 })
  } finally { await shell.stop(); await rt.stop() }
})

test('② 过滤 + Enter 执行：new-bot 命令打开创建对话框', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await page.click('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await page.keyboard.type('/new')
    await expect(listbox(page)).toBeVisible({ timeout: 5_000 })
    await expect(option(page)).toHaveCount(1) // new-bot 唯一命中
    await page.keyboard.press('Enter')
    // 命令执行：new-bot 创建对话框打开（create-dialog e2e 同锚）
    await expect(page.locator('dialog[data-dialog="new-bot"]')).toBeVisible({ timeout: 5_000 })
    // 触发词 '/' 已删（编辑器不含 '/new'）
    const editorText = await page.evaluate(() => document.querySelector('.sand-prompt-shell .ProseMirror')?.textContent ?? '')
    expect(editorText).not.toContain('/new')
  } finally { await env.stop() }
})

test('③ 与 @/emoji 面板互斥：连续触发只一个面板', async () => {
  test.setTimeout(120_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b4-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    const dlg = page.locator('dialog[data-dialog="new-bot"]')
    await expect(dlg).toBeVisible()
    await dlg.getByRole('textbox', { name: 'Bot name' }).fill('B4-T3')
    await dlg.locator('[data-action="create-bot"]').click()
    await expect(dlg).toHaveCount(0, { timeout: 60_000 })
    await page.waitForTimeout(1_200)
    await editor(page).click()
    await page.keyboard.type(':smi', { delay: 12 })
    await expect(page.locator('.sand-emoji-listbox')).toBeVisible({ timeout: 12_000 })
    // 互斥验证：emoji 打开状态下直接连打 '/'——emoji 面板关、slash 面板弹（同一时刻只一个）
    await page.keyboard.press('Escape')
    await editor(page).click() // Esc 后重 focus（Escape 使 contenteditable 失焦——不 refocus 则全选打空）
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('/', { delay: 40 })
    await expect(listbox(page), '清场后 / 触发 slash 面板').toBeVisible({ timeout: 8_000 })
    await expect(page.locator('.sand-emoji-listbox'), 'emoji 面板已关').toBeHidden({ timeout: 3_000 })
  } finally { await shell.stop(); await rt.stop() }
})
