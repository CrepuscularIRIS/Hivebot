// T83 二批（Sol 审后收窄）：状态行入场=bubble scale .92 fade .18s backwards（原版活动标记）；
// 消息行入场暂不挂载（last-child 近似回归撤——三批精确挂载）；旧行不重播=回归断言。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('T83b：状态行入场（bubble）+旧行不重播+reduced', async () => {
  test.setTimeout(240_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t83b-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    rt.writeScriptCalls(sid!, [textCall(['回复到了'])])
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await editor.click()
    await page.keyboard.type('问', { delay: 3 })
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '回复到了' })).toBeVisible({ timeout: 60_000 })
    // ① 状态行在（活动期间）+入场动画（bubble 版）
    const status = page.locator('.sand-status-line').first()
    await expect(status).toBeVisible({ timeout: 15_000 })
    const anim = await status.evaluate((el) => { const s = getComputedStyle(el); return { name: s.animationName, fill: s.animationFillMode, dur: s.animationDuration } })
    expect(anim.name, '状态行 bubble 入场').toContain('t83-status-in')
    expect(anim.dur, '.18s（原版活动标记）').toBe('0.18s')
    expect(anim.fill, 'backwards（不留终态，不压退场）').toBe('backwards')
    // ② 退场不被压（backwards 不留终态）→ 状态行最终正常卸载（退场流程走完）
    await expect(page.locator('.sand-status-line')).toHaveCount(0, { timeout: 5_000 })
    // ③ 旧行不重播（撤 last-child 后消息行动画恒 none）
    const lastRow = page.locator('.sand-transcript-row').last()
    const rowAnim = await lastRow.evaluate((el) => getComputedStyle(el).animationName)
    expect(rowAnim, '消息行无入场动画（三批前）').toBe('none')
    // ④ reduced：独立回合（状态行退场后卸载——不能在旧引用上验）
    await page.emulateMedia({ reducedMotion: 'reduce' })
    rt.writeScriptCalls(sid!, [textCall(['占位']), textCall(['第二条回复'])])
    await editor.click()
    await page.keyboard.type('再问', { delay: 3 })
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '第二条回复' })).toBeVisible({ timeout: 60_000 })
    // T76 并入（二批遗留）：去 if 包裹——状态行必在（fake 卡长任务保 running；断言硬验）
    const status2 = page.locator('.sand-status-line').first()
    await expect(status2, 'reduce 下状态行在（回合进行中）').toBeVisible({ timeout: 15_000 })
    await expect.poll(async () => status2.evaluate((el) => getComputedStyle(el).animationName), { timeout: 8_000 }).toContain('t83-status-fade-reduced')
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
