// D5 / D6b 连接器工具调用共用（market.spec 与 d4-d5-d6 journey）：filesystem wrapper 锚点 + fake 的 mcp tool-call 脚本 +
// 在 renderer-grok 里答审批 dock 并等工具行定稿（P5-21 起连接器调用逐次 ASK）。
import { expect, type Page } from 'playwright/test'
import { devState, openOutline, permissionDock, toolRows } from './ui.ts'

export const FS_PLUGIN = '@agent-infra/mcp-server-filesystem'
/** U-25 wrapper 身份（字面量与 app/sdk/tests/e2e/market.test.ts:69-72 互为锚点）。 */
export const WRAPPER = '@p2sdk-market/agent-infra__mcp-server-filesystem'
export const WRAPPER_SERVER_NAME = 'mcp-server-filesystem-3408f957'
export const CONNECTOR_TOOL = `mcp__${WRAPPER_SERVER_NAME}__read_file`

export function mcpCall(args: object, name = CONNECTOR_TOOL): object {
  const id = `p554-mcp-${Math.random().toString(16).slice(2, 8)}`
  const json = JSON.stringify(args)
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: json.slice(0, 5) },
      { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: json.slice(5) },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: json } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ],
    paceMs: 10,
  }
}

/** 连接器调用：Allow once → 工具行 done → 工具结果含 expected（结果内容在 shim view；0.18 工具行只显示摘要，P5-51 ⑧）。
 * T22：工具行迁 outline 面板——botTitle 用来开该 bot 的面板（面板开着时事件实时更新）。 */
export async function approveConnectorCall(page: Page, sid: string, expected: string, botTitle = ''): Promise<void> {
  await permissionDock(page).locator('button', { hasText: 'Allow once' }).click({ timeout: 20_000 })
  const label = botTitle !== '' ? botTitle : await page.locator('.sand-agent-item[data-active="true"]').first().getAttribute('aria-label') ?? ''
  await openOutline(page, label)
  await expect(toolRows(page).last(), '连接器工具调用成功').toHaveAttribute('data-status', 'done', { timeout: 60_000 })
  await expect.poll(async () => JSON.stringify((await devState(page)).views[sid]?.items.filter((i) => i.kind === 'tool') ?? []), { timeout: 30_000 })
    .toContain(expected)
}
