// T81a UI 层：运行中再发消息=顶掉（shim sendPrompt 前置 session/cancel）。
// fake 慢流 turn1 进行中发第二条 → 半截保留 + 第二条回复。
import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const textCallSlow = (text: string, paceMs: number): object => ({ chunks: [
  { type: 'block-start', index: 0, blockType: 'text' },
  ...text.match(/.{1,12}/g)!.map((piece) => ({ type: 'text-delta', index: 0, text: piece })),
  { type: 'block-end', index: 0, block: { type: 'text', text } },
  { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
  { type: 'finish', reason: { kind: 'stop' } },
], paceMs })

test('T81a：发消息即顶掉运行中 turn（半截保留+新 turn 回复）', async () => {
  test.setTimeout(240_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t81a-ws-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    const send = async (text: string): Promise<void> => {
      const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
      await editor.click()
      await page.keyboard.type(text, { delay: 3 })
      await page.click('button[aria-label="Send message"]')
    }
    // gate 版慢流：第 2 块后挂起（不释放）——cancel 时 turn1 停在前 2 块=真半截
    const gated = { chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: '第一条已流出的开头两块' },
      { type: 'text-delta', index: 0, text: '内容继续' },
      { type: 'text-delta', index: 0, text: '后半永不到达' },
      { type: 'block-end', index: 0, block: { type: 'text', text: '第一条完整但不会到' } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ], gateAfterChunk: 2, gateId: 't81a-g1', paceMs: 50 }
    rt.writeScriptCalls(sid!, [gated, textCall(['第二条的回复到了'])])
    await send('第一问')
    // 等首块流出（turn1 进行中的标志）
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '第一条' })).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(1_000) // gate 挂起态稳定
    await send('第二问')
    // supersede：turn1 被顶掉，半截仍在 transcript，turn2 回复到达
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '第二条的回复到了' })).toBeVisible({ timeout: 60_000 })
    const firstBubble = page.locator('.sand-message[data-role="assistant"]', { hasText: '第一条' }).first()
    await expect(firstBubble, '半截保留（turn1 被打断但已流出文本不删）').toBeVisible()
    // Sol 低①补：第二块「内容继续」也保留；turn1 的嵌套 user 结构；第一问无假停止态
    await expect(firstBubble).toContainText('内容继续')

    const stoppedBadge = page.locator('.sand-message[data-role="assistant"]', { hasText: 'stopped' }).first()
    expect(await stoppedBadge.count(), '无假停止标记').toBe(0)
    const firstText = await firstBubble.innerText()
    // 终态诊断+断言：解本 run session 文件
    const { execSync } = await import('node:child_process')
    const dir = execSync(`find ${JSON.stringify(rt.home)} -type d -name '${sid}' -print -quit`, { encoding: 'utf8' }).trim()
    const jsonl = execSync(`zstd -dc ${JSON.stringify(join(dir, 'session.v4.jsonl.zstd'))}`, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    const reasons = jsonl.split('\n').filter((l) => l.includes('"type":"turn/end"')).map((l) => { try { return JSON.stringify(JSON.parse(l).data).slice(0, 160) } catch { return 'PARSE-ERR' } })
    expect(firstText, '半截=已流出两块、后半被截断').toContain('第一条已流出的开头两块')
    expect(firstText).not.toContain('后半永不到达')
    expect(reasons[0], 'turn1=aborted(user)').toContain('"kind":"aborted"')
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
