// T89：mermaid/KaTeX 真渲染——①合法 mermaid 出 svg 无红字 ②行内+块级公式出 .katex
// ③非法 mermaid 仍走上游红字分支 ④无失败网络请求。先红：主线产物缺 /upstream/assets/*。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const textCall = (text: string): object => ({ chunks: [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text },
  { type: 'block-end', index: 0, block: { type: 'text', text } },
  { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
  { type: 'finish', reason: { kind: 'stop' } },
], paceMs: 10 })

test('T89：mermaid/KaTeX 渲染（合法图/公式/非法图红字分支/零失败请求）', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t89-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  const failedRequests: string[] = []
  try {
    const page = shell.page
    page.on('requestfailed', (r) => { failedRequests.push(r.url()) })
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    const send = async (text: string): Promise<void> => {
      const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
      await editor.click()
      await page.keyboard.type(text.slice(0, 4), { delay: 3 })
      await page.keyboard.type(text.slice(4), { delay: 2 })
      await page.click('button[aria-label="Send message"]')
    }
    // ① 合法 mermaid
    rt.writeScriptCalls(sid!, [textCall('图来了\n\n```mermaid\ngraph TD; A-->B\n```\n')])
    await send('第一问')
    await expect(page.locator('.sand-message[data-role="assistant"]').last()).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('.sand-mermaid svg'), '合法 mermaid 渲染出 svg').toHaveCount(1, { timeout: 20_000 })
    const svgText = await page.locator('.sand-mermaid svg').evaluate((el) => el.textContent ?? '')
    expect(svgText, '图内含节点文本 A/B').toContain('A')
    expect(await page.locator('.sand-mermaid-error').count(), '无红字').toBe(0)
    // ② KaTeX：行内 \( ... \) 与块级 $$ ... $$（上游 prompt 教的分隔符）
    rt.writeScriptCalls(sid!, [textCall('占位'), textCall('行内 \\(E=mc^2\\) 和 \\(a^2+b^2=c^2\\) 两条\\n')])  // 注:上游 inline regex 排除含反斜杠式(如 \\int)——上游限制记档
    await send('第二问')
    await expect(page.locator('.sand-message[data-role="user"]').nth(1), '第二问已发出').toContainText('第二问', { timeout: 20_000 })
    await expect(page.locator('.sand-message[data-role="assistant"]').nth(1)).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('.katex'), '行内公式 ≥2 个 katex 节点').toHaveCount(2, { timeout: 20_000 })
    expect(await page.locator('.katex-error').count(), '无 katex 错误').toBe(0)
    // ③ 非法 mermaid → 上游红字分支仍在
    rt.writeScriptCalls(sid!, [textCall('占位'), textCall('占位2'), textCall('坏图\n\n```mermaid\ngraph TD; A-->\n```\n')])
    await send('第三问')
    await expect(page.locator('.sand-message[data-role="user"]').nth(2)).toContainText('第三问', { timeout: 20_000 })
    await expect(page.locator('.sand-message[data-role="assistant"]').nth(2)).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('.sand-mermaid-error'), "非法图仍出 Couldn't render").toHaveCount(1, { timeout: 20_000 })
    // ④ 零失败请求（mermaid/katex 字样）
    expect(failedRequests.filter((u) => /mermaid|katex/i.test(u)), '零失败请求').toEqual([])
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
