// P-D 设置·bot 配置 E2E（P5-57 起 UI 段回到产品界面，定稿 work/p5-parity/ui/P5-57-final.md ②；契约语义同 U-23/P5-54）：
// ① 侧栏 New → 新建对话框选 preset + 连接器 → #4 recipe 落盘 + header 冻结 p2temp-id；
//    View agent settings 的配置段：preset / 连接器只读带锁、无编辑控件（D11 / D9）；
//    Model select（#5 只对本 bot、下一轮生效）；Set as main bot（#20 落盘、重载后侧栏置顶）；
//    「New bot with this configuration」预填 preset + 连接器；对话框取消不建 bot。
// ③ D10c1：删 bundle → close→launch → 该 recipe live=false（M3）：侧栏预览行 / 配置面板横幅 / composer 禁发；
//    历史在新 renderer 里可读；其他 bot 正常收发。
import { expect, test, type Page } from 'playwright/test'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '../support/tmp-sweep.ts'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { DEMO_BUNDLE, MARKET_PATCH, tempBundle } from '../support/connectors.ts'
import {
  MAIN_TITLE, PRESETS_PATCH, api, botItem, composer, devState, evidenceOut, finalAssistant, openBot, send, textCall, transcript, waitProductReady,
} from '../support/ui.ts'

const PATCH = (): string => `${MARKET_PATCH}:${PRESETS_PATCH}:${fakeOverlayPath()}`
const EVIDENCE = evidenceOut('P5-57')
const dlg = (page: Page) => page.locator('dialog[data-dialog="new-bot"]')
const pane = (page: Page) => page.locator('.sand-info-pane[data-open]')

/** 侧栏 New → 对话框选 preset（+ 连接器）→ Create；返回新 bot 的 sessionId，并改唯一标题。 */
async function createViaDialog(page: Page, preset: string, connectors: string[], title: string): Promise<string> {
  const before = (await devState(page)).order
  await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
  await expect(dlg(page)).toBeVisible()
  await dlg(page).locator('summary').click() // T30：preset/连接器收进 More options
  await dlg(page).locator(`[data-preset-option="${preset}"] input`).check()
  for (const c of connectors) await dlg(page).locator(`[data-connector-option="${c}"] input`).check()
  await page.screenshot({ path: join(EVIDENCE, 'new-bot-dialog.png') })
  await dlg(page).getByRole('textbox', { name: 'Bot name' }).fill('SB') // T30：Create 需名字
  await dlg(page).locator('[data-action="create-bot"]').click()
  await expect(dlg(page)).toHaveCount(0, { timeout: 60_000 })
  await expect.poll(async () => (await devState(page)).order.find((id) => !before.includes(id)), { timeout: 30_000 }).toBeTruthy()
  const sid = (await devState(page)).order.find((id) => !before.includes(id))!
  expect((await api(page, 'session/rename', { request: { sessionId: sid, title } })).ok).toBe(true)
  await page.reload()
  await waitProductReady(page)
  return sid
}

/** M3 get：recipes 以 preset id 为键（p2temp-*），按连接器找本用例的那条。 */
const connectorRecipe = async (page: Page): Promise<{ live?: boolean; connectors: string[] } | undefined> => {
  const meta = (await page.evaluate(() => (window as unknown as { pbots: { botsMeta(op: 'get'): Promise<{ value: unknown }> } }).pbots.botsMeta('get'))).value as
    { recipes?: Record<string, { live?: boolean; connectors: string[] }> } | undefined
  return Object.values(meta?.recipes ?? {}).find((r) => r.connectors.includes(DEMO_BUNDLE))
}

test('P-D ①：New → 对话框选 preset + 连接器（#4）→ 配置只读（D11/D9）→ 改模型只对本 bot（#5）→ Set as main bot（#20）', async () => {
  test.setTimeout(240_000)
  const rt = await launchSdkRuntime({ patch: PATCH(), cwd: tmkdir('bot-u23-ws-') })
  await rt.client.call('pluginManager/installBundle', { spec: tempBundle(), options: { enabled: false } })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const mainId = (await devState(page)).meta.mainBotId!

    // 取消不建：New → Esc → order 不变
    const before = (await devState(page)).order
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    await expect(dlg(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dlg(page)).toHaveCount(0)
    await page.waitForTimeout(500)
    expect((await devState(page)).order).toEqual(before)

    const x = await createViaDialog(page, 'p2-alpha', [DEMO_BUNDLE], 'PD-X')
    await openBot(page, 'PD-X')
    // #4 证据：header 冻结 p2temp-id、bots.json recipe
    await expect.poll(async () => (await devState(page)).views[x]?.preset, { timeout: 20_000 }).toMatch(/^p2temp-/)
    const recipes = Object.values((JSON.parse(readFileSync(join(shell.home, 'data', 'bots.json'), 'utf8')) as { recipes: Record<string, unknown> }).recipes)
    expect(recipes).toEqual([{ agentPreset: 'p2-alpha', connectors: [DEMO_BUNDLE] }])

    // D11 / D9：配置段只读——preset / 连接器展示带锁、无 input / 复选框 / 权限入口；只有 Model 一个 select
    await page.click('button[aria-label="View agent settings"]')
    await expect(pane(page)).toBeVisible({ timeout: 15_000 })
    const config = pane(page).locator(`[data-pane-config="${x}"]`)
    await expect(config.locator('[data-pane-preset]')).toContainText('p2-alpha')
    await expect(config.locator('[data-pane-connectors]')).toContainText(DEMO_BUNDLE)
    await expect(config.locator('input')).toHaveCount(0)
    await expect(config.locator('select')).toHaveCount(1)
    for (const word of ['permission', 'danger-full-access', 'always allow']) expect((await pane(page).innerText()).toLowerCase(), word).not.toContain(word)
    await expect(config.locator('[data-pane-alert]')).toHaveCount(0)
    await page.screenshot({ path: join(EVIDENCE, 'config-pane-light.png') })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(600) // 主题过渡（对照台同口径）
    await page.screenshot({ path: join(EVIDENCE, 'config-pane-dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })

    // #5：Model select → 只对本 bot、下一轮生效
    const catalog = await api<{ groups?: Array<{ id: string; models: Array<{ id: string }> }> }>(page, 'session/modelCatalog', {})
    const group = catalog.value!.groups!.find((g) => g.models.length > 0)!
    const target = `${group.id}/${group.models[0]!.id}`
    const mainModel = (await devState(page)).views[mainId]?.model ?? null
    await config.locator('[data-pane-model]').selectOption(target)
    await expect(config.locator('[data-model-status]')).toHaveAttribute('data-model-status', /saved|idle/, { timeout: 15_000 })
    rt.writeScriptCalls(x, [textCall(['换模型后的回复'], { paceMs: 20 })])
    await send(page, '换了模型')
    await expect(finalAssistant(page).last()).toHaveText('换模型后的回复', { timeout: 30_000 })
    await page.reload()
    await waitProductReady(page)
    await openBot(page, 'PD-X')
    await expect.poll(async () => (await devState(page)).views[x]?.model, { timeout: 20_000 }).toBe(target)
    expect((await devState(page)).views[mainId]?.model ?? null).toBe(mainModel)

    // 「New bot with this configuration」：预填 preset + 连接器，不提交
    await page.click('button[aria-label="View agent settings"]')
    await pane(page).locator('[data-action="clone-config"]').click()
    await expect(dlg(page).locator('[data-preset-option="p2-alpha"] input')).toBeChecked({ timeout: 15_000 })
    await expect(dlg(page).locator(`[data-connector-option="${DEMO_BUNDLE}"] input`)).toBeChecked()
    await dlg(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(dlg(page)).toHaveCount(0)

    // #20 Set as main bot：落盘 + 侧栏置顶；主 bot 显示说明行
    await pane(page).locator('[data-action="set-main"]').click()
    await expect(pane(page).locator('[data-main-note]')).toBeVisible({ timeout: 15_000 })
    expect((JSON.parse(readFileSync(join(shell.home, 'data', 'bots.json'), 'utf8')) as { mainBotId: string }).mainBotId).toBe(x)
    await expect.poll(async () => (await devState(page)).order[0]).toBe(x)
    await page.reload()
    await waitProductReady(page)
    await expect.poll(async () => (await devState(page)).order[0]).toBe(x)
    await expect(page.locator('.sand-agent-item').first()).toHaveAttribute('aria-label', 'PD-X')
  } finally {
    await shell.stop()
    await rt.stop()
  }
})

test('D10c1：删 bundle → close→launch → live=false：侧栏预览 / 配置横幅 / composer 禁发；历史可读；其他 bot 正常', async () => {
  test.setTimeout(240_000)
  const cwd = tmkdir('bot-u23-ws-')
  const rt1 = await launchSdkRuntime({ patch: PATCH(), cwd })
  await rt1.client.call('pluginManager/installBundle', { spec: tempBundle(), options: { enabled: false } })
  const shell1 = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt1.handoff } })
  let x: string
  try {
    const page = shell1.page
    await waitProductReady(page)
    x = await createViaDialog(page, 'p2-alpha', [DEMO_BUNDLE], 'C1-X')
    await openBot(page, 'C1-X')
    rt1.writeScriptCalls(x, [textCall(['历史-', 'c1-前的回复'], { paceMs: 20 })])
    await send(page, 'c1 之前的消息')
    await expect(finalAssistant(page).last()).toHaveText('历史-c1-前的回复', { timeout: 30_000 })
    expect((await connectorRecipe(page))?.live).toBe(true)
  } finally {
    await shell1.stop()
    await rt1.stop()
  }
  // 删 bundle：profile 的 node_modules 链接（p2temp readConnectorRows 读这里；removeBundle 只改 manifest、链接留存）
  rmSync(join(rt1.home, 'profiles', 'web', 'node_modules', ...DEMO_BUNDLE.split('/')), { recursive: true, force: true })

  const rt2 = await launchSdkRuntime({ patch: PATCH(), cwd, home: rt1.home })
  const shell2 = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt2.handoff }, home: shell1.home })
  try {
    const page = shell2.page
    await waitProductReady(page)
    await expect.poll(async () => (await connectorRecipe(page))?.live, { timeout: 30_000 }).toBe(false)
    await page.reload() // shim roster 按新 meta 重拉
    await waitProductReady(page)
    // 侧栏角标：预览行
    await expect(botItem(page, 'C1-X')).toContainText('Connector unavailable', { timeout: 20_000 })
    // 历史可读
    await openBot(page, 'C1-X')
    await expect(transcript(page)).toContainText('c1 之前的消息', { timeout: 30_000 })
    await expect(finalAssistant(page).last()).toHaveText('历史-c1-前的回复')
    // composer 禁发 + notice
    await expect(page.locator('.sand-prompt-shell .sand-prompt-attachment-notice')).toContainText('no longer installed')
    await expect(composer(page)).toHaveCount(0) // 禁用态编辑器 contenteditable=false
    // 配置面板横幅 + 失效标 + 不可设主 / 不可改模型
    await page.click('button[aria-label="View agent settings"]')
    await expect(pane(page).locator('[data-pane-alert]')).toBeVisible({ timeout: 15_000 })
    await expect(pane(page).locator('[data-connector-dead]')).toHaveText('Unavailable')
    await expect(pane(page).locator('[data-action="set-main"]')).toBeDisabled()
    await expect(pane(page).locator('[data-pane-model]')).toBeDisabled()
    await page.screenshot({ path: join(EVIDENCE, 'd10c-readonly.png') })
    await page.keyboard.press('Escape')

    // 其他 bot 正常：主 bot 可发消息并收到回复
    const mainId = (await devState(page)).meta.mainBotId!
    await openBot(page, MAIN_TITLE)
    rt2.writeScriptCalls(mainId, [textCall(['主 bot ', '照常'], { paceMs: 20 })])
    await send(page, 'c1 之后主 bot')
    await expect(finalAssistant(page).last()).toHaveText('主 bot 照常', { timeout: 30_000 })
  } finally {
    await shell2.stop()
    await rt2.stop()
  }
})
