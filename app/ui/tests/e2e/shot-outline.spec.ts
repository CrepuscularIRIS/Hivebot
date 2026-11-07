import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { createBots, devState, launchProduct, openBot, openOutline, permissionDock, send, textCall } from '../support/ui.ts'

function stepCall(opts: { text?: string[]; reasoning?: string; tool: { name: string; input: object; id: string } }): object {
  const chunks: object[] = []
  let i = 0
  if (opts.reasoning !== undefined) {
    chunks.push({ type: 'block-start', index: i, blockType: 'reasoning' }, { type: 'reasoning-delta', index: i, text: opts.reasoning },
      { type: 'block-end', index: i, block: { type: 'reasoning', text: opts.reasoning } })
    i += 1
  }
  if (opts.text !== undefined) {
    chunks.push({ type: 'block-start', index: i, blockType: 'text' }, ...opts.text.map((text) => ({ type: 'text-delta', index: i, text })),
      { type: 'block-end', index: i, block: { type: 'text', text: opts.text.join('') } })
    i += 1
  }
  const args = JSON.stringify(opts.tool.input)
  chunks.push({ type: 'block-start', index: i, blockType: 'tool-call' }, { type: 'tool-call-delta', index: i, id: opts.tool.id, name: opts.tool.name, argumentsDelta: args },
    { type: 'block-end', index: i, block: { type: 'tool-call', id: opts.tool.id, name: opts.tool.name, arguments: args } })
  chunks.push({ type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'tool-calls' } })
  return { chunks, paceMs: 60 }
}

const OUT = '/home/lingxufeng/bot/work/grok-0.79.3-re/ours'

test('T21 截图：outline 面板 ① 完成态 + 展开一条 thinking，亮暗', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [sid] = await createBots(page, [{ title: 'OL-A' }]) as [string]
    rt.writeScriptCalls(sid, [
      stepCall({ reasoning: 'R 思考中：先看环境，再核对配置。', text: ['A 首答：收到，我先看看环境再动手。'], tool: { name: 'bash', input: { command: 'ls', description: 'T21 probe' }, id: 't21-t1' } }),
      textCall(['E 收尾：全部完成，共检查 1 处，没有问题。']),
    ])
    await openBot(page, 'OL-A')
    await send(page, '看看环境')
    await expect(permissionDock(page)).toBeVisible({ timeout: 30_000 })
    await permissionDock(page).locator('button', { hasText: 'Allow once' }).click()
    await expect(permissionDock(page)).toHaveCount(0, { timeout: 20_000 })
    await expect.poll(async () => (await devState(page)).views[sid]?.endReason, { timeout: 30_000 }).toBe('completed')
    await openOutline(page, 'OL-A')
    const rows = page.locator('.sand-outline-panel .sand-outline-item')
    await expect(rows).toHaveCount(5, { timeout: 15_000 })
    await rows.nth(1).locator('button.sand-outline-item__row').click() // 展开 thinking（R）
    await expect(rows.nth(1).locator('.sand-outline-item__detail')).toBeVisible()
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
      await page.screenshot({ path: join(OUT, `outline.${mode}.png`) })
    }
    await page.emulateMedia({ colorScheme: 'light' })
  } finally {
    await env.stop()
  }
})
