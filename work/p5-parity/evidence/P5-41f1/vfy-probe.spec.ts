// VERIFIER PROBE (P5-41.f1 验收，非产品代码)：审批卡分段亲验 + 3 处改色现值核对。
// 跑在 /tmp/bot-vfy-p541f1 副本；证据写主仓 work/p5-parity/evidence/P5-41f1/。
import { expect, test, type Page } from 'playwright/test'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AUDIT, type Target } from '../support/contrast.ts'
import { bashCall, createBots, devState, finalAssistant, launchProduct, openBot, permissionDock, send, textCall, toolRows } from '../support/ui.ts'

const OUT = '/home/lingxufeng/bot/work/p5-parity/evidence/P5-41f1'
const findings: Array<[string, unknown]> = []

test('vfy：审批卡分段/关闭钮/复制钮/224px + 改色 3 项现值', async () => {
  test.setTimeout(180_000)
  const errors: string[] = []
  const env = await launchProduct()
  try {
    const { page, shell } = env
    page.on('pageerror', (e) => errors.push(String(e)))
    await (page.context() as unknown as { grantPermissions(p: string[]): Promise<void> }).grantPermissions(['clipboard-read', 'clipboard-write'])

    const [x] = await createBots(page, [{ title: 'VFY-X', preset: 'standard' }])
    await openBot(page, 'VFY-X')
    await expect.poll(async () => (await devState(page)).views[x!]?.cwd).toBeTruthy()
    const cwd = (await devState(page)).views[x!]!.cwd!
    const canary = join(cwd, 'canary-vfy-close')
    env.rt.writeScriptCalls(x!, [
      bashCall(`touch ${canary}`, 'call-r'), bashCall('echo vfy-short', 'call-s'),
      textCall(['完成。详见 [文档](https://example.com) 与 [另一链接](https://example.org)。']),
    ])

    await send(page, '请建 canary')
    const dock = permissionDock(page)
    await expect(dock).toBeVisible({ timeout: 20_000 })

    // ---- 分段结构 ----
    const titlebar = dock.locator('[data-pbots="ask-titlebar"]')
    await expect(titlebar).toBeVisible()
    await expect(titlebar.locator('.pb-ask__label')).toHaveText('Computer')
    const iconInfo = await titlebar.locator('.ui-icon').first().evaluate((el) => ({ name: el.getAttribute('data-icon-name'), glyph: (el.textContent ?? '').length }))
    findings.push(['titlebar.laptop-icon', iconInfo])
    const close = dock.locator('.pb-ask__close')
    await expect(close).toHaveAttribute('aria-label', 'Deny once')
    const code = dock.locator('pre[data-pbots="ask-command"]')
    await expect(code).toHaveText(`touch ${canary}`)
    const copy = dock.locator('[aria-label="Copy code"]')
    await expect(copy).toBeVisible()
    const cs = await code.evaluate((el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, color: c.color, font: c.fontFamily, border: c.borderTopWidth } })
    findings.push(['codeblock.computed', cs])

    // ---- 高度 224px（签收单 2.2：原版 252、我们 224）----
    const box = await dock.locator('[aria-label="Local tool permission"]').first().boundingBox()
    findings.push(['card.height', box?.height])
    await page.screenshot({ path: join(OUT, 'vfy-approval-card.light.png') })

    // ---- 复制钮：点击后剪贴板 == 命令全文 ----
    await copy.click()
    let clip: string | null = null
    try { clip = await page.evaluate(() => navigator.clipboard.readText()) } catch { clip = 'READ_FAILED' }
    if (clip === 'READ_FAILED' || clip == null || clip === '') {
      try { clip = await shell.app.evaluate(() => (require('electron') as typeof import('electron')).clipboard.readText()) } catch (e) { clip = `MAIN_FALLBACK_FAILED:${String(e)}` }
    }
    findings.push(['copy.clipboard', clip])
    findings.push(['copy.equals-command', clip === `touch ${canary}`])

    // ---- 关闭钮 = Deny once：作答 rejected、不执行、无副作用 ----
    await close.click()
    await expect(dock).toHaveCount(0, { timeout: 20_000 })
    await expect(toolRows(page).last()).toHaveAttribute('data-status', 'failed', { timeout: 20_000 })
    const fsState = { canaryExistsAfterClose: existsSync(canary) }
    findings.push(['close.canary-not-executed', !fsState.canaryExistsAfterClose])
    findings.push(['close.pageerrors', errors])

    // 第二次审批（短命令不换行）→ 卡高基线（签收单 2.2 申报 224）
    await send(page, '再来一次')
    await expect(dock).toBeVisible({ timeout: 20_000 })
    await expect(dock.locator('pre[data-pbots="ask-command"]')).toHaveText('echo vfy-short')
    const box2 = await dock.locator('[aria-label="Local tool permission"]').first().boundingBox()
    findings.push(['card.height-shortcmd', box2?.height])
    await page.screenshot({ path: join(OUT, 'vfy-approval-card-short.light.png') })
    await dock.locator('button', { hasText: 'Deny once' }).first().click()
    await expect(dock).toHaveCount(0, { timeout: 20_000 })

    // 第二轮文本带 markdown 链接 → 正文链接现值（P5-41.f1 改 1：text-primary）
    await expect(finalAssistant(page).last()).toContainText('文档', { timeout: 30_000 })
    const link = page.locator('.sand-message-prose a').first()
    await expect(link).toBeVisible()
    const linkAudit = await AUDIT(page, [{ id: '正文链接', sel: '.sand-message-prose a' }] as Target[])
    findings.push(['link.audit', linkAudit])

    // 搜索面板占位现值（改 2：text-tertiary；0.78.1 ref 3.96）
    await page.click('button[aria-label="Search"]')
    await expect(page.locator('.sand-command-palette')).toBeVisible()
    const palAudit = await AUDIT(page, [{ id: '搜索面板占位', sel: '.sand-command-palette > input', pseudo: '::placeholder' }] as Target[])
    findings.push(['palette-placeholder.audit', palAudit])
    await page.keyboard.press('Escape')

    findings.push(['final.pageerrors', errors])
    writeFileSync(join(OUT, 'vfy-findings.json'), JSON.stringify(Object.fromEntries(findings), null, 2))

    // 断言（让探针红绿可判）
    expect(Math.abs((box2?.height ?? 0) - 224)).toBeLessThanOrEqual(4)
    expect(clip).toBe(`touch ${canary}`)
    expect(fsState.canaryExistsAfterClose).toBe(false)
    expect(errors).toEqual([])
    expect(linkAudit[0]?.ratio).toBeCloseTo(14.76, 1)
    expect(palAudit[0]?.ratio).toBeCloseTo(3.96, 1)
  } finally {
    await env.stop()
  }
})
