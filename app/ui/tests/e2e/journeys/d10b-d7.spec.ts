// U-31 全旅程（GU-PDC 2026-11-02 17:35 修订）：两个此前只有单测的 D 条款补 E2E——
// D10b 创建中重载：PBOTS_TEST_GATE_4 屏障停在「recipe 已落盘、session 已建、#4 未交付」时重载 renderer
//   → 同一 session 恢复、连接器配置完整、放行后可用（C:96 / U-23 ⑥）。
// D7 直接调用侧：page.evaluate 直调 M1 #4 传未装连接器（UI 候选选不到，绕过 UI）→ !ok、列表无此 bot；
//   重启 → 孤儿 recipe 不产生行、其他 bot 可用（§8-1 失败配方隔离）；
//   failNext 变体：真实 UI 创建（0.18 侧栏 New → #3）注入失败 → 无新 bot、入口复位。
// P5-54 起跑在 renderer-grok 上：0.18 没有连接器栏，#4 一律 M1 直调（REPORT-P5-54 映射表 D10b/D7 行）。
import { expect, test, type Page } from 'playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '../../support/tmp-sweep.ts'
import { launchShell } from '../../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../../support/sdk-runtime.ts'
import { DEMO_BUNDLE, MARKET_PATCH, tempBundle } from '../../support/connectors.ts'
import { PRESETS_PATCH, devState, finalAssistant, MAIN_TITLE, openBot, send, textCall, waitProductReady } from '../../support/ui.ts'

const PATCH = `${MARKET_PATCH}:${PRESETS_PATCH}:${fakeOverlayPath()}`
const NOT_INSTALLED = '@p2sdk-fixture/not-installed-connector'

interface Recipes { recipes: Record<string, { agentPreset: string; connectors: string[]; live?: boolean }> }
const recipesOf = (home: string): Recipes => JSON.parse(readFileSync(join(home, 'data', 'bots.json'), 'utf8')) as Recipes

/** 发起 #4 连接器建 bot，不等待完成（D10b 屏障下 #4 不返回）。 */
async function startConnectorCreate(page: Page): Promise<void> {
  await page.evaluate((name) => {
    void (window as unknown as { pbots: { api(m: string, a?: unknown): Promise<unknown> } }).pbots
      .api('p2temp/session.createWithConnectors', { request: { connectors: [name], agentPreset: 'p2-alpha' } })
  }, DEMO_BUNDLE)
}

test('D10b：#4 屏障（PBOTS_TEST_GATE_4）中重载 renderer → 同一 session 恢复、连接器完整、放行后可用', async () => {
  test.setTimeout(240_000)
  const rt = await launchSdkRuntime({ patch: PATCH, cwd: tmkdir('bot-u31-ws-') })
  await rt.client.call('pluginManager/installBundle', { spec: tempBundle(), options: { enabled: false } })
  const gate = join(rt.home, 'gate4-u31')
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff, PBOTS_TEST_GATE_4: gate } })
  try {
    const page = shell.page
    await waitProductReady(page)
    // 勾连接器建 bot：createBotWithConnectors 停在 gate（recipe 已落盘、dsh #4 已返回、未交付 renderer）
    const before = (await devState(page)).order
    await startConnectorCreate(page)

    // 屏障态：recipe 已落盘 + dsh 侧 session 已建（#9），renderer 未收到
    await expect.poll(() => Object.keys(recipesOf(shell.home).recipes).filter((k) => recipesOf(shell.home).recipes[k]!.connectors.includes(DEMO_BUNDLE)).length, { timeout: 30_000 }).toBe(1)
    const presetId = Object.keys(recipesOf(shell.home).recipes).find((k) => recipesOf(shell.home).recipes[k]!.connectors.includes(DEMO_BUNDLE))!
    const sessionsOf = async (): Promise<string[]> =>
      ((await rt.client.call('session/list', { _request: {} })) as { items?: Array<{ sessionId: string }> }).items?.map((s) => s.sessionId)
    await expect.poll(async () => (await sessionsOf()).find((id) => !before.includes(id)), { timeout: 30_000 }).toBeTruthy()
    const sessionId = (await sessionsOf()).find((id) => !before.includes(id))!

    // 重载 renderer：同一 session 恢复、连接器完整（header 冻结同一 p2temp-id、recipe live）
    await rt.client.call('session/rename', { request: { sessionId, title: 'D10b-X' } }) // 侧栏行按标题定位（SDK 侧改名，不经 renderer）
    await page.reload()
    await waitProductReady(page)
    await openBot(page, 'D10b-X')
    await expect.poll(async () => (await devState(page)).views[sessionId]?.preset, { timeout: 30_000 }).toBe(presetId)
    expect(recipesOf(shell.home).recipes[presetId]).toMatchObject({ agentPreset: 'p2-alpha', connectors: [DEMO_BUNDLE] })

    // 放行 gate → 创建流程在 main 侧完成；连接器 bot 完整可用（发消息收回复）
    writeFileSync(gate, '')
    rt.writeScriptCalls(sessionId, [textCall(['D10b 恢复可用'])])
    await send(page, '重载后你好')
    await expect(finalAssistant(page).last()).toHaveText('D10b 恢复可用', { timeout: 60_000 })
  } finally {
    await shell.stop()
    await rt.stop()
  }
})

test('D7：直调 #4 未装连接器 → !ok 且列表无此 bot；重启孤儿不出行、其他 bot 可用；failNext 真实 UI 报错', async () => {
  test.setTimeout(240_000)
  const cwd = tmkdir('bot-u31-ws-')
  const rt1 = await launchSdkRuntime({ patch: PATCH, cwd })
  const shell1 = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt1.handoff } })
  let orderBefore: string[] = []
  try {
    const page = shell1.page
    await waitProductReady(page)
    orderBefore = (await devState(page)).order

    // 直接调 M1 #4 传未装连接器（UI 候选只来自 #16，界面上选不到——绕过 UI 直调）
    const res = await page.evaluate(
      (name) => (window as unknown as { pbots: { api(m: string, a?: unknown): Promise<{ ok: boolean; error?: { code: string; message: string } }> } }).pbots.api('p2temp/session.createWithConnectors', { request: { connectors: [name] } }),
      NOT_INSTALLED,
    )
    expect(res.ok, `直调 #4 未装连接器必须失败（got ${JSON.stringify(res).slice(0, 200)}）`).toBe(false)
    expect((await devState(page)).order, '列表不出现这个 bot').toEqual(orderBefore)
    // 孤儿 recipe 落盘但不删（§8-1：不删共享 recipe）
    await expect.poll(() => Object.values(recipesOf(shell1.home).recipes).filter((r) => r.connectors.includes(NOT_INSTALLED)).length).toBe(1)

    // failNext 变体：真实 UI 创建（侧栏 New → shim createAgent → #3）注入一次性失败 → 无新 bot、入口复位
    await page.evaluate(() => (window as unknown as { __pbotsDev: { failNext(m: string): void } }).__pbotsDev.failNext('session/create'))
    const newBtn = page.locator('.sand-agents-sidebar__header button[aria-label="New"]')
    await newBtn.click()
    await page.waitForTimeout(1000)
    await expect(newBtn).toBeEnabled()
    expect((await devState(page)).order, 'failNext 创建失败也无新 bot').toEqual(orderBefore)
    await expect(page.locator('.sand-agent-item')).toHaveCount(orderBefore.length)
  } finally {
    await shell1.stop()
    await rt1.stop()
  }

  // 重启（同 home）：孤儿 recipe 不产生 bot 行，其他 bot 可用
  const rt2 = await launchSdkRuntime({ patch: PATCH, cwd, home: rt1.home })
  const shell2 = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt2.handoff }, home: shell1.home })
  try {
    const page = shell2.page
    await waitProductReady(page)
    const state = await devState(page)
    expect(state.order, '孤儿 recipe 不出现在列表').toEqual(orderBefore)
    const orphan = Object.keys(recipesOf(shell2.home).recipes).find((k) => recipesOf(shell2.home).recipes[k]!.connectors.includes(NOT_INSTALLED))
    expect(orphan, '孤儿 recipe 仍在盘（未删共享 recipe）').toBeTruthy()
    // 其他 bot（主 bot）重启后可用
    const main = state.meta.mainBotId!
    rt2.writeScriptCalls(main, [textCall(['D7 其他 bot 正常'])])
    await openBot(page, MAIN_TITLE)
    await send(page, '你好')
    await expect(finalAssistant(page).last()).toHaveText('D7 其他 bot 正常', { timeout: 30_000 })
  } finally {
    await shell2.stop()
    await rt2.stop()
  }
})
