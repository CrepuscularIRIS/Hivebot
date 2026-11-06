// T14（UI 侧复现）：SDK 层 claim/cwd/presets 三格全绿（证伪 claim 假设）后，
// 按工单边界 1 转 UI 侧——launchSdkRuntime + 真实 M1 建会话 + write 脚本。
// 目标：拿到 UI 组合下 write 被拒的原始 toolResult，钉住与 SDK 层的差异面。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from 'playwright/test'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { botItem, createBots, PRESETS_PATCH, textCall, toolCall } from '../support/ui.ts'

const R = `t14ui-${Math.random().toString(16).slice(2, 10)}`

async function grokSend(page: Page, text: string): Promise<void> {
  const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
  await editor.click({ timeout: 15_000 })
  await page.keyboard.type(text, { delay: 5 })
  await expect(editor).toContainText(text.slice(0, 4))
  await page.click('button[aria-label="Send message"]')
}

test('UI 组合：bot write 自己工作区（M1 claim 路径）', { timeout: 300_000 }, async ({ page }) => {
  const dataDir = mkdtempSync(join(process.env.HOME!, 'bot-T14ui-'))
  mkdirSync(join(dataDir, 'workspaces'), { recursive: true })
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, dataDir, cwd: join(dataDir, 'workspaces') })
  // 与 T7a 完全相同的 launch 形参——保证复现条件一致
  const { launchShell } = await import('../support/launch.ts')
  let shell: Awaited<ReturnType<typeof launchShell>> | undefined
  try {
    shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
    const ui = shell.page
    await expect(ui.locator('.sand-agent-item')).toHaveCount(1, { timeout: 60_000 })
    await expect(ui.locator('.ProseMirror[contenteditable="true"]')).toBeVisible({ timeout: 20_000 })
    await expect(ui.locator('.sand-agent-item [data-grok-state]').first()).toHaveAttribute('data-grok-state', 'idle', { timeout: 30_000 })

    const [idA] = await createBots(ui, [{ title: 'T14-A' }])
    const wsA = join(dataDir, 'workspaces', idA)
    rt.writeScriptCalls(idA, [
      toolCall('write', { file_path: join(wsA, 'probe.txt'), content: R }, 't14w1'),
      textCall(['T14', ' 完', '成', '。']),
    ])
    await botItem(ui, 'T14-A').click()
    await grokSend(ui, 'T14 探针')
    await expect(ui.locator('.sand-agent-item [data-grok-state]').first()).toHaveAttribute('data-grok-state', 'idle', { timeout: 120_000 })

    const requests = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8').trim().split('\n')
      .map((l) => JSON.parse(l) as { sessionId: string | null; toolResults: Array<{ toolCallId: string | null; isError: boolean; text: string }> })
      .filter((r) => r.sessionId === idA)
    const write = requests.flatMap((r) => r.toolResults).find((t) => t.toolCallId === 't14w1')
    console.log('[T14-UI] write result:', JSON.stringify(write))
    expect(write?.isError ?? true, `UI 组合 write 被拒：${write?.text ?? '无结果'}（T14 缺陷现场）`).toBe(false)
    expect(existsSync(join(wsA, 'probe.txt'))).toBe(true)
  } finally {
    await shell?.stop()
    await rt.stop()
    rmSync(dataDir, { recursive: true, force: true })
  }
})
