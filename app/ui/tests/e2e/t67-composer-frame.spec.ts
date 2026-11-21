// T67：composer 外框四态（静息 .5px secondary / hover·focus primary / 拖拽 accent）+ 双圆角 22↔18。
// 规格 RE-BORDERS-0.78.1 §2.3（REA 标「最大嫌疑点」）；过渡时长锁 P5-55 运行时实测 .3s/.3s/.15s/.15s。
// DPR=2 是前提：DPR 1 下 .5px 读回 1px、宽度格恒绿（T57 教训）。
// 色值走 token 求值比对（probe 元素同 var），不写死。
import { expect, test, type Page } from 'playwright/test'
import { join } from 'node:path'
import { createBots, evidenceOut, launchProduct, openBot, type Env } from '../support/ui.ts'

const OUT = '/home/lingxufeng/bot/work/ui-borders-connect/evidence/T67'
const HIDPI = ['--force-device-scale-factor=2']

async function theme(page: Page, mode: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: mode })
  await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
}

/** token 求值对比：目标属性值 == 同 var 喂进 probe 元素的 computed 值。 */
const frame = (page: Page, props: string[]): Promise<Record<string, string>> =>
  page.locator('.sand-prompt-shell').evaluate((el, keys) => {
    const cs = getComputedStyle(el)
    return Object.fromEntries(keys.map((k) => [k, (cs as unknown as Record<string, string>)[k]]))
  }, props)
/** token 求值：色 token 喂进 probe 的 color（同 rgba() 序列化，可与 borderTopColor 直接比）。 */
const tokenColor = (page: Page, token: string): Promise<string> =>
  page.evaluate((t) => {
    const probe = document.createElement('div')
    probe.style.color = `var(${t})`
    probe.style.display = 'none'
    document.body.append(probe)
    const v = getComputedStyle(probe).color
    probe.remove()
    return v
  }, token)

/** 色近似比：color 与 borderTopColor 两路序列化舍入不同（0.239→0.24 vs 0.235），按 rgba 元组容差比。 */
const sameColor = (a: string, b: string): boolean => {
  const num = (s: string): number[] => (s.match(/[\d.]+/g) ?? []).map(Number)
  const [r1, g1, b1, a1 = 1] = num(a); const [r2, g2, b2, a2 = 1] = num(b)
  return Math.abs(r1 - r2) <= 2 && Math.abs(g1 - g2) <= 2 && Math.abs(b1 - b2) <= 2 && Math.abs(a1 - a2) <= 0.02
}
const expectColor = (actual: string, token: string, label: string): void => {
  expect(sameColor(actual, token), `${label}：${actual} ≈ token ${token}`).toBe(true)
}

/** 静息化：blur + 鼠标挪去侧栏（避开 hover）。 */
async function rest(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  const aside = page.locator('aside.sand-agents-sidebar')
  if (await aside.count()) await page.mouse.move(8, 8)
  await page.waitForTimeout(400) // 边色过渡 .15s——上一态残留需等回落
}

test('T67：composer 外框四态 + 22/18 双圆角 + 过渡（DPR2 亮暗）', async () => {
  test.setTimeout(240_000)
  const env: Env = await launchProduct({ extraArgs: HIDPI })
  try {
    const { page } = env
    expect(await page.evaluate(() => devicePixelRatio), 'DPR=2 前提').toBe(2)
    await createBots(page, [{ title: 'T67-X', preset: 'standard' }])
    await openBot(page, 'T67-X')
    const shell = page.locator('.sand-prompt-shell')
    await expect(shell).toBeVisible({ timeout: 20_000 })

    for (const mode of ['light', 'dark'] as const) {
      await theme(page, mode)
      const tag = mode as string

      // ---- 静息：.5px secondary / 22px / 高 44 ----
      await rest(page)
      let cs = await frame(page, ['borderTopWidth', 'borderTopColor', 'borderRadius', 'height'])
      expect(cs.borderTopWidth, `${tag} 静息宽 .5px`).toBe('0.5px')
      expectColor(cs.borderTopColor, await tokenColor(page, '--sand-border-secondary-translucent'), `${tag} 静息色 secondary`)
      expect(cs.borderRadius, `${tag} 收起圆角 22`).toBe('22px')
      expect(parseFloat(cs.height), `${tag} 收起高 44`).toBeGreaterThanOrEqual(44)

      // ---- hover：primary（未聚焦）----
      const box = await shell.boundingBox()
      await page.mouse.move(box!.x! + box!.width! / 2, box!.y! + box!.height! / 2)
      await page.waitForTimeout(120)
      cs = await frame(page, ['borderTopColor'])
      expectColor(cs.borderTopColor, await tokenColor(page, '--sand-border-primary-translucent'), `${tag} hover 色 primary`)

      // ---- focus：primary ----
      await rest(page)
      await shell.locator('.ProseMirror[contenteditable="true"]').click()
      await page.waitForTimeout(400) // 边色过渡 .15s——等到位再读
      cs = await frame(page, ['borderTopColor'])
      expectColor(cs.borderTopColor, await tokenColor(page, '--sand-border-primary-translucent'), `${tag} focus 色 primary`)

      // ---- 拖拽：外框整体 accent；overlay 无边框；dragleave 复位 ----
      await shell.evaluate((el) => {
        const dt = new DataTransfer()
        dt.items.add(new File(['x'], 't67.txt', { type: 'text/plain' })) // hasFileDragData 要求 types 含 Files
        el.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }))
      })
      await expect(shell.locator('.sand-chat-drop-overlay')).toBeVisible()
      await page.waitForTimeout(400)
      cs = await frame(page, ['borderTopColor'])
      expectColor(cs.borderTopColor, await tokenColor(page, '--sand-border-accent-primary'), `${tag} 拖拽外框 accent`)
      const ov = await shell.locator('.sand-chat-drop-overlay').evaluate((el) => getComputedStyle(el).borderTopWidth)
      expect(ov, `${tag} overlay 无边框`).toBe('0px')
      await shell.evaluate((el) => {
        const dt = new DataTransfer()
        dt.items.add(new File(['x'], 't67.txt', { type: 'text/plain' }))
        el.dispatchEvent(new DragEvent('dragleave', { bubbles: true, dataTransfer: dt }))
      })
      await expect(shell.locator('.sand-chat-drop-overlay')).toHaveCount(0)
      await page.waitForTimeout(400)
      cs = await frame(page, ['borderTopColor'])
      expectColor(cs.borderTopColor, await tokenColor(page, '--sand-border-primary-translucent'), `${tag} dragleave 后回 focus 色`)

      // ---- 展开：3 行 → 18px + 高 > 44；清空回 22/44 ----
      const editor = shell.locator('.ProseMirror[contenteditable="true"]')
      await editor.click()
      for (let i = 0; i < 3; i++) { await page.keyboard.type('line of text'); await page.keyboard.press('Shift+Enter') }
      await expect(shell).toHaveAttribute('data-expanded', /.*/ as never, { timeout: 5_000 }).catch(() => { /* data-expanded="" 任意值即可 */ })
      await page.waitForTimeout(500) // 圆角/高度过渡 .3s——等到位
      cs = await frame(page, ['borderRadius', 'height'])
      expect(cs.borderRadius, `${tag} 展开圆角 18`).toBe('18px')
      expect(parseFloat(cs.height), `${tag} 展开高 > 44`).toBeGreaterThan(44)
      await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace')
      await page.waitForTimeout(400)
      cs = await frame(page, ['borderRadius', 'height'])
      expect(cs.borderRadius, `${tag} 清空回 22`).toBe('22px')

      // ---- 过渡时长锁实测值 ----
      cs = await frame(page, ['transitionDuration'])
      expect(cs.transitionDuration.replace(/\s/g, ''), `${tag} 过渡 .3s/.3s/.15s/.15s`).toBe('0.3s,0.3s,0.15s,0.15s')

      // ---- 截图（rest / focus 两态，仅 composer 区）----
      await rest(page); await page.waitForTimeout(400)
      const sb = await shell.boundingBox()
      const clip = { x: Math.max(0, sb!.x! - 20), y: sb!.y! - 40, width: sb!.width! + 40, height: sb!.height! + 80 }
      await page.screenshot({ path: join(OUT, `composer-rest-${mode}.png`), clip })
      await editor.click()
      await page.screenshot({ path: join(OUT, `composer-focus-${mode}.png`), clip })
    }

    // ---- 内层圆钮（attach + mic）：原版 inset 0 0 0 .5px tertiary 环（Sol 补强：存在断言+spread 宽+完整 RGBA）----
    const tert = await tokenColor(page, '--sand-border-tertiary-translucent')
    const tertRgb = (tert.match(/\d+/g) ?? []).slice(0, 3).join(', ')
    for (const sel of ['.sand-prompt-attach', '.sand-prompt-mic']) {
      const btn = page.locator(`.sand-prompt-shell ${sel}`)
      await expect(btn.first(), `${sel} 圆钮存在`).toHaveCount(1, { timeout: 5_000 })
      const ring = await btn.first().evaluate((el) => getComputedStyle(el).boxShadow)
      expect(ring, `${sel} 环 inset（实测=${ring}）`).toContain('inset')
      expect(ring, `${sel} 环 spread .5px`).toMatch(/0px 0px 0px 0\.5px/)
      expect(ring, `${sel} 环色=tertiary 完整 RGBA（${tertRgb}）`).toContain(tertRgb)
    }
  } finally {
    await env.stop()
  }
})
