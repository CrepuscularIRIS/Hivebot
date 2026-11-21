import { expect, test } from 'playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { devState, launchProduct, MAIN_TITLE, permissionDock, send } from '../support/ui.ts'

function stepCall(opts: { text?: string[]; tool: { name: string; input: object; id: string }; gateId?: string }): object {
  const chunks: object[] = []
  let i = 0
  if (opts.text !== undefined) {
    chunks.push({ type: 'block-start', index: i, blockType: 'text' }, ...opts.text.map((text) => ({ type: 'text-delta', index: i, text })),
      { type: 'block-end', index: i, block: { type: 'text', text: opts.text.join('') } })
    i += 1
  }
  const args = JSON.stringify(opts.tool.input)
  chunks.push({ type: 'block-start', index: i, blockType: 'tool-call' }, { type: 'tool-call-delta', index: i, id: opts.tool.id, name: opts.tool.name, argumentsDelta: args },
    { type: 'block-end', index: i, block: { type: 'tool-call', id: opts.tool.id, name: opts.tool.name, arguments: args } })
  chunks.push({ type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'tool-calls' } })
  return { chunks, paceMs: 60, ...(opts.gateId !== undefined ? { gateAfterChunk: 1, gateId: opts.gateId } : {}) }
}
const textCall = (pieces: string[], gateId?: string): object =>
  ({ chunks: [{ type: 'block-start', index: 0, blockType: 'text' }, ...pieces.map((text) => ({ type: 'text-delta', index: 0, text })),
    { type: 'block-end', index: 0, block: { type: 'text', text: pieces.join('') } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'stop' } }], paceMs: 60, ...(gateId !== undefined ? { gateAfterChunk: 1, gateId } : {}) })

const OUT = '/home/lingxufeng/bot/work/grok-0.79.3-re/ours'
const A = 'A：收到，我先看看环境再动手。'
const B = 'B：第一步结果正常，接着读配置。'
const E = 'E：全部完成，共检查 2 处，没有问题。'

test('T22 截图：主聊天 conv-working（gate 卡住）/ conv-done（完成）亮暗', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const sid = (await devState(page)).meta.mainBotId!
    const gate = `t22-${Date.now()}`
    rt.writeScriptCalls(sid, [
      stepCall({ text: [A], tool: { name: 'bash', input: { command: 'echo t22', description: 'T22 shot' }, id: 't22-t1' } }),
      stepCall({ text: [B], tool: { name: 'bash', input: { command: 'echo t22b', description: 'T22 shot b' }, id: 't22-t2' }, gateId: gate }),
      textCall([E]),
    ])
    await send(page, '检查一下环境')
    await expect(permissionDock(page)).toBeVisible({ timeout: 30_000 })
    await permissionDock(page).locator('button', { hasText: 'Allow once' }).click()
    await expect(permissionDock(page)).toHaveCount(0, { timeout: 20_000 })
    // working：B 流式被 gate 卡住（主聊天只有 A + typing 点，过程不可见）
    await page.waitForTimeout(2500)
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
      await page.screenshot({ path: join(OUT, `conv-working.${mode}.png`) })
    }
    await page.emulateMedia({ colorScheme: 'light' })
    mkdirSync(join(rt.home, 'gates'), { recursive: true })
    writeFileSync(join(rt.home, 'gates', gate), '')
    await expect(permissionDock(page)).toBeVisible({ timeout: 30_000 }) // t2 的 bash 也出卡
    await permissionDock(page).locator('button', { hasText: 'Allow once' }).click()
    await expect(permissionDock(page)).toHaveCount(0, { timeout: 20_000 })
    await expect.poll(async () => (await devState(page)).views[sid]?.endReason, { timeout: 30_000 }).toBe('completed')
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
      await page.screenshot({ path: join(OUT, `conv-done.${mode}.png`) })
    }
    await page.emulateMedia({ colorScheme: 'light' })
  } finally {
    await env.stop()
  }
})
