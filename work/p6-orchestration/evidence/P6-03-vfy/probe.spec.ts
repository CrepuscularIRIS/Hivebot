// P6-03 验收探针（verifier 独立断言，不经 builder 的 p6-fold.spec）：
// 同一 D1 事件脚本重放，dump ARIA snapshot + transcript innerText 到文件，另带独立断言。
import { expect, test } from 'playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assistantRows, devState, launchProduct, permissionDock, send, textCall, transcript } from '/tmp/bot-wt/P6-03/app/ui/tests/support/ui.ts'

const OUT = '/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-03-vfy'
const A = 'A：收到，我先看看环境再动手。'
const E = 'E：全部完成，共检查 3 处，没有问题。'

function stepCall(opts: { text?: string[]; tool?: { name: string; input: object; id: string } }): object {
  const chunks: object[] = []
  let i = 0
  if (opts.text !== undefined) {
    chunks.push({ type: 'block-start', index: i, blockType: 'text' }, ...opts.text.map((text) => ({ type: 'text-delta', index: i, text })),
      { type: 'block-end', index: i, block: { type: 'text', text: opts.text.join('') } })
    i += 1
  }
  const args = JSON.stringify(opts.tool?.input ?? {})
  chunks.push({ type: 'block-start', index: i, blockType: 'tool-call' }, { type: 'tool-call-delta', index: i, id: opts.tool!.id, name: opts.tool!.name, argumentsDelta: args },
    { type: 'block-end', index: i, block: { type: 'tool-call', id: opts.tool!.id, name: opts.tool!.name, arguments: args } })
  chunks.push({ type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'tool-calls' } })
  return { chunks, paceMs: 60 }
}

test('vfy probe: D1 ended DOM dump', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const sid = (await devState(page)).meta.mainBotId!
    await expect.poll(async () => (await devState(page)).views[sid]?.cwd ?? null, { timeout: 20_000 }).not.toBeNull()
    const cwd = (await devState(page)).views[sid]!.cwd!
    const read = (id: string) => { writeFileSync(join(cwd, `${id}.txt`), `${id} content\n`); return { name: 'read', input: { file_path: join(cwd, `${id}.txt`) }, id } }
    rt.writeScriptCalls(sid, [
      stepCall({ text: [A], tool: { name: 'bash', input: { command: 'echo vfy' }, id: 'vfy-t1' } }),
      stepCall({ text: ['B：第一步结果正常，', '接着读配置。\nB 第二行：配置里有三个键。'], tool: read('vfy-t2') }),
      stepCall({ text: ['C：配置读完，最后核对一次。'], tool: read('vfy-t3') }),
      textCall([E]),
    ])
    await send(page, '验收探针：检查环境配置')
    for (const n of [1, 2, 3]) {
      await expect(permissionDock(page)).toBeVisible({ timeout: 30_000 })
      await permissionDock(page).locator('button', { hasText: 'Allow once' }).click()
      await expect(permissionDock(page)).toHaveCount(0, { timeout: 20_000 })
    }
    await expect.poll(async () => (await devState(page)).views[sid]?.endReason, { timeout: 30_000 }).toBe('completed')
    // 独立断言（verifier 自写，与 builder spec 不同措辞）
    const bubbles = assistantRows(page).locator('.sand-message-prose')
    await expect(bubbles).toHaveCount(2)
    const texts = await bubbles.allInnerTexts()
    expect(texts[0]?.startsWith('A：')).toBe(true)
    expect(texts[1]?.startsWith('E：')).toBe(true)
    const think = transcript(page).locator('.sand-outline-item[data-kind="thinking"]')
    await expect(think).toHaveCount(2)
    const body = await transcript(page).innerText()
    expect(body.split('E：全部完成').length - 1).toBe(1) // E 不重复
    // 落盘：ARIA snapshot + innerText + 截图
    const snap = await page.locator('body').ariaSnapshot()
    writeFileSync(join(OUT, 'probe-aria.txt'), snap)
    writeFileSync(join(OUT, 'probe-transcript.txt'), body)
    await page.screenshot({ path: join(OUT, 'probe-ended.png') })
  } finally { await env.stop() }
})
