// T66：主界面结构线 hairline 化（侧栏右缘 .5px / nav 分隔 tertiary / 无底线锁住 / 暗阴影清零锁住）。
// 规格 RE-BORDERS-0.78.1；侧栏 .5px 已三重铁证：容器类串（APP@1340000 className 含 1jox5e1/18b5jzi/h1nr2e）
// + CSS 规则（index-Dh7EWA8t.css：1jox5e1 border-inline-end-width:.5px）——P5-55 对照台 1px 是 DPR1 吸放疗数。
// DPR=2 前提：DPR 1 下 .5 读回 1（LEARNINGS 末条）。
import { expect, test, type Page } from 'playwright/test'
import { join } from 'node:path'
import { createBots, launchProduct, openBot, type Env } from '../support/ui.ts'

const OUT = '/home/lingxufeng/bot/work/ui-borders-connect/evidence/T66'
const HIDPI = ['--force-device-scale-factor=2']

async function theme(page: Page, mode: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: mode })
  await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
}

const computed = (page: Page, sel: string, props: string[]): Promise<Record<string, string>> =>
  page.locator(sel).first().evaluate((el, keys) => {
    const cs = getComputedStyle(el)
    return Object.fromEntries(keys.map((k) => [k, (cs as unknown as Record<string, string>)[k]]))
  }, props)

const tokenOf = (page: Page, token: string): Promise<string> =>
  page.evaluate((t) => {
    const probe = document.createElement('div')
    probe.style.color = `var(${t})`
    probe.style.display = 'none'
    document.body.append(probe)
    const v = getComputedStyle(probe).color
    probe.remove()
    return v
  }, token)
const tokenBg = (page: Page, token: string): Promise<string> =>
  page.evaluate((t) => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = `var(${t})`
    probe.style.display = 'none'
    document.body.append(probe)
    const v = getComputedStyle(probe).backgroundColor
    probe.remove()
    return v
  }, token)
/** rgba 元组容差比（color 与 border 两路序列化舍入不同，T67 教训）。 */
const sameColor = (a: string, b: string): boolean => {
  const num = (s: string): number[] => (s.match(/[\d.]+/g) ?? []).map(Number)
  const [r1, g1, b1, a1 = 1] = num(a); const [r2, g2, b2, a2 = 1] = num(b)
  return Math.abs(r1 - r2) <= 2 && Math.abs(g1 - g2) <= 2 && Math.abs(b1 - b2) <= 2 && Math.abs(a1 - a2) <= 0.02
}

test('T66：结构线 hairline（DPR2 亮暗）', async () => {
  test.setTimeout(240_000)
  const env: Env = await launchProduct({ extraArgs: HIDPI })
  try {
    const { page } = env
    expect(await page.evaluate(() => devicePixelRatio), 'DPR=2 前提').toBe(2)
    await createBots(page, [{ title: 'T66-X', preset: 'standard' }])
    await openBot(page, 'T66-X')
    await expect(page.locator('.sand-prompt-shell')).toBeVisible({ timeout: 20_000 })

    for (const mode of ['light', 'dark'] as const) {
      await theme(page, mode)
      const tag = mode as string

      // ---- 侧栏右缘：.5px tertiary + bg-sidebar（0.78.1 类串铁证）----
      let cs = await computed(page, 'aside.sand-agents-sidebar', ['borderRightWidth', 'borderRightColor', 'backgroundColor'])
      expect(cs.borderRightWidth, `${tag} 侧栏右缘 .5px`).toBe('0.5px')
      expect(sameColor(cs.borderRightColor, await tokenOf(page, '--sand-border-tertiary-translucent')), `${tag} 侧栏缘色 tertiary（${cs.borderRightColor}）`).toBe(true)
      expect(cs.backgroundColor, `${tag} 侧栏底 bg-sidebar`).toBe(await tokenBg(page, '--sand-bg-sidebar'))

      // ---- 已对面锁住：两处无底边线 ----
      cs = await computed(page, '.sand-agents-sidebar__header', ['borderBottomWidth'])
      expect(cs.borderBottomWidth, `${tag} 侧栏头无底线`).toBe('0px')
      cs = await computed(page, '.sand-chat-header', ['borderBottomWidth'])
      expect(cs.borderBottomWidth, `${tag} chat 顶栏无底线`).toBe('0px')

      // ---- info pane 左缘：第 0 步无 .5px 锚 → 保持 1px（P5-52 定稿口径）----
      await page.click('button[aria-label="View agent settings"]')
      const pane = page.locator('aside.sand-info-pane[data-open]')
      await expect(pane).toBeVisible()
      cs = await computed(page, 'aside.sand-info-pane[data-open]', ['borderLeftWidth', 'borderLeftColor'])
      expect(cs.borderLeftWidth, `${tag} info pane 左缘 1px（无锚保持）`).toBe('1px')
      expect(sameColor(cs.borderLeftColor, await tokenOf(page, '--sand-border-tertiary-translucent')), `${tag} info pane 缘色 tertiary`).toBe(true)
      await page.keyboard.press('Escape')

      // ---- 暗色阴影清零锁住（亮色不适用——亮色阴影非 0）----
      if (mode === 'dark') {
        for (const t of ['--sand-shadow-card', '--sand-shadow-popover-ambient', '--sand-shadow-popover-key', '--sand-shadow-modal-ambient']) {
          const raw = await page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), t)
          const alpha = (raw.match(/[\d.]+\)/g) ?? []).map((s) => Number(s.replace(/[^\d.]/g, '')))
          expect(alpha.every((a) => a === 0), `${t} 暗色全 0 alpha（值=${raw}）`).toBe(true)
        }
      }
    }

    // ---- 设置 nav 右分隔：.5px tertiary（原 secondary——RE-BORDERS §0.4 修正）----
    await theme(page, 'light')
    await page.click('button[aria-label="Account"]')
    await page.locator('[role="menuitem"]', { hasText: 'Settings' }).click()
    await page.locator('.sand-settings-dialog').waitFor({ state: 'visible', timeout: 10_000 })
    let cs = await computed(page, '.sand-settings-dialog .sand-settings-nav', ['borderRightWidth', 'borderRightColor'])
    expect(cs.borderRightWidth, 'nav 右分隔 .5px').toBe('0.5px')
    expect(sameColor(cs.borderRightColor, await tokenOf(page, '--sand-border-tertiary-translucent')), `nav 缘色 tertiary（${cs.borderRightColor}）`).toBe(true)

    // ---- 截图（main 亮暗 @2x）----
    await page.keyboard.press('Escape')
    for (const mode of ['light', 'dark'] as const) {
      await theme(page, mode)
      await page.screenshot({ path: join(OUT, `main-${mode}.png`) })
    }
  } finally {
    await env.stop()
  }
})
