// U-31 全旅程（PLAN U-31 ①；D3 复用 session.spec/markdown.spec 不重写；P5-54 起跑在 renderer-grok 上）：一条 test 串
// D4 审批（挂起 → 作答 → 终态）→ D5（filesystem 经 #15 装 → #4 用 wrapper 建 X → X 在新 renderer 实调工具）→
// D6 J3×J4（close→launch 重启：列表 / 主 bot / 历史都在；D6b 连接器 bot 重启后仍能调工具）。
// 0.18 没有市场页与新建对话框：D5 的安装与建 bot 走 M1 直调（REPORT-P5-54 映射表），会话与审批走新 renderer。
import { expect, test } from 'playwright/test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '../../support/tmp-sweep.ts'
import { launchShell } from '../../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../../support/sdk-runtime.ts'
import { MARKET_SOURCE_PATCH, serveMarket } from '../../support/connectors.ts'
import { FS_PLUGIN, WRAPPER, approveConnectorCall, mcpCall } from '../../support/connector-call.ts'
import {
  PRESETS_PATCH, api, bashCall, createBots, devState, finalAssistant, openBot, permissionDock, send, textCall, toolRows, waitProductReady,
} from '../../support/ui.ts'

const PATCH = `${MARKET_SOURCE_PATCH}:${PRESETS_PATCH}:${fakeOverlayPath()}`

test('D4→D5→D6 全旅程：审批批准执行 → 装 filesystem→建 X→调工具 → 重启恢复（含连接器 bot 调工具）', async () => {
  test.setTimeout(420_000)
  const server = await serveMarket()
  const cwd = tmkdir('bot-u31-ws-')
  const rt1 = await launchSdkRuntime({ patch: PATCH, cwd, env: { P2SDK_MARKET_SOURCE_INDEXES: `${server.realUrl} ${server.localUrl}` } })
  const shell1 = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt1.handoff } })
  let a: string
  let x: string
  try {
    const page = shell1.page
    await waitProductReady(page)

    // ---- D4：审批挂起 → 批准 → 终态（副作用文件出现）----
    ;[a] = await createBots(page, [{ title: 'J-A', preset: 'standard' }]) as [string]
    await openBot(page, 'J-A')
    await expect.poll(async () => (await devState(page)).views[a]?.cwd, { timeout: 20_000 }).toBeTruthy()
    const canaryPath = join((await devState(page)).views[a]!.cwd!, 'u31-d4-canary')
    rt1.writeScriptCalls(a, [bashCall(`touch ${canaryPath}`, 'u31-d4-call'), textCall(['已执行。'])])
    await send(page, '建 canary')
    await permissionDock(page).locator('button', { hasText: 'Allow once' }).click({ timeout: 20_000 })
    await expect.poll(() => existsSync(canaryPath), { timeout: 30_000 }).toBe(true)
    await expect(toolRows(page).last()).toHaveAttribute('data-status', 'done', { timeout: 20_000 })
    await expect(finalAssistant(page).last()).toHaveText('已执行。', { timeout: 30_000 })

    // ---- D5：#15 装 filesystem（enabled:false）→ #4 用 wrapper 建 X → X 实调 read_file ----
    const install = await api<{ application?: string }>(page, 'pluginManager/installBundle', { spec: `${FS_PLUGIN}@1.2.29`, options: { enabled: false } })
    expect(install.ok && install.value?.application !== 'failed', JSON.stringify(install).slice(0, 300)).toBe(true)
    const m1Installs = await shell1.app.evaluate(
      () => (globalThis as unknown as { __pbotsM1?: { installs: Array<{ spec: unknown; enabled: unknown }> } }).__pbotsM1?.installs ?? [],
    )
    expect(m1Installs.filter((i) => String(i.spec).startsWith(FS_PLUGIN)), 'D5：main 收到的 enabled === false')
      .toEqual([{ spec: `${FS_PLUGIN}@1.2.29`, enabled: false }])
    const created = await api<{ sessionId: string }>(page, 'p2temp/session.createWithConnectors', { request: { connectors: [WRAPPER], agentPreset: 'standard' } })
    expect(created.ok, JSON.stringify(created.error)).toBe(true)
    x = created.value!.sessionId
    expect((await api(page, 'session/rename', { request: { sessionId: x, title: 'J-X' } })).ok).toBe(true)
    await page.reload()
    await waitProductReady(page)
    await openBot(page, 'J-X')
    const workspace = join(rt1.home, 'workspace')
    mkdirSync(workspace, { recursive: true })
    const hello = join(workspace, 'u31-hello.txt')
    writeFileSync(hello, 'u31-d5-journey-evidence')
    rt1.writeScriptCalls(x, [mcpCall({ path: hello }), textCall(['D5 读取完成'])])
    await send(page, '读一下文件')
    await approveConnectorCall(page, x, 'u31-d5-journey-evidence')
  } finally {
    await shell1.stop()
    await rt1.stop()
  }

  // ---- D6 J3×J4：close → 同 home launch；列表/主 bot/历史在；D6b 连接器 bot 重启后仍能调工具 ----
  const rt2 = await launchSdkRuntime({ patch: PATCH, cwd, home: rt1.home, env: { P2SDK_MARKET_SOURCE_INDEXES: `${server.realUrl} ${server.localUrl}` } })
  const shell2 = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt2.handoff }, home: shell1.home })
  try {
    const page = shell2.page
    await waitProductReady(page)
    const state = await devState(page)
    expect(state.order, '重启后 bot 列表完整（A、X、主 bot）').toEqual(expect.arrayContaining([a!, x!]))
    expect(state.meta.mainBotId, '主 bot 仍是主 bot').toBeTruthy()
    expect(state.order[0]).toBe(state.meta.mainBotId)
    const recipes = JSON.parse(readFileSync(join(shell2.home, 'data', 'bots.json'), 'utf8')) as { recipes: Record<string, { connectors: string[] }> }
    expect(Object.values(recipes.recipes).map((r) => r.connectors)).toContainEqual([WRAPPER])
    expect(state.order, `重启后不多出 bot（got ${JSON.stringify(state.order)}）`).toHaveLength(3)
    // D6a：A 的历史在（D4 的审批工具行定稿可读）
    await openBot(page, 'J-A')
    await expect(toolRows(page).last()).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
    await expect(finalAssistant(page).last()).toHaveText('已执行。', { timeout: 30_000 })
    // 普通 bot 重启后能发消息收回复（D6a 收尾）
    rt2.writeScriptCalls(a!, [textCall(['重启后正常回复'])])
    await send(page, '重启后你好')
    await expect(finalAssistant(page).last()).toHaveText('重启后正常回复', { timeout: 30_000 })
    // D6b：连接器 bot X 重启后仍能调它的工具。
    // 实测（P5-54）：live 连接器 bot 的 session 标题（#rename）跨重启丢失（普通 bot A 保留）——非本任务域，报告「发现」行交派；
    // 这里经 SDK 侧补名只为在侧栏定位它，不影响 D6b 断言的「重启后仍能调工具」。
    await rt2.client.call('session/rename', { request: { sessionId: x!, title: 'J-X' } })
    await page.reload()
    await waitProductReady(page)
    await openBot(page, 'J-X')
    const workspace2 = join(rt2.home, 'workspace')
    mkdirSync(workspace2, { recursive: true })
    const hello2 = join(workspace2, 'u31-hello2.txt')
    writeFileSync(hello2, 'u31-d6b-after-restart')
    rt2.writeScriptCalls(x!, [mcpCall({ path: hello2 }), textCall(['重启后读取完成'])])
    await send(page, '再读一次')
    await approveConnectorCall(page, x!, 'u31-d6b-after-restart')
  } finally {
    await shell2.stop()
    await rt2.stop()
    await server.close()
  }
})
