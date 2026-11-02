// U-23 P-D 设置·bot 配置 E2E（派发验收 ①③；裁决 work/p4-ui/ui/PDC-final.md D1–D15）。
// ① 对话框连接器栏（候选只来自 #16，勾选走 #4）→ info-pane（第三列 320）只读配置 / 无改 preset·连接器入口（D11）
//   → 改模型失败回滚 + 成功「下一轮生效」、只对本 bot → 「用此配置新建」预填不提交 → 设主 Bot 置顶（#20）。
// ③ D10c1：连接器 bot 有历史 → 删掉临时 HOME 里该 bundle（PLAN U-23 ③ 触发方式）→ 同 home close→launch（runtime + 壳）→
//   四处失效显示、历史可读、composer 禁发；其他 bot 正常收发；横幅「用此配置新建」预填标出未装连接器。
import { expect, test, type Page } from 'playwright/test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { DEMO_BUNDLE, MARKET_PATCH, tempBundle } from '../support/connectors.ts'
import { PDC_EVIDENCE, PRESETS_PATCH, devState, send, textCall } from '../support/ui.ts'

const PATCH = (): string => `${MARKET_PATCH}:${PRESETS_PATCH}:${fakeOverlayPath()}`

/** 走产品对话框勾连接器建 bot（#4）；返回新 sessionId。 */
async function createWithConnector(page: Page, preset: string): Promise<string> {
  const before = (await devState(page)).order
  await page.click('[data-action="new-bot"]')
  const dlg = page.locator('dialog[data-dialog="new-bot"]')
  await dlg.locator(`[data-preset-option="${preset}"] input`).check({ timeout: 15_000 })
  await dlg.locator(`[data-connector-option="${DEMO_BUNDLE}"] input`).check({ timeout: 15_000 })
  await page.click('[data-action="create-bot"]')
  await expect(dlg).toBeHidden({ timeout: 60_000 })
  await expect.poll(async () => (await devState(page)).order.find((id) => !before.includes(id))).toBeTruthy()
  return (await devState(page)).order.find((id) => !before.includes(id))!
}

const pane = (page: Page) => page.locator('[data-info-pane]')

test('P-D ①：连接器栏走 #4 → info-pane 只读配置 → 改模型回滚/生效 → 用此配置新建预填 → 设主 Bot 置顶', async () => {
  test.setTimeout(180_000)
  const rt = await launchSdkRuntime({ patch: PATCH(), cwd: mkdtempSync(join(tmpdir(), 'bot-u23-ws-')) })
  await rt.client.call('pluginManager/installBundle', { spec: tempBundle(), options: { enabled: false } })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await page.waitForSelector('.shell', { timeout: 30_000 })
    const mainId = (await devState(page)).meta.mainBotId!

    // 对话框：连接器候选只来自 #16（已装的 fixture 一条）
    await page.click('[data-action="new-bot"]')
    const dlg = page.locator('dialog[data-dialog="new-bot"]')
    await expect(dlg.locator('[data-connector-option]')).toHaveCount(1, { timeout: 15_000 })
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pd-dialog-connectors.png') })
    await page.click('dialog[data-dialog="new-bot"] .btn.secondary')
    const x = await createWithConnector(page, 'p2-alpha')

    // #4 证据：header 冻结 p2temp-id、bots.json recipe、非只读
    await expect.poll(async () => page.getAttribute(`[data-session="${x}"]`, 'data-preset'), { timeout: 20_000 }).toMatch(/^p2temp-/)
    const recipes = Object.values((JSON.parse(readFileSync(join(shell.home, 'data', 'bots.json'), 'utf8')) as { recipes: Record<string, unknown> }).recipes)
    expect(recipes).toEqual([{ agentPreset: 'p2-alpha', connectors: [DEMO_BUNDLE] }])
    await expect(page.locator(`[data-session="${x}"]`)).not.toHaveClass(/readonly/)
    await expect(page.locator('[data-chat-meta]')).toContainText(`p2-alpha · ${DEMO_BUNDLE}`)

    // info-pane：第三列、默认 320
    await page.click('[data-action="toggle-info-pane"]')
    await expect(pane(page)).toBeVisible()
    expect(Math.round((await pane(page).boundingBox())!.width)).toBe(320)
    await expect(pane(page).locator('[data-pane-preset]')).toContainText('p2-alpha')
    await expect(pane(page).locator('[data-pane-connectors]')).toContainText(DEMO_BUNDLE)
    // D11：没有改 preset / 连接器的入口（pane 内唯一的表单控件是模型 select）
    expect(await pane(page).locator('input, textarea').count()).toBe(0)
    expect(await pane(page).locator('select').count()).toBe(1)
    // D11 / D9：P-D 无权限节、无权限切换入口
    const paneText = (await pane(page).innerText()).toLowerCase()
    for (const word of ['permission', '权限', 'danger-full-access', '始终允许']) expect(paneText).not.toContain(word)

    // 改模型：失败回滚（注入 #5 失败）→ 成功「下一轮生效」
    const model = pane(page).locator('[data-pane-model]')
    await expect(model).toBeEnabled({ timeout: 15_000 })
    const target = await model.locator('option:not([disabled])').first().getAttribute('value')
    expect(target).toBeTruthy()
    const original = await model.inputValue()
    await page.evaluate(() => (window as unknown as { __pbotsDev: { failNext(m: string): void } }).__pbotsDev.failNext('session/selectModel'))
    await model.selectOption(target!)
    await expect(pane(page).locator('[data-model-status="error"]')).toContainText('切换失败')
    await expect(model).toHaveValue(original) // 回滚
    await model.selectOption(target!)
    await expect(pane(page).locator('[data-model-status="saved"]')).toHaveText('已切换，下一轮生效')
    await expect(model).toHaveValue(target!)
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pd-info-pane.png') })
    // 只对本 bot：主 bot 的 pane 仍是原值
    await page.locator(`[data-session="${mainId}"]`).click()
    await expect(pane(page).locator('[data-pane-model]')).toHaveValue(original)
    await expect(pane(page).locator('[data-main-note]')).toBeVisible()
    await page.locator(`[data-session="${x}"]`).click()

    // 用此配置新建：预填 preset / 连接器 / 模型，不提交
    const before = (await devState(page)).order
    await page.click('[data-action="clone-config-head"]')
    await expect(dlg.locator('#new-bot-title')).toHaveText('用此配置新建')
    await expect(dlg.locator('[data-preset-option="p2-alpha"] input')).toBeChecked({ timeout: 15_000 })
    await expect(dlg.locator(`[data-connector-option="${DEMO_BUNDLE}"] input`)).toBeChecked()
    await expect(dlg.locator('[data-model-select]')).toHaveValue(target!)
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pd-clone-prefill.png') })
    expect((await devState(page)).order).toEqual(before)
    await page.click('dialog[data-dialog="new-bot"] .btn.secondary')
    await expect(dlg).toBeHidden()

    // 暗色 + 窄窗：主列 < 424 时 pane 改覆盖式浮层（PDC D1 兜底）
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pd-info-pane-dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })
    await shell.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(900, 720))
    await expect(pane(page)).toHaveClass(/overlay/)
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pd-info-pane-overlay.png') })
    await shell.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1280, 820))
    await expect(pane(page)).not.toHaveClass(/overlay/)

    // 设主 Bot（#20）：成功后置顶 + bots.json + pane 文案
    await pane(page).locator('[data-action="set-main"]').click()
    await expect(page.locator('.bot-item').first()).toHaveAttribute('data-session', x)
    await expect(page.locator('.bot-item').first()).toHaveAttribute('data-main', 'true')
    await expect(pane(page).locator('[data-main-note]')).toBeVisible()
    expect((JSON.parse(readFileSync(join(shell.home, 'data', 'bots.json'), 'utf8')) as { mainBotId: string }).mainBotId).toBe(x)
    await expect(page.locator(`[data-session="${mainId}"]`)).not.toHaveAttribute('data-main', 'true')
  } finally {
    await shell.stop()
    await rt.stop()
  }
})

test('D10c1：删 bundle → close→launch → 四处失效、历史可读、composer 禁发；其他 bot 正常', async () => {
  test.setTimeout(240_000)
  const cwd = mkdtempSync(join(tmpdir(), 'bot-u23-ws-'))
  const rt1 = await launchSdkRuntime({ patch: PATCH(), cwd })
  await rt1.client.call('pluginManager/installBundle', { spec: tempBundle(), options: { enabled: false } })
  const shell1 = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt1.handoff } })
  let x: string
  try {
    const page = shell1.page
    await page.waitForSelector('.shell', { timeout: 30_000 })
    x = await createWithConnector(page, 'p2-alpha')
    rt1.writeScriptCalls(x, [textCall(['历史-', 'c1-前的回复'], { paceMs: 20 })])
    await send(page, 'c1 之前的消息')
    await expect(page.locator('.bubble.assistant.final')).toHaveText('历史-c1-前的回复', { timeout: 30_000 })
  } finally {
    await shell1.stop()
    await rt1.stop()
  }
  // 删 bundle：profile 的 node_modules 链接（p2temp readConnectorRows 读这里；removeBundle 只改 manifest、链接留存）
  rmSync(join(rt1.home, 'profiles', 'web', 'node_modules', ...DEMO_BUNDLE.split('/')), { recursive: true, force: true })

  // 同 home 重启 runtime 与壳（main restore：该 recipe ensure 失败 → live=false）
  const rt2 = await launchSdkRuntime({ patch: PATCH(), cwd, home: rt1.home })
  const shell2 = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt2.handoff }, home: shell1.home })
  try {
    const page = shell2.page
    await page.waitForSelector('.shell', { timeout: 60_000 })
    const item = page.locator(`[data-session="${x!}"]`)
    await item.click()
    // ① 侧栏：副行 + ⊘ 角标
    await expect(item).toHaveClass(/readonly/)
    await expect(item.locator('.bot-sub')).toHaveText('连接器已失效')
    await expect(item.locator('[data-corner-off]')).toBeVisible()
    // ② 头部连接器转 danger
    await expect(page.locator('[data-meta-connectors]')).toHaveClass(/meta-dead/)
    // ③ composer 位 = 失效横幅（禁发），历史可读
    await expect(page.locator('[data-readonly-bar]')).toContainText('连接器已失效，请新建 bot')
    await expect(page.locator('[data-composer]')).toHaveCount(0)
    await expect(page.locator('.bubble.user')).toHaveText('c1 之前的消息')
    await expect(page.locator('.bubble.assistant.final')).toHaveText('历史-c1-前的回复')
    // ④ pane 红点 + 模型 disabled（U-26 ④：置灰可见 select:disabled、状态行换失效文案、不可设为主 Bot）
    if (await pane(page).count() === 0) await page.click('[data-action="toggle-info-pane"]')
    await expect(pane(page).locator('[data-connector-dead]')).toBeVisible()
    await expect(pane(page).locator('[data-pane-alert]')).toBeVisible()
    await expect(pane(page).locator('[data-pane-model]')).toBeDisabled()
    await expect(pane(page).locator('[data-pane-model]')).toHaveCSS('opacity', '0.45')
    await expect(pane(page).locator('[data-pane-model] ~ .pane-status')).toHaveText('连接器已失效，不能改模型')
    await expect(pane(page).locator('[data-action="set-main"]')).toBeDisabled()
    await expect(pane(page).locator('[data-action="set-main"]')).toHaveAttribute('title', '连接器已失效的 bot 不能设为主 Bot')
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pd-c1-readonly.png') })
    // 不自动重试：无 spinner
    expect(await page.locator('.icon.spin, .corner-ring').count()).toBe(0)

    // 横幅「用此配置新建」：预填 preset，未装连接器标出且不勾、提示将不带它创建
    await page.click('[data-action="clone-config-bar"]')
    const dlg = page.locator('dialog[data-dialog="new-bot"]')
    await expect(dlg.locator('[data-preset-option="p2-alpha"] input')).toBeChecked({ timeout: 15_000 })
    await expect(dlg.locator(`[data-connector-missing="${DEMO_BUNDLE}"]`)).toContainText('未安装')
    await expect(dlg.locator('[data-missing-note]')).toContainText(`将不带 ${DEMO_BUNDLE} 创建`)
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pd-c1-clone-missing.png') })
    await page.click('dialog[data-dialog="new-bot"] .btn.secondary')

    // 其他 bot 正常：主 bot 可发消息并收到回复
    const mainId = (await devState(page)).meta.mainBotId!
    await page.locator(`[data-session="${mainId}"]`).click()
    rt2.writeScriptCalls(mainId, [textCall(['主 bot ', '照常'], { paceMs: 20 })])
    await send(page, 'c1 之后主 bot')
    await expect(page.locator('.bubble.assistant.final').last()).toHaveText('主 bot 照常', { timeout: 30_000 })
  } finally {
    await shell2.stop()
    await rt2.stop()
  }
})
