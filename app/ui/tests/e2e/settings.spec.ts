// U-23 P-D 设置·bot 配置 E2E（P5-54 起跑在 renderer-grok 上，按语义重写）：
// 0.18 没有旧 P-D 的构件（新建对话框的 preset / 连接器栏、info-pane 只读配置 + 模型 select、「用此配置新建」、设主 Bot 按钮、
// 失效横幅），这些 UI 承载记 REPORT-P5-54 差异表（交新任务）。这里锁的是它们背后的契约语义，在新 renderer 的同一条 preload 通道上验：
// ① #4 连接器 bot：recipe 落盘 + header 冻结 p2temp-id + 新 renderer 的会话设置里没有改 preset / 连接器 / 权限的入口（D11 / D9 DOM）；
//    #5 改模型只对本 bot 生效；#20 设主 bot 落盘、重载后侧栏置顶；
// ③ D10c1：删 bundle → close→launch → 该 recipe live=false（M3），历史在新 renderer 里可读；其他 bot 正常收发。
import { expect, test, type Page } from 'playwright/test'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '../support/tmp-sweep.ts'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { DEMO_BUNDLE, MARKET_PATCH, tempBundle } from '../support/connectors.ts'
import {
  MAIN_TITLE, PRESETS_PATCH, api, devState, evidenceOut, finalAssistant, openBot, send, textCall, transcript, waitProductReady,
} from '../support/ui.ts'

const PATCH = (): string => `${MARKET_PATCH}:${PRESETS_PATCH}:${fakeOverlayPath()}`
const PDC_EVIDENCE = evidenceOut('PDC')

/** #4 建连接器 bot（0.18 无连接器栏：M1 直调），起唯一标题，reload 让 shim 重拉 roster。 */
async function createWithConnector(page: Page, preset: string, title: string): Promise<string> {
  const created = await api<{ sessionId: string }>(page, 'p2temp/session.createWithConnectors', { request: { connectors: [DEMO_BUNDLE], agentPreset: preset } })
  expect(created.ok, JSON.stringify(created.error)).toBe(true)
  const sid = created.value!.sessionId
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

test('P-D ①：#4 连接器 bot → 会话设置无改配置入口（D11/D9）→ #5 改模型只对本 bot → #20 设主 Bot 置顶', async () => {
  test.setTimeout(180_000)
  const rt = await launchSdkRuntime({ patch: PATCH(), cwd: tmkdir('bot-u23-ws-') })
  await rt.client.call('pluginManager/installBundle', { spec: tempBundle(), options: { enabled: false } })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const mainId = (await devState(page)).meta.mainBotId!
    const x = await createWithConnector(page, 'p2-alpha', 'PD-X')
    await openBot(page, 'PD-X')

    // #4 证据：header 冻结 p2temp-id、bots.json recipe
    await expect.poll(async () => (await devState(page)).views[x]?.preset, { timeout: 20_000 }).toMatch(/^p2temp-/)
    const recipes = Object.values((JSON.parse(readFileSync(join(shell.home, 'data', 'bots.json'), 'utf8')) as { recipes: Record<string, unknown> }).recipes)
    expect(recipes).toEqual([{ agentPreset: 'p2-alpha', connectors: [DEMO_BUNDLE] }])

    // D11 / D9：会话设置（View agent settings）里没有改 preset / 连接器 / 权限的入口
    await page.click('button[aria-label="View agent settings"]')
    const settings = page.locator('.sand-info-pane[data-open]')
    await expect(settings).toBeVisible({ timeout: 15_000 })
    const settingsText = (await settings.innerText()).toLowerCase()
    for (const word of ['preset', 'connector', 'permission', '权限', 'danger-full-access', '始终允许']) expect(settingsText, word).not.toContain(word)
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pd-agent-settings.png') })
    await page.keyboard.press('Escape')

    // #5：改模型只对本 bot 生效（follow 快照 modelSelection 投影）
    const catalog = await api<{ groups?: Array<{ id: string; models: Array<{ id: string }> }> }>(page, 'session/modelCatalog', {})
    expect(catalog.ok).toBe(true)
    const group = catalog.value!.groups!.find((g) => g.models.length > 0)!
    const target = { provider: group.id, model: group.models[0]!.id }
    const mainModel = (await devState(page)).views[mainId]?.model ?? null
    expect((await api(page, 'session/selectModel', { request: { sessionId: x, ...target } })).ok).toBe(true)
    // 「下一轮生效」：X 跑一轮后 follow 快照的 modelSelection 投影 = 所选；主 bot 不受影响
    rt.writeScriptCalls(x, [textCall(['换模型后的回复'], { paceMs: 20 })])
    await send(page, '换了模型')
    await expect(finalAssistant(page).last()).toHaveText('换模型后的回复', { timeout: 30_000 })
    await page.reload()
    await waitProductReady(page)
    await openBot(page, 'PD-X')
    await expect.poll(async () => (await devState(page)).views[x]?.model, { timeout: 20_000 }).toBe(`${target.provider}/${target.model}`)
    expect((await devState(page)).views[mainId]?.model ?? null).toBe(mainModel)

    // #20 设主 Bot：落盘 + 重载后侧栏置顶（shim 主 bot 恒排第一）
    const patched = await page.evaluate((id) => (window as unknown as { pbots: { botsMeta(op: { op: 'patch'; mainBotId: string }): Promise<{ ok: boolean }> } }).pbots.botsMeta({ op: 'patch', mainBotId: id }), x)
    expect(patched.ok).toBe(true)
    expect((JSON.parse(readFileSync(join(shell.home, 'data', 'bots.json'), 'utf8')) as { mainBotId: string }).mainBotId).toBe(x)
    await page.reload()
    await waitProductReady(page)
    await expect.poll(async () => (await devState(page)).order[0]).toBe(x)
  } finally {
    await shell.stop()
    await rt.stop()
  }
})

test('D10c1：删 bundle → close→launch → recipe live=false、历史在新 renderer 可读；其他 bot 正常', async () => {
  test.setTimeout(240_000)
  const cwd = tmkdir('bot-u23-ws-')
  const rt1 = await launchSdkRuntime({ patch: PATCH(), cwd })
  await rt1.client.call('pluginManager/installBundle', { spec: tempBundle(), options: { enabled: false } })
  const shell1 = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt1.handoff } })
  let x: string
  try {
    const page = shell1.page
    await waitProductReady(page)
    x = await createWithConnector(page, 'p2-alpha', 'C1-X')
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

  // 同 home 重启 runtime 与壳（main restore：该 recipe ensure 失败 → live=false）
  const rt2 = await launchSdkRuntime({ patch: PATCH(), cwd, home: rt1.home })
  const shell2 = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt2.handoff }, home: shell1.home })
  try {
    const page = shell2.page
    await waitProductReady(page)
    await expect.poll(async () => (await connectorRecipe(page))?.live, { timeout: 30_000 }).toBe(false)
    // 历史可读（不自动重试、无 boundary）
    await openBot(page, 'C1-X')
    await expect(transcript(page)).toContainText('c1 之前的消息', { timeout: 30_000 })
    await expect(finalAssistant(page).last()).toHaveText('历史-c1-前的回复')
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pd-c1-readonly.png') })

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
