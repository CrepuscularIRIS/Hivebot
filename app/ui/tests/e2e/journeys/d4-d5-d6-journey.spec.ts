// U-31 全旅程（PLAN U-31 ①；D3 复用 session.spec/markdown.spec 不重写）：一条 test 串
// D4 审批（挂起 → 作答 → 终态）→ D5 市场（real 源装 filesystem → 用它新建 → 实调工具）→
// D6 J3×J4（close→launch 重启：列表/主 bot/历史都在；D6b 连接器 bot 重启后仍能调工具）。
// preset：standard（D4，带 bash + shell-ask）；filesystem wrapper 名与 market.spec 锚点一致。
import { expect, test } from 'playwright/test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '../../support/tmp-sweep.ts'
import { launchShell } from '../../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../../support/sdk-runtime.ts'
import { MARKET_SOURCE_PATCH, serveMarket, type MarketServer } from '../../support/connectors.ts'
import { PRESETS_PATCH, bashCall, devState, send, textCall } from '../../support/ui.ts'

const FS_PLUGIN = '@agent-infra/mcp-server-filesystem'
const WRAPPER = '@p2sdk-market/agent-infra__mcp-server-filesystem'
const WRAPPER_SERVER_NAME = 'mcp-server-filesystem-3408f957'
const CONNECTOR_TOOL = `mcp__${WRAPPER_SERVER_NAME}__read_file`

function mcpCall(args: object): object {
  const id = `u31-d5-${Math.random().toString(16).slice(2, 8)}`
  const json = JSON.stringify(args)
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id, name: CONNECTOR_TOOL, argumentsDelta: json.slice(0, 5) },
      { type: 'tool-call-delta', index: 0, id, name: CONNECTOR_TOOL, argumentsDelta: json.slice(5) },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: CONNECTOR_TOOL, arguments: json } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ],
    paceMs: 10,
  }
}

const PATCH = `${MARKET_SOURCE_PATCH}:${PRESETS_PATCH}:${fakeOverlayPath()}`

test('D4→D5→D6 全旅程：审批批准执行 → 市场装 filesystem→新建→调工具 → 重启恢复（含连接器 bot 调工具）', async () => {
  test.setTimeout(420_000)
  const server = await serveMarket()
  const cwd = tmkdir('bot-u31-ws-')
  const rt1 = await launchSdkRuntime({ patch: PATCH, cwd, env: { P2SDK_MARKET_SOURCE_INDEXES: `${server.realUrl} ${server.localUrl}` } })
  const shell1 = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt1.handoff } })
  let a: string
  let x: string
  let canaryPath: string
  try {
    const page = shell1.page
    await page.waitForSelector('.shell', { timeout: 30_000 })

    // ---- D4：审批挂起 → 批准 → 终态（副作用文件出现）----
    a = await createBot(page, 'standard')
    await expect.poll(async () => (await devState(page)).views[a]?.cwd, { timeout: 20_000 }).toBeTruthy()
    canaryPath = join((await devState(page)).views[a]!.cwd!, 'u31-d4-canary')
    rt1.writeScriptCalls(a, [bashCall(`touch ${canaryPath}`, 'u31-d4-call'), textCall(['已执行。'])])
    await send(page, '建 canary')
    const row = page.locator('.tool-row[data-call-id="u31-d4-call"]')
    await row.locator('[data-approval-card]').waitFor({ timeout: 20_000 })
    await row.locator('[data-action="approve"]').click()
    await expect.poll(() => existsSync(canaryPath), { timeout: 30_000 }).toBe(true)
    await expect(row).toHaveAttribute('data-status', 'done')
    await expect(page.locator(`[data-pane="${a}"] .bubble.assistant.final`).last()).toHaveText('已执行。', { timeout: 30_000 })

    // ---- D5：市场装 filesystem（real 源）→ 用它新建 X → X 实调 read_file ----
    await page.click('[data-action="market"]')
    await page.selectOption('[data-market-source]', server.realUrl)
    await page.fill('[data-market-search]', 'filesystem')
    const fsRow = page.locator(`[data-entry="${FS_PLUGIN}"]`)
    await fsRow.locator('[data-action="install"]').click()
    await expect(fsRow).toHaveAttribute('data-kind', 'installed', { timeout: 180_000 })
    const m1Installs = await shell1.app.evaluate(
      () => (globalThis as unknown as { __pbotsM1?: { installs: Array<{ spec: unknown; enabled: unknown }> } }).__pbotsM1?.installs ?? [],
    )
    expect(m1Installs.filter((i) => String(i.spec).startsWith(FS_PLUGIN)), 'D5：main 收到的 enabled === false')
      .toEqual([{ spec: `${FS_PLUGIN}@1.2.29`, enabled: false }])
    await fsRow.locator('.m-main').click()
    await page.click(`[data-market-detail="${FS_PLUGIN}"] [data-action="new-with"]`)
    const dlg = page.locator('dialog[data-dialog="new-bot"]')
    await dlg.locator('[data-preset-option="standard"] input').check({ timeout: 15_000 })
    await expect(dlg.locator(`[data-connector-option="${WRAPPER}"] input`)).toBeChecked({ timeout: 15_000 })
    const beforeX = (await devState(page)).order
    await page.click('[data-action="create-bot"]')
    await expect(dlg).toBeHidden({ timeout: 60_000 })
    x = (await devState(page)).order.find((id) => !beforeX.includes(id))!
    await expect(page.locator(`[data-session="${x}"]`)).not.toHaveClass(/readonly/)
    // X 实调工具：写 hello 文件 → script 调 read_file → tool-row done + 结果文本
    const workspace = join(rt1.home, 'workspace')
    mkdirSync(workspace, { recursive: true })
    const hello = join(workspace, 'u31-hello.txt')
    writeFileSync(hello, 'u31-d5-journey-evidence')
    rt1.writeScriptCalls(x, [mcpCall({ path: hello }), textCall(['D5 读取完成'])])
    await page.click(`.bot-item[data-session="${x}"]`)
    await send(page, '读一下文件')
    // P5-21 连接器 ASK 化（Q-016 ③）：mcp__ 调用出审批卡，先批准 allowed-once（P5-21.f1，答卡模式同上方 D4 段）
    const rowX = page.locator(`[data-pane="${x}"] .tool-row`)
    await rowX.locator('[data-approval-card]').waitFor({ timeout: 20_000 })
    await rowX.locator('[data-action="approve"]').click()
    await expect(page.locator(`[data-pane="${x}"] .tool-row[data-status="done"]`), 'X 实调连接器工具').toBeVisible({ timeout: 60_000 })
    await page.locator(`[data-pane="${x}"] .tool-row .tool-line`).click()
    await expect(page.locator(`[data-pane="${x}"] .tool-detail`)).toContainText('u31-d5-journey-evidence')
  } finally {
    await shell1.stop()
    await rt1.stop()
  }

  // ---- D6 J3×J4：close → 同 home launch；列表/主 bot/历史在；D6b 连接器 bot 重启后仍能调工具 ----
  const rt2 = await launchSdkRuntime({ patch: PATCH, cwd, home: rt1.home, env: { P2SDK_MARKET_SOURCE_INDEXES: `${server.realUrl} ${server.localUrl}` } })
  const shell2 = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt2.handoff }, home: shell1.home })
  try {
    const page = shell2.page
    await page.waitForSelector('.shell', { timeout: 60_000 })
    const state = await devState(page)
    expect(state.order, '重启后 bot 列表完整（A、X、主 bot）').toEqual(expect.arrayContaining([a!, x!]))
    expect(state.meta.mainBotId, '主 bot 仍是主 bot').toBeTruthy()
    const first = page.locator('.bot-item').first()
    await expect(first).toHaveAttribute('data-session', state.meta.mainBotId!)
    // D6a：A 的历史在（D4 的审批工具行定稿可读）
    await page.click(`.bot-item[data-session="${a!}"]`)
    await expect(page.locator(`[data-pane="${a!}"] .tool-row[data-status="done"]`)).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(`[data-pane="${a!}"] .bubble.assistant.final`).last()).toHaveText('已执行。')
    // 普通 bot 重启后能发消息收回复（D6a 收尾）
    rt2.writeScriptCalls(a!, [textCall(['重启后正常回复'])])
    await send(page, '重启后你好')
    await expect(page.locator(`[data-pane="${a!}"] .bubble.assistant.final`).last()).toHaveText('重启后正常回复', { timeout: 30_000 })
    // D6b：连接器 bot X 重启后非只读、仍能调它的工具
    await page.click(`.bot-item[data-session="${x!}"]`)
    await expect(page.locator(`[data-session="${x!}"]`)).not.toHaveClass(/readonly/)
    const workspace2 = join(rt2.home, 'workspace')
    mkdirSync(workspace2, { recursive: true })
    const hello2 = join(workspace2, 'u31-hello2.txt')
    writeFileSync(hello2, 'u31-d6b-after-restart')
    rt2.writeScriptCalls(x!, [mcpCall({ path: hello2 }), textCall(['重启后读取完成'])])
    await send(page, '再读一次')
    // P5-21 连接器 ASK 化：重启后同样先批准 allowed-once（P5-21.f1）
    const rowX2 = page.locator(`[data-pane="${x!}"] .tool-row`)
    await rowX2.locator('[data-approval-card]').waitFor({ timeout: 20_000 })
    await rowX2.locator('[data-action="approve"]').click()
    await expect(page.locator(`[data-pane="${x!}"] .tool-row[data-status="done"]`), 'D6b：连接器 bot 重启后仍能调工具').toBeVisible({ timeout: 60_000 })
  } finally {
    await shell2.stop()
    await rt2.stop()
    await server.close()
  }
})

/** 对话框建无连接器 bot（preset 必填，不勾连接器）。 */
async function createBot(page: import('playwright/test').Page, preset: string): Promise<string> {
  const before = (await devState(page)).order
  await page.click('[data-action="new-bot"]')
  await page.locator(`[data-preset-option="${preset}"] input`).check({ timeout: 15_000 })
  await page.click('[data-action="create-bot"]')
  await expect(page.locator('dialog[data-dialog="new-bot"]')).toBeHidden({ timeout: 30_000 })
  const sid = (await devState(page)).order.find((id) => !before.includes(id))!
  expect(sid).toBeTruthy()
  return sid
}
