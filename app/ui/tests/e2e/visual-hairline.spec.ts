// P5-14 E5 细边（0.18 production.css:43 `border-right: .5px solid var(--sand-border-weak)`）迁到 renderer-grok：
// 必须在 DPR 2 下量——CSS border-width 计算值按设备像素吸附，DPR 1 时 .5px 计算为 1px（Electron 44 实测）。
// P5-55：0.78.1 实测侧栏右缘 = 1px solid border-tertiary-translucent（对照台 ref computed，DPR 2 下同为 1px），
// 0.18 的 .5px 由 overrides/p5-55-layout.css 换成 0.78.1 值；本用例改锁 1px（DPR 2 仍是区分 .5 与 1 的量法）。
import { expect, test, type Page } from 'playwright/test'
import { join } from 'node:path'
import { createBots, evidenceOut, launchProduct, openBot, type Env } from '../support/ui.ts'

const OUT = evidenceOut('P5-14')
const HIDPI = ['--force-device-scale-factor=2']

async function theme(page: Page, mode: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: mode })
  await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
}

test('E5：侧栏右缘细边 = 0.78.1 的 1px（DPR 2，亮暗）', async () => {
  test.setTimeout(120_000)
  const env: Env = await launchProduct({ extraArgs: HIDPI })
  try {
    const { page } = env
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2)
    await createBots(page, [{ title: 'E5-X', preset: 'standard' }])
    await openBot(page, 'E5-X')
    // 细边落在侧栏外框（aside 或其最近的带右边框祖先）上
    const edge = (): Promise<string> => page.locator('aside.sand-agents-sidebar').evaluate((el) => {
      for (let n: Element | null = el; n !== null && n !== document.body; n = n.parentElement) {
        const w = getComputedStyle(n).borderRightWidth
        if (w !== '0px') return w
      }
      return '0px'
    })
    for (const mode of ['light', 'dark'] as const) {
      await theme(page, mode)
      expect(await edge(), `${mode} sidebar`).toBe('1px')
      await page.screenshot({ path: join(OUT, `hairline-${mode}.png`) })
    }
  } finally {
    await env.stop()
  }
})
