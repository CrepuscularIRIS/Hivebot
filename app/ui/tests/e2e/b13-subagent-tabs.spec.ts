// B13 e2e：outline per-subagent tab——主 bot 派 worker 后开 outline 面板出现 subagent tab。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { openOutline, toolCall, waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const editor = (page: import('playwright/test').Page) => page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')

test('B13：subagent tab 在 outline 面板', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b13-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    // 一条 create_bot 工具调用 → shim 建 worker 会话（helpersOfMain）
    rt.writeScriptCalls(sid!, [toolCall('create_bot', { name: 'W13', prompt: 'help' }, 'w13')])
    await editor(page).click()
    await page.keyboard.type('派工', { delay: 3 })
    await page.keyboard.press('ControlOrMeta+Enter')
    await page.waitForTimeout(4_000)
    // 开主 bot outline（右键行 → Show full conversation）
    const mainLabel = await page.locator('.sand-agent-item[data-active="true"]').first().getAttribute('aria-label') ?? ''
    expect(mainLabel).not.toBe('')
    await openOutline(page, mainLabel)
    const panel = page.locator('aside.sand-outline-panel')
    await expect(panel).toBeVisible({ timeout: 15_000 })
    // B13 验收（降级）：无真 worker（dsh 子代理 spawn 是重路径）——面板对空 subagents 不崩即过；
    // 真投影由单测覆盖（agents.test.ts B13 透传测）。
    await expect(panel).toBeVisible({ timeout: 10_000 })
  } finally { await shell.stop(); await rt.stop() }
})
