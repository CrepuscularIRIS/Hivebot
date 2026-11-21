// T85c：滚动跟随（经理重规划版）——断言全部在出问题的状态上。
// ① 6 条长回复后直接断言到底（不补底）+无钮 ②钮在对话列居中（距底~300 量） ③距底 150 流式不拽回
import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const OUT = '/home/lingxufeng/bot/work/grok-0.79.3-re/evidence/T85'
const scrollOf = (page: import('playwright').Page): Promise<{ top: number; h: number; ch: number }> =>
  page.evaluate(() => { const s = document.querySelector('.sand-virtual-transcript') as HTMLElement; return { top: s.scrollTop, h: s.scrollHeight, ch: s.clientHeight } })

test('T85c：到底/列居中/不拽回', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t85c-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    page.on('console', (m) => { if (m.text().includes('T85-UC')) console.log('UIC:', m.text()) })
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    const send = async (n: string): Promise<void> => { await editor.click(); await page.keyboard.type(n, { delay: 3 }); await page.keyboard.press('ControlOrMeta+Enter') }
    const LONG = '长内容测试。'.repeat(60)
    // 探针：独立 RO 记录 scroller 高度与 scrollTop 序列
    await page.evaluate(() => {
      const log: string[] = []
      ;(window as unknown as { __t85p?: string[] }).__t85p = log
      const s = document.querySelector('.sand-virtual-transcript') as HTMLElement
      if (s === null) return
      new ResizeObserver(() => log.push(`h=${s.scrollHeight} top=${s.scrollTop.toFixed(0)} d=${(s.scrollHeight - s.scrollTop - s.clientHeight).toFixed(0)}`)).observe(s)
    })
    rt.writeScriptCalls(sid!, Array.from({ length: 6 }, () => textCall([LONG])))
    const nums = ['一', '二', '三', '四', '五', '六']
    for (let i = 0; i < nums.length; i++) {
      await send(nums[i]!)
      await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '长内容' }).nth(i), `第 ${i + 1} 条`).toBeVisible({ timeout: 60_000 })
      await page.waitForTimeout(200)
    }
    // ① 6 条后直接断言：到底（<2）且无钮（不补底不拉底）
    await page.waitForTimeout(4_000) // T85c：慢收敛实证（1.5s+5s poll 不够；产品侧最终收敛——L71 过实证）
    console.log('T85-SEQ', JSON.stringify(await page.evaluate(() => {
      const out: string[] = []
      for (const el of document.querySelectorAll('*')) {
        const h = el as HTMLElement
        if (h.scrollHeight > h.clientHeight + 50 && h.clientHeight > 100) out.push(`${h.tagName}.${(h.className || '').toString().slice(0, 40)} sh=${h.scrollHeight} ch=${h.clientHeight} st=${h.scrollTop.toFixed(0)}`)
      }
      return out.slice(0, 5)
    })))
    await expect.poll(async () => { const gg = await scrollOf(page); return gg.h - gg.top - gg.ch }, { timeout: 10_000 }).toBeLessThan(2)
    const gg = await scrollOf(page) // T85c b 修（Sol M2）：probe 补底段删——无钮断言前无人工滚动
    expect(gg.h - gg.top - gg.ch, `6 条后自动到底（实际距底 ${gg.h - gg.top - gg.ch}）`).toBeLessThan(2)
    const btn = page.locator('button[aria-label="Jump to latest"]')
    expect(await btn.count(), '到底无钮').toBe(0)
    // ② 滚到距底~300（钮出）——列居中断言
    await page.evaluate(() => { const s = document.querySelector('.sand-virtual-transcript') as HTMLElement; s.scrollTop = s.scrollHeight - s.clientHeight - 300 })
    await expect(btn).toBeVisible({ timeout: 5_000 })
    const cg = await btn.evaluate((el) => { const b = el.getBoundingClientRect(); const sc = document.querySelector('.sand-virtual-transcript')!.getBoundingClientRect(); return { bx: b.x + b.width / 2, cx: sc.x + sc.width / 2 } })
    expect(Math.abs(cg.bx - cg.cx), `钮列居中（钮心 ${cg.bx.toFixed(0)} vs 列心 ${cg.cx.toFixed(0)}）±8）`).toBeLessThanOrEqual(8)
    await page.screenshot({ path: join(OUT, 'jump-btn.light.png') })
    // ③ 距底 150：流式继续——scrollTop 不被拽回
    await page.evaluate(() => { const s = document.querySelector('.sand-virtual-transcript') as HTMLElement; s.scrollTop = s.scrollHeight - s.clientHeight - 150 })
    const topBefore = (await scrollOf(page)).top
    rt.writeScriptCalls(sid!, Array.from({ length: 6 }, () => textCall(['占位'])).concat([textCall(['第七条'])]))
    await send('七')
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '第七条' })).toBeVisible({ timeout: 120_000 })
    const topAfter = (await scrollOf(page)).top
    expect(topAfter, `距底 150 流式不拽回（前 ${topBefore.toFixed(0)} 后 ${topAfter.toFixed(0)}）`).toBeLessThan(topBefore + 100)
    // ④ T85d：点钮回底（覆盖钮→stick 复活链）；分块流式护栏拆独立 test（下方）
    await page.locator('.sand-virtual-transcript').hover()
    await page.mouse.wheel(0, -350)
    await page.locator('[aria-label="Jump to latest"]').click()
    await expect.poll(async () => (await scrollOf(page)).h - (await scrollOf(page)).top - (await scrollOf(page)).ch, { timeout: 3_000 }).toBeLessThan(2)
  } finally {
    await shell.stop()
    await rt.stop()
  }
})


// T85d：分块流式护栏（Sol M1 触发面——单条 16 块持续长高不杀 stick；点钮复活后 12 块仍跟随）
test('T85d：分块流式不杀跟随（16 块+点钮复活+12 块）', async () => {
  test.setTimeout(240_000)
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t85d-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    const send = async (t: string) => { await editor.click(); await editor.fill(t); await page.keyboard.press('ControlOrMeta+Enter') }
    const read = () => page.evaluate(() => { const s = document.querySelector('.sand-virtual-transcript') as HTMLElement; return { d: s.scrollHeight - s.scrollTop - s.clientHeight } })
    rt.writeScriptCalls(sid!, [textCall(Array.from({ length: 16 }, (_, i) => `块${i}。` + '长内容测试。'.repeat(120)), { paceMs: 150 }), textCall(Array.from({ length: 12 }, (_, i) => `追${i}。` + '长内容测试。'.repeat(120)), { paceMs: 150 })]) // T85d：两条一次灌（中途覆盖 default.json 有消费竞态——第二轮 60s 等不到实锤）
    await send('分块流')
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '块15。' }), '16 块到齐').toBeAttached({ timeout: 60_000 })
    await page.waitForTimeout(1_500)
    expect((await read()).d, `16 块分块流式跟随（实际距底 ${(await read()).d}）`).toBeLessThan(2)
    await page.locator('.sand-virtual-transcript').hover()
    await page.mouse.wheel(0, -350)
    await page.locator('[aria-label="Jump to latest"]').click()
    await expect.poll(async () => (await read()).d, { timeout: 3_000 }).toBeLessThan(2)
    await send('再流')
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '追11。' }), '追流 12 块到齐').toBeAttached({ timeout: 60_000 })
    await page.waitForTimeout(1_500)
    expect((await read()).d, '点钮复活后 12 块仍跟随').toBeLessThan(2)
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
