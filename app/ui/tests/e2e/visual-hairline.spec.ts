// P5-14 E5 细边残余（RE-visual-residual E5；0.18 production.css:43 `border-right: .5px solid var(--sand-border-weak)`）：
// token 层给 L1 / L2 边框宽度 token = .5px；已修两处（侧栏右缘 app.css:39、pane 左缘 app.css:277）保持 .5px。
// 必须在 DPR 2 下量：CSS border-width 计算值按设备像素吸附，DPR 1 时 .5px 计算为 1px（Electron 44 实测）。
import { expect, test, type Page } from 'playwright/test'
import { join } from 'node:path'
import { createViaDialog, devState, evidenceOut, launchProduct, type Env } from '../support/ui.ts'

const OUT = evidenceOut('P5-14')
const HIDPI = ['--force-device-scale-factor=2']
const MODES = ['light', 'dark'] as const

async function theme(page: Page, mode: (typeof MODES)[number]): Promise<void> {
  await page.emulateMedia({ colorScheme: mode })
  await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
}

/** 用 token 画一条边：探针元素 `border: var(--…-width) solid var(--…)`，读计算宽度。 */
const tokenBorder = (page: Page, level: 'l1' | 'l2'): Promise<string> =>
  page.evaluate((lv) => {
    const el = document.createElement('div')
    el.style.border = `var(--dsw-alias-border-${lv}-width) solid var(--dsw-alias-border-${lv})`
    document.body.append(el)
    const w = getComputedStyle(el).borderTopWidth
    el.remove()
    return w
  }, level)

test('E5：L1 / L2 边框宽度 token = .5px，侧栏右缘 / pane 左缘仍 .5px（DPR 2，亮暗）', async () => {
  test.setTimeout(120_000)
  const env: Env = await launchProduct({ extraArgs: HIDPI })
  try {
    const { page } = env
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2)
    await env.shell.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 820) })
    const x = await createViaDialog(page, 'standard')
    await expect.poll(async () => (await devState(page)).views[x]?.cwd).toBeTruthy()
    await page.click('[data-action="toggle-info-pane"]')
    const pane = page.locator('[data-info-pane]')
    await expect(pane).toBeVisible()

    for (const mode of MODES) {
      await theme(page, mode)
      // ① token 层
      expect(await tokenBorder(page, 'l1'), `${mode} l1`).toBe('0.5px')
      expect(await tokenBorder(page, 'l2'), `${mode} l2`).toBe('0.5px')
      // ② 已修两处
      expect(await page.locator('.sidebar').evaluate((el) => getComputedStyle(el).borderRightWidth), `${mode} sidebar`).toBe('0.5px')
      expect(await pane.evaluate((el) => getComputedStyle(el).borderLeftWidth), `${mode} pane`).toBe('0.5px')
      await page.screenshot({ path: join(OUT, `hairline-${mode}.png`) })
    }
  } finally {
    await env.stop()
  }
})

// 偏差项（不留红）：组件 css 仍写死 `1px solid var(--dsw-alias-border-l1|l2)`（app.css:41,55,134,338,361），
// 本任务只改 token、不改组件 → 消费侧接线转 P5-14.f1；f1 落地后此用例转绿，test.fail 会报错提醒删掉标记。
test('P5-14.f1：组件消费 L1 宽度 token（sidebar-menu 底边 .5px）', async () => {
  test.fail(true, 'P5-14.f1：app.css L1/L2 消费点仍写死 1px，期望 var(--dsw-alias-border-l1-width) = .5px')
  const env = await launchProduct({ extraArgs: HIDPI })
  try {
    expect(await env.page.locator('.sidebar-menu').evaluate((el) => getComputedStyle(el).borderBottomWidth)).toBe('0.5px')
  } finally {
    await env.stop()
  }
})
