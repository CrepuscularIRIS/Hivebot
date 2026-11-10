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
  // 对齐规范（workspaces.spec.ts launchAligned）：shell 与 SDK 共享 home，
  // dataDir = <home>/data —— main 的 PBOTS_DATA_DIR 缺省（userData）与 runtime 一致，
  // 会话 workspaceRoot 与遮蔽根同树。此前 T7a/T14 两侧分叉正是「写被拒」的根因。
  const { sandboxHome } = await import('../support/launch.ts')
  const { launchShell } = await import('../support/launch.ts')
  const home = sandboxHome('T14')
  const dataDir = join(home, 'data')
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, dataDir })
  console.log('[T14-ins] rt.home=', rt.home, ' dataDir=', dataDir)
  let shell: Awaited<ReturnType<typeof launchShell>> | undefined
  try {
    shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, home })
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

    console.log('[T14-ins] turn 后 requests.jsonl 存在?', existsSync(join(rt.home, 'fake', 'requests.jsonl')), ' home 存在?', existsSync(rt.home))
    try {
      const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
      console.log('[T14-ins] runtime 侧会话:', JSON.stringify(list.items?.map((i) => ({ id: i.sessionId, origin: i.origin })).slice(0, 5)))
    } catch (e) { console.log('[T14-ins] session/list 失败:', String(e).slice(0, 150)) }
    console.log('[T14-ins] 转写区尾部:', (await ui.locator('body').innerText()).replace(/\n+/g, ' | ').slice(-450))
    // 消息是否真落到 SDK 持久层（区分渲染端乐观回显）：follow 会话 3 秒取现存事件
    try {
      const stream = await rt.client.follow(idA)
      const frames: unknown[] = []
      const drained = (async () => { for await (const f of stream) frames.push(f) })().catch(() => {})
      await new Promise((r) => setTimeout(r, 3000))
      stream.cancel(); void drained
      console.log('[T14-ins] follow 帧数=', frames.length, ' 首2帧=', JSON.stringify(frames.slice(0, 2)).slice(0, 400))
    } catch (e) { console.log('[T14-ins] follow 失败:', String(e).slice(0, 150)) }
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
