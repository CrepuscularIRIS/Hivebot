// P5-14 E5 细边（0.18 production.css:43 `border-right: .5px solid var(--sand-border-weak)`）迁到 renderer-grok：
// 必须在 DPR 2 下量——CSS border-width 计算值按设备像素吸附，DPR 1 时 .5px 计算为 1px（Electron 44 实测）。
// ① 侧栏右缘 .5px（0.18 自带）；② 会话设置 pane 左缘：P5-52 的临时右浮覆盖写的是 1px（overrides/dead-entries.css），
//    值锁在 visual-baseline（U2′ C1 行），.5px 归 P5-55 定稿版式时一并替换——这里只锁侧栏这一处原生细边。
import { expect, test, type Page } from 'playwright/test'
import { join } from 'node:path'
import { createBots, evidenceOut, launchProduct, openBot, type Env } from '../support/ui.ts'

const OUT = evidenceOut('P5-14')
const HIDPI = ['--force-device-scale-factor=2']

async function theme(page: Page, mode: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: mode })
  await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
}

test('E5：侧栏右缘 .5px 细边（DPR 2，亮暗）', async () => {
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
