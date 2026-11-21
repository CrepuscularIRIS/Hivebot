// T79a · notice/timeline-event 行时间戳脱锚修复（P0——T79 巡检新发现）：
// 0.18 树缺 0.78.1 原子规则（sand-3m8u43 right:0 / sand-v4fu3i opacity:var(--sand-ts-progress,0)
// / o5v014 line-height:1 / ss6m8b tabular-nums），行容器无 position:relative——时间戳
// 恒可见+落在 transcript 视口竖直中线（两条叠影 jump.dark.png 实锤）。
// 修法：p5-55 末段补原子值+行 relative（共享层 css，不逐调用方）。
import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const OUT = '/home/lingxufeng/bot/work/ui-quality/evidence/T79a'

const gated = (id: string, first: string): object => ({ chunks: [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: first },
  { type: 'text-delta', index: 0, text: '后续内容' },
  { type: 'block-end', index: 0, block: { type: 'text', text: `${first}完整` } },
  { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
  { type: 'finish', reason: { kind: 'stop' } },
], gateAfterChunk: 2, gateId: id, paceMs: 50 })

test('T79a：行时间戳不脱锚（静止不可见+贴行+不叠影+滚后跟行）', async () => {
  test.setTimeout(240_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t79a-ws-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    const send = async (text: string): Promise<void> => {
      const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
      await editor.click()
      await page.keyboard.type(text, { delay: 3 })
      await page.keyboard.press('ControlOrMeta+Enter')
    }
    // 两轮 supersede → 两条 stop/supersede notice 行（带行时间戳）
    rt.writeScriptCalls(sid!, [gated('t79a-g1', '第一条开头'), textCall(['第二条回复']), gated('t79a-g2', '第三条开头'), textCall(['第四条回复'])]) // 四条一次灌（中途覆盖 default.json 有消费竞态——T85d 同坑实锤）
    await send('一')
    await page.waitForTimeout(1_500) // turn1 流到 gate 卡住
    await send('二') // 顶掉 → supersede notice + 第二条回复
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '第二条回复' })).toBeVisible({ timeout: 60_000 })
    await send('三')
    await page.waitForTimeout(1_500)
    await send('四')
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '第四条回复' })).toBeVisible({ timeout: 60_000 })
    await page.waitForTimeout(800)
    // 鼠标移到 transcript 上（时间戳静止口径）
    await page.locator('.sand-virtual-transcript').hover()
    await page.waitForTimeout(300)
    const probe = () => page.evaluate(() => {
      const ts = Array.from(document.querySelectorAll<HTMLElement>('.sand-row-timestamp'))
      return ts.map((el) => {
        const row = el.closest('.sand-transcript-row') as HTMLElement | null
        const t = el.getBoundingClientRect(); const r = row?.getBoundingClientRect()
        return { opacity: getComputedStyle(el).opacity, top: t.top, bottom: t.bottom, rowTop: r?.top ?? NaN, rowBottom: r?.bottom ?? NaN, offsetParentIsRow: el.offsetParent === row, w: t.width, h: t.height }
      })
    })
    const rows = await probe()
    expect(rows.length, `至少 2 条带时间戳的行（实际 ${rows.length}）`).toBeGreaterThanOrEqual(2)
    for (const [i, r] of rows.entries()) {
      expect(r.opacity, `第 ${i} 条静止 opacity=0（0.78.1 --sand-ts-progress 默认 0）`).toBe('0')
      expect(r.top, `第 ${i} 条贴行（ts.top≥row.top−1）`).toBeGreaterThanOrEqual(r.rowTop - 1)
      expect(r.bottom, `第 ${i} 条贴行（ts.bottom≤row.bottom+1）`).toBeLessThanOrEqual(r.rowBottom + 1)
      expect(r.offsetParentIsRow, `第 ${i} 条定位基准=行`).toBe(true)
    }
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.top, `时间戳 ${i - 1}/${i} 不叠影`).toBeGreaterThanOrEqual(rows[i - 1]!.bottom - 1)
    }
    // 滚动 300px 后再断贴行（跟行不跟视口）——T79a b（Sol M2）：内容不够时 scrollTop 恒 0 假绿；
    // 先造长内容（inject 高行）+断实际位移>0，再断贴行
    await page.evaluate(() => { const s = document.querySelector('.sand-virtual-transcript') as HTMLElement; for (let i = 0; i < 30; i += 1) { const d = document.createElement('div'); d.textContent = `t79a-fill-${i}`; d.style.cssText = 'height:60px'; s.appendChild(d) } })
    await page.waitForTimeout(200)
    const scrollable = await page.evaluate(() => { const s = document.querySelector('.sand-virtual-transcript') as HTMLElement; return s.scrollHeight - s.clientHeight })
    expect(scrollable, `内容已可滚（余量 ${scrollable}）`).toBeGreaterThan(250)
    await page.evaluate(() => { const s = document.querySelector('.sand-virtual-transcript') as HTMLElement; s.scrollTop += 300 })
    await page.waitForTimeout(300)
    const moved = await page.evaluate(() => { const s = document.querySelector('.sand-virtual-transcript') as HTMLElement; return s.scrollTop })
    expect(moved, `真滚动了（scrollTop=${moved}——曾恒 0 假绿）`).toBeGreaterThan(250)
    const scrolled = await probe()
    expect(scrolled.length, '滚动后行数不减').toBeGreaterThanOrEqual(2)
    for (const [i, r] of scrolled.entries()) {
      expect(r.top, `滚后第 ${i} 条仍贴行`).toBeGreaterThanOrEqual(r.rowTop - 1)
      expect(r.bottom).toBeLessThanOrEqual(r.rowBottom + 1)
    }
    for (const mode of ['light', 'dark'] as const) {
      await page.evaluate((t) => { (window as unknown as { desktop: { theme: { set(x: string): void } } }).desktop.theme.set(t) }, mode)
      await page.waitForTimeout(350)
      await page.screenshot({ path: join(OUT, `notice-ts.${mode}.png`) })
    }
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
