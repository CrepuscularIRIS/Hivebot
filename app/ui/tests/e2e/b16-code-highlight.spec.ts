// B16 e2e：assistant 代码块 shiki 高亮——fake-llm 回 ```ts 代码块 → .sand-code-highlighted + token span。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { send, textCall, waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B16：代码块 shiki 高亮', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b16-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    rt.writeScriptCalls(sid!, [textCall(['看这段：', '\n```ts\nconst x: number = 42\nfunction hi(name: string): string {\n  return `hi ${name}`\n}\n```\n完'])])
    await send(page, '给我代码')
    const fig = page.locator('.sand-code-highlighted')
    await expect(fig).toBeVisible({ timeout: 20_000 })
    await expect(fig.locator('pre code .line, pre code span').first()).toBeVisible({ timeout: 5_000 })
    await expect(fig).toContainText('function hi')
  } finally { await shell.stop(); await rt.stop() }
})
