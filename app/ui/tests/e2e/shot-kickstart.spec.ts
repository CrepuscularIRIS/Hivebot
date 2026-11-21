import { expect, test } from 'playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { finalAssistant, launchProduct } from '../support/ui.ts'

const OUT = '/home/lingxufeng/bot/work/grok-0.79.3-re/ours'
const INTRO = 'Hi! I am your new bot, happy to help.'

test('T25 截图：介绍态亮暗', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const dir = join(rt.home, 'fake', 'scripts')
    mkdirSync(dir, { recursive: true })
    const call = { chunks: [
      { type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: INTRO },
      { type: 'block-end', index: 0, block: { type: 'text', text: INTRO } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'stop' } },
    ], paceMs: 60 }
    writeFileSync(join(dir, 'default.json'), JSON.stringify({ calls: [call] }))
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    await page.locator('dialog[data-dialog="new-bot"] [data-action="create-bot"]').click()
    await expect(finalAssistant(page).last()).toContainText(INTRO, { timeout: 30_000 })
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
      await page.screenshot({ path: join(OUT, `kickstart-intro.${mode}.png`) })
    }
    await page.emulateMedia({ colorScheme: 'light' })
  } finally {
    await env.stop()
  }
})
