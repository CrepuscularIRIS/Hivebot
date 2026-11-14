// P5-14 E5 细边（0.18 production.css:43 `border-right: .5px solid var(--sand-border-weak)`）迁到 renderer-grok：
// 必须在 DPR 2 下量——CSS border-width 计算值按设备像素吸附，DPR 1 时 .5px 计算为 1px（Electron 44 实测）。
// T66 翻案：0.78.1 侧栏右缘源码即 .5px——三重铁证（容器类串 APP@1340000 含 1jox5e1/18b5jzi/h1nr2e +
// CSS `sand-1jox5e1{border-inline-end-width:.5px}` + solid/tertiary 同组规则）。P5-55 时期「实测 1px」
// 出自 DPR1 对照台的吸附伪读（同口径下 0.78.1 自己的 .5 也读 1）。本用例锁 .5px（T66 顺带修正）。
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
      expect(await edge(), `${mode} sidebar`).toBe('0.5px')
      await page.screenshot({ path: join(OUT, `hairline-${mode}.png`) })
    }
  } finally {
    await env.stop()
  }
})
