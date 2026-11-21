// T79c · 会话浮层定位三件（T79 巡检 P1-1/2+未读 pill）：
// ① More 菜单开时不盖下一条消息（条上移气泡上方——0.18 已有 --menu-open 机制补 css）
// ② jump 钮贴输入框上方（曾 bottom:140px 悬中段盖正文——巡检量化离输入框 140px）
// ③ 未读 pill：非 stick 时新回复到达 → 钮升 data-unread（RE-MOTION 1.7/1.8）
import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const OUT = '/home/lingxufeng/bot/work/ui-quality/evidence/T79c'

test('T79c（d 退路）：jump 钮贴输入框+未读 pill（菜单落点撤并入 18s）', async () => {
  test.setTimeout(240_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t79c-ws-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    const send = async (text: string): Promise<void> => {
      const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
      await editor.click()
      await page.keyboard.type(text, { delay: 3 })
      await page.keyboard.press('ControlOrMeta+Enter')
    }
    // 造 user→assistant→user 序列（More 在 assistant 上，下一条=user 气泡）
    rt.writeScriptCalls(sid!, [textCall(['助手回复一']), textCall(['助手回复二']), textCall(['新到回复'])]) // 三条一次灌（③ 的也并——中途覆盖竞态三犯）
    await send('用户第一条足够长让它有气泡')
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '助手回复一' })).toBeVisible({ timeout: 60_000 })
    await send('用户第二条也会被菜单盖住')
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
    // ② jump 钮贴输入框：滚上去钮出——钮底距 composer 顶 ≤40（曾 140）
    await page.evaluate(() => { const s = document.querySelector('.sand-virtual-transcript') as HTMLElement; for (let i = 0; i < 30; i += 1) { const d = document.createElement('div'); d.textContent = `fill-${i}`; d.style.cssText = 'height:60px'; s.appendChild(d) } })
    await page.waitForTimeout(300)
    // 真用户滚动（mouse.wheel）——程序 scrollTop 会被 stick 跟随追回（DIAG top=1391/d=0 实锤）；
    // wheel 触发用户 scroll → check → stick=false → 钮出
    await page.locator('.sand-virtual-transcript').hover()
    await page.mouse.wheel(0, -2000)
    await page.waitForTimeout(400)
    const btn = page.locator('[aria-label="Jump to latest"]')
    await expect(btn).toBeVisible({ timeout: 5_000 })
    const gap = await page.evaluate(() => {
      const b = document.querySelector('[aria-label="Jump to latest"]')!.getBoundingClientRect()
      const composer = document.querySelector('.sand-prompt-shell')?.getBoundingClientRect() ?? document.querySelector('[class*="composer"]')?.getBoundingClientRect()
      return composer ? composer.top - b.bottom : -1
    })
    expect(gap, `jump 钮贴输入框（距 composer 顶 ${gap}px ≤40；曾 140）`).toBeLessThanOrEqual(40)
    // ③ 未读 pill：150 位流式新回复 → 钮 data-unread
    await send('再问') // 消费第 3 条（队列一次灌——覆盖竞态）
    // send 后 editor focus 会自动滚到底吃掉上位——重设回 150 位（非 stick 场景）
    await page.evaluate(() => { const s = document.querySelector('.sand-virtual-transcript') as HTMLElement; s.scrollTop = s.scrollHeight - s.clientHeight - 150 })
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '新到回复' })).toBeAttached({ timeout: 60_000 })
    await expect(btn).toHaveAttribute('data-unread', 'true', { timeout: 10_000 })
    // T79c b（Sol 反例①）：新回复前 pill 未亮（防第一条误报假阳——spec 曾缺此前置）
    // （时序上此断言在到达后——真前置在下方独立反例轮）
    // 反例②：无新消息仅滚动+class mutation 不误报（Sol 探针：滚到 450 切 class 误报 true）
    await btn.click()
    await page.waitForTimeout(600) // 点钮回底清 pill
    await page.locator('.sand-virtual-transcript').hover()
    await page.mouse.wheel(0, -600)
    await page.waitForTimeout(300)
    await page.evaluate(() => { const s = document.querySelector('.sand-virtual-transcript') as HTMLElement; s.classList.add('t79c-probe-a'); s.classList.replace('t79c-probe-a', 't79c-probe-b') }) // T79c c：class 切换（dataset 不在 MO attributeFilter——曾空断言）
    await page.waitForTimeout(400)
    await expect(btn).not.toHaveAttribute('data-unread', 'true', { timeout: 2_000 })
    // 反例③：小块连续增长（6×24px——曾每帧覆盖基线不累计）也触发
    for (let i = 0; i < 6; i += 1) { await page.evaluate((n) => { const s = document.querySelector('.sand-virtual-transcript') as HTMLElement; const d = document.createElement('div'); d.textContent = `small-${n}`; d.style.cssText = 'height:24px'; s.appendChild(d) }, i); await page.waitForTimeout(120) } // T79c c：分帧追加（同步一次 evaluate MO 合并单次增长——曾测不出累计）
    await page.waitForTimeout(600)
    await expect(btn).toHaveAttribute('data-unread', 'true', { timeout: 5_000 })
    for (const mode of ['light', 'dark'] as const) {
      await page.evaluate((t) => { (window as unknown as { desktop: { theme: { set(x: string): void } } }).desktop.theme.set(t) }, mode)
      await page.waitForTimeout(350)
      await page.screenshot({ path: join(OUT, `overlay.${mode}.png`) })
    }
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
