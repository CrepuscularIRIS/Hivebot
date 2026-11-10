import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { createBots, launchProduct, openBot, send } from '../support/ui.ts'

test('T23 截图：状态行卡 thinking 态亮暗', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [sid] = await createBots(page, [{ title: 'SL-S' }]) as [string]
    const { mkdirSync, writeFileSync } = await import('node:fs')
    const gate = `t23-s-${Date.now()}`
    const stepCall = {
      chunks: [
        { type: 'block-start', index: 0, blockType: 'reasoning' }, { type: 'reasoning-delta', index: 0, text: '先想想这个问题怎么解。' },
        { type: 'block-end', index: 0, block: { type: 'reasoning', text: '先想想这个问题怎么解。' } },
        { type: 'block-start', index: 1, blockType: 'text' }, { type: 'text-delta', index: 1, text: 'A 首答：正在分析。' },
        { type: 'block-end', index: 1, block: { type: 'text', text: 'A 首答：正在分析。' } },
        { type: 'finish', reason: { kind: 'stop' } },
      ],
      paceMs: 60, gateAfterChunk: 1, gateId: gate,
    }
    rt.writeScriptCalls(sid, [stepCall])
    await openBot(page, 'SL-S')
    await send(page, '帮我分析')
    await expect(page.locator('.sand-status-line')).toBeVisible({ timeout: 30_000 })
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
      await page.screenshot({ path: join('/home/lingxufeng/bot/work/grok-0.79.3-re/ours', `conv-working.${mode}.png`) })
    }
    await page.emulateMedia({ colorScheme: 'light' })
    mkdirSync(join(rt.home, 'gates'), { recursive: true })
    writeFileSync(join(rt.home, 'gates', gate), '')
  } finally {
    await env.stop()
  }
})
