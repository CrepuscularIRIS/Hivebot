// T56：暗色 neutral primary 按钮 = 原版黑白反差（bg --sand-bg-primary + 字 --sand-text-inverted），
// 根修一处（.sand-1wclgxm）；删三处单按钮补丁后仍对。亮色抽测同断言（黑底白字）。
import { expect, test } from 'playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '../support/tmp-sweep.ts'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { PRESETS_PATCH } from '../support/ui.ts'
import { waitProductReady } from '../support/ui.ts'

const OUT = '/home/lingxufeng/bot/work/ui-polish-win/evidence/T56'

const ratio = (a: [number, number, number], b: [number, number, number]): number => {
  const lum = (c: [number, number, number]): number => {
    const f = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
  }
  const [x, y] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)]
  return (x + 0.05) / (y + 0.05)
}
const parse = (s: string): [number, number, number] => {
  const m = /rgba?\((\d+), (\d+), (\d+)/.exec(s) ?? []
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

interface Spot { name: string; open(page: import('playwright/test').Page): Promise<void>; close?(page: import('playwright/test').Page): Promise<void>; sel: string }

const SPOTS: Spot[] = [
  {
    name: 'create-bot（T30d/T30db 补丁位）', sel: '[data-action="create-bot"]:not([disabled])',
    open: async (page) => {
      await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
      await page.locator('dialog[data-dialog="new-bot"]').waitFor({ state: 'visible', timeout: 15_000 })
      await page.getByRole('textbox', { name: 'Bot name' }).fill('T56')
      await page.locator('input[name="pb-preset"]').first().check({ force: true }) // preset 必选，否则 Create 恒 disabled
      await page.locator('[data-action="create-bot"]:not([disabled])').waitFor({ timeout: 10_000 })
    },
    close: async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(250) },
  },
  {
    name: 'add-index-source（市场空态主钮）', sel: '[data-action="add-index-source"]',
    open: async (page) => {
      await page.locator('.sand-agents-sidebar__plugins').click()
      await page.locator('[data-market]').waitFor({ state: 'visible', timeout: 15_000 })
      await page.waitForTimeout(400)
    },
    close: async (page) => { await page.locator('[data-market] button[aria-label="Close"]').click(); await page.waitForTimeout(250) },
  },
]

test('T56：neutral primary 亮暗都是原版反差且对比度 ≥4.5（补丁已删仍对=根治）', async () => {
  test.setTimeout(240_000)
  mkdirSync(OUT, { recursive: true })
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, cwd: tmkdir('bot-t56-ws-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    for (const [scheme, bgWant, fgWant, spots] of [
      ['light', 'rgb(28, 28, 28)', 'rgb(252, 252, 252)', [SPOTS[0]!]] as const,
      ['dark', 'rgb(245, 245, 245)', 'rgb(18, 18, 18)', SPOTS] as const,
    ]) {
      await page.emulateMedia({ colorScheme: scheme })
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme), { timeout: 5_000 }).toContain(scheme === 'dark' ? 'dark' : 'light') // 主题是异步跟的，等 html[data-theme] 落定
      for (const spot of spots) {
        await spot.open(page)
        const btn = page.locator(spot.sel).first()
        await btn.waitFor({ state: 'visible', timeout: 15_000 })
        const style = await btn.evaluate((el) => {
          const cs = getComputedStyle(el)
          return { bg: cs.backgroundColor, fg: cs.color }
        })
        expect.soft(style.bg, `${scheme} ${spot.name} 底色`).toBe(bgWant)
        expect.soft(style.fg, `${scheme} ${spot.name} 字色`).toBe(fgWant)
        expect.soft(ratio(parse(style.bg), parse(style.fg)), `${scheme} ${spot.name} 对比度 ${style.fg} on ${style.bg}`).toBeGreaterThanOrEqual(4.5)
        if (spot.close !== undefined) await spot.close(page)
      }
      await page.screenshot({ path: join(OUT, `neutral-primary.${scheme}.png`) })
    }
    // accent 侧不动：on-primary 暗色值保持原版（accent 消费者不受本单影响）
    await page.emulateMedia({ colorScheme: 'dark' })
    const onPrimary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sand-text-on-primary').trim())
    expect(onPrimary, 'accent 字色变量未动（暗 #f5f5f5）').toBe('#f5f5f5')
  } finally { await shell.stop(); await rt.stop() }
})
