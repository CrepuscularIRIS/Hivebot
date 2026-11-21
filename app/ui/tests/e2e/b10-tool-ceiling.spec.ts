// B10 e2e：per-tool ceiling——预设 always 档（ui 直调口）→ bash 调用前置判定自动过（无审批卡）→ 设置面 Tools 区见档。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { bashCall, permissionDock, waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const editor = (page: import('playwright/test').Page) => page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')

test('B10：ceiling always 前置判定+设置面', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b10-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    rt.writeScriptCalls(sid!, [bashCall('echo first', 'c1')])
    // 预设 always 档（渲染层 ui 直调口——B10 施工面；审批卡勾选路径留 mcp 连接器批回归）
    await page.evaluate(() => { (window as unknown as { pbotsUi: { setToolCeiling: (t: string, l: string) => void } }).pbotsUi.setToolCeiling('bash', 'always') })
    await editor(page).click()
    await page.keyboard.type('go', { delay: 3 })
    await page.keyboard.press('ControlOrMeta+Enter')
    // 前置判定：always 自动过——审批 dock 不出现（无新卡；Review Focus 3）
    await expect(permissionDock(page), 'always 档自动过不再发卡').toBeHidden({ timeout: 8_000 })
    // 设置面 Tools 区：bash 档位行 always
    await page.click('button[aria-label="View agent settings"]')
    const pane = page.locator('.sand-info-pane[data-open]').locator('[data-pane-config]')
    await expect(pane.locator('[data-tools-heading]')).toBeVisible({ timeout: 10_000 })
    await expect(pane.locator('[data-tool-row="bash"]')).toBeVisible({ timeout: 5_000 })
    await expect(pane.locator('[data-tool-row="bash"] [data-ceiling="always"]')).toBeVisible({ timeout: 5_000 })
  } finally { await shell.stop(); await rt.stop() }
})
