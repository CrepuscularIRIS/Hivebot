// T88f · 状态行接 T88 引擎（覆盖版 agent-avatar——曾 import 上游 0.18 旧版画旧吉祥物）
import { expect, test } from 'playwright/test'
import { launchProduct } from '../support/ui.ts'

test('T88f：状态行 avatar=引擎 svg（span 容器非 canvas）+agentId 与侧栏一致', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct({})
  try {
    const { page } = env
    await page.waitForSelector('.sand-agent-item', { timeout: 60_000 })
    // 触发回合让状态行出现（fake 回复期间）
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await editor.click()
    await page.keyboard.type('t88f 问', { delay: 3 })
    await page.keyboard.press('ControlOrMeta+Enter')
    const status = page.locator('.sand-status-line')
    await expect(status).toBeVisible({ timeout: 30_000 })
    const mark = status.locator('.sand-grok-bot-mark')
    await expect(mark).toBeVisible({ timeout: 10_000 })
    const out = await mark.evaluate((el) => {
      const svg = el.querySelector('svg')
      const sidebar = document.querySelector('.sand-agent-item .sand-grok-bot-mark') as HTMLElement | null
      return { inCanvas: svg?.closest('canvas') != null, hasSvg: svg != null, svgW: svg?.getBoundingClientRect().width ?? 0, state: (el as HTMLElement).dataset.grokState, color: (el as HTMLElement).dataset.avatarColor, sidebarColor: sidebar?.dataset.avatarColor ?? 'none', svgParentIsMark: svg?.parentElement === el, engineSpan: svg?.parentElement?.tagName === 'SPAN' && svg?.parentElement !== el }
    })
    expect(out.hasSvg, '引擎 svg 建立（T88 覆盖版）').toBe(true)
    expect(out.inCanvas, 'svg 不在 canvas 内（span 挂载）').toBe(false)
    expect(out.svgW, 'svg 有布局').toBeGreaterThan(0)
    expect(out.state, 'state 有值（覆盖版 data-grok-state——旧版 undefined 此断红）').toBeDefined()
    expect(out.state, '运行态非 idle（thinking/working 依截取刻——经理口径修）').not.toBe('idle')
    expect(out.svgParentIsMark, 'svg 父非 mark 本身（覆盖版有内层 span 容器——旧版 svg 直挂 mark）').toBe(false)
    expect(out.color, `color 与侧栏一致（${out.color} vs ${out.sidebarColor}）`).toBe(out.sidebarColor)
  } finally {
    await env.stop()
  }
})
