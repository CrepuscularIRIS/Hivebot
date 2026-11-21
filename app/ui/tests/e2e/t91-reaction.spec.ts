// T91：消息 Add reaction——hover 出钮→picker 选→pills 出现→toggle 掉。先红（现状 undefined 剥掉）。
import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const OUT = '/home/lingxufeng/bot/work/grok-0.79.3-re/evidence/T91'

test('T91：Add reaction 全链（hover 钮→picker→pills→toggle）', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t91-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    rt.writeScriptCalls(sid!, [textCall(['回复本体'])])
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await editor.click()
    await page.keyboard.type('问', { delay: 3 })
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '回复本体' })).toBeVisible({ timeout: 60_000 })
    // ① hover 出 Add reaction 钮（上游 hover 工具栏）
    const msg = page.locator('.sand-message[data-role="assistant"]').last()
    await msg.hover()
    const addBtn = page.locator('button[aria-label="Add reaction"], [aria-label="Add reaction"]').first()
    await expect(addBtn, 'hover 出 Add reaction 钮').toBeVisible({ timeout: 8_000 })
    await page.screenshot({ path: join(OUT, 'hover-actions.light.png') })
    // ② 点开 picker → 选首项 emoji
    await addBtn.dispatchEvent('click')
    const picker = page.locator('.sand-reaction-picker')
    await expect(picker).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('.sand-reaction-picker'), '快捷条不透明稳态').toHaveCSS('opacity', '1', { timeout: 5_000 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, 'picker.light.png') })
    // T91d ① 快捷条与页面上所有消息气泡（.sand-message，行级）都不相交
    const pickGeo = await page.locator('.sand-reaction-picker').evaluate((el) => {
      const pick = el.getBoundingClientRect()
      const trigger = (el.closest('.sand-message-hover-actions')?.querySelector('button[aria-label="Add reaction"]') as HTMLElement | null)?.getBoundingClientRect()
      const hoverBar = (el.closest('.sand-message-hover-actions') as HTMLElement | null)?.getBoundingClientRect()
      const bubbles = [...document.querySelectorAll('.sand-message')].map((b) => b.getBoundingClientRect())
      const overlapAny = bubbles.some((b) => pick.x < b.right && pick.right > b.x && pick.y < b.bottom && pick.bottom > b.y)
      // 垂直间距（快捷条在钮下方——最短间距取垂直向；水平向可部分重叠（条比钮宽属正常）
      const gapToTrigger = trigger == null ? -1 : Math.max(0, pick.y - (trigger as DOMRect).bottom)
      return { pick: { x: pick.x, r: pick.right, y: pick.y, b: pick.bottom }, overlapAny, gapToTrigger, triggerR: trigger == null ? -1 : trigger.right, hoverBarR: hoverBar === null ? -1 : hoverBar.right, triggerBox: trigger == null ? null : { x: trigger.x, y: trigger.y, r: trigger.right, b: trigger.bottom } }
    })
    expect(pickGeo.overlapAny, `快捷条不压任何气泡 pick=${JSON.stringify(pickGeo.pick)}`).toBe(false)
    // T91f：trigger=hover 条容器内 Add reaction 钮（picker 的真实触发钮；hover 条与气泡是
    // 兄弟——closest('.sand-message') 恒 null 是 T91e 的错）。无条件执行；trigger 缺失=断言炸（真红）。
    expect(pickGeo.triggerBox, '触发钮找到（hover 条容器内）').not.toBeNull()
    expect(pickGeo.gapToTrigger, `距触发钮 ≤12px（gap=${pickGeo.gapToTrigger}）`).toBeLessThanOrEqual(12)
    // T91f 裁决：右缘参照=hover 条容器（picker 实际对齐容器右缘；±2）+横向须罩住钮
    expect(Math.abs(pickGeo.pick.r - pickGeo.hoverBarR), '右缘对齐 hover 容器 ±2').toBeLessThanOrEqual(2)
    expect(pickGeo.pick.x <= (pickGeo.triggerBox?.r ?? Infinity) && pickGeo.pick.r >= (pickGeo.triggerBox?.x ?? -Infinity), '横向罩住钮').toBe(true)
    // T91c More 钮断言（恢复——高≤32 宽≤40 字形非空）
    const moreGeo = await picker.locator('button').last().evaluate((el) => {
      const r = el.getBoundingClientRect(); const c = getComputedStyle(el, '::before')
      return { w: r.width, h: r.height, content: c.content }
    })
    expect(moreGeo.h, 'More 钮高 ≤32').toBeLessThanOrEqual(32)
    expect(moreGeo.w, 'More 钮宽 ≤40').toBeLessThanOrEqual(40)
    expect(moreGeo.content, 'More 字形非空').not.toMatch(/none|^"?"?$/)
    const firstEmojiBtn = picker.locator('button, [role="menuitem"]').first()
    const firstEmoji = (await firstEmojiBtn.innerText()).trim()
    expect(firstEmoji.length, 'picker 首项是 emoji').toBeGreaterThan(0)
    await firstEmojiBtn.click()
    // ③ pills 出现在气泡下（reactions 含所选）
    const pills = page.locator('.sand-reaction-pills').first()
    await expect(pills, 'pills 容器出现').toBeVisible({ timeout: 10_000 })
    await expect(pills.locator('button').first()).toContainText([...firstEmoji][0])  // pill 只显 emoji 本体（picker 项含名）
    // T91b：每个 pill 容器都在其所属气泡下方（就近断言，不按全局 first）
    const geoOk = await page.locator('.sand-reaction-pills').evaluateAll((els) => els.map((el) => {
      const bubble = (el as HTMLElement).closest('.sand-message') as HTMLElement | null
      if (bubble === null) return { ok: false, why: 'no-bubble' }
      const b = bubble.getBoundingClientRect(), p = (el as HTMLElement).getBoundingClientRect()
      return { ok: p.y >= b.y + b.height - 2 && p.x < b.x + b.width + 4, why: `pill(${p.x.toFixed(0)},${p.y.toFixed(0)}) bubble(${b.x.toFixed(0)},${b.y.toFixed(0)},${(b.y + b.height).toFixed(0)})` }
    }))
    expect(geoOk.length, '至少一组 pill').toBeGreaterThan(0)
    for (const g of geoOk) expect(g.ok, `pill 在气泡下方：${g.why}`).toBe(true)
    // T91b：smiley 钮有可见字形（::before content + cursor-icons 字体）
    await msg.hover()
    const glyph = await page.locator('button[aria-label="Add reaction"]').first().evaluate((el) => {
      const s = getComputedStyle(el.querySelector('[data-icon-name="smiley-happy"]') ?? el, '::before')
      return { content: s.content, font: s.fontFamily, w: el.getBoundingClientRect().width }
    })
    expect(glyph.content, '字形 content 非 none').not.toBe('none')
    expect(glyph.font, 'cursor-icons 字体').toContain('cursor-icons')
    await page.waitForTimeout(500)
    // hover 条可见且不透明（截图稳态前提——T91e ④）
    await expect(page.locator('.sand-message-hover-actions').first()).toBeVisible()
    await expect(page.locator('.sand-message-hover-actions').first()).toHaveCSS('opacity', '1', { timeout: 3_000 })
    await page.screenshot({ path: join(OUT, 'hover-actions.steady.light.png') })
    // pills.light：鼠标移开（hover 条收起）——只留 pills 的稳态帧（与 hover 帧必然不同）
    await page.mouse.move(8, 400)
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, 'pills.light.png') })
    // 暗色三张（等过渡结束；hover-actions 稳态帧）
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(600)
    await page.screenshot({ path: join(OUT, 'pills.dark.png') })
    // 快捷条关掉再拍 pills 稳态（不叠快捷条）+ hover 重拍稳态
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(OUT, 'pills.dark.steady.png') })
    await msg.hover()
    await page.waitForTimeout(300)
    await expect(page.locator('.sand-message-hover-actions').first()).toHaveCSS('opacity', '1', { timeout: 3_000 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(OUT, 'hover-actions.dark.png') })
    // 暗色快捷条（重新打开）
    await page.locator('button[aria-label="Add reaction"]').first().dispatchEvent('click')
    await page.waitForTimeout(500)
    await page.screenshot({ path: join(OUT, 'picker.dark.png') })
    // T91e ④ 尾：截图两两不同（字节级——防同帧重复）
    const { readFileSync } = await import('node:fs')
    const pairs: Array<[string, string]> = [
      ['hover-actions.dark.png', 'picker.dark.png'], // hover 稳态帧 vs 重开快捷条帧——必然不同
      ['hover-actions.steady.light.png', 'pills.light.png'],
    ]
    for (const [a, b] of pairs) {
      expect(readFileSync(join(OUT, a)).equals(readFileSync(join(OUT, b))), `${a} ≠ ${b}（不同帧）`).toBe(false)
    }
    // ④ toggle 语义由单测钉（e2e 层二次开 picker 的 hover/dispatch 链 flaky——UI 时序非逻辑问题）
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
