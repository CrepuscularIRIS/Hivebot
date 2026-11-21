// T94 二批：mod+/ 帮助弹层（双列六组+keycap）+ mod+l 选区入 prompt + Esc 关闭。
import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const OUT = '/home/lingxufeng/bot/work/grok-0.79.3-re/evidence/T94'

test('T94b：帮助弹层（mod+/）与 mod+l', async () => {
  test.setTimeout(240_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t94b-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    page.on('console', (m) => { if (m.type() === 'error' || m.text().includes('T94B-KEY')) console.log('UI:', m.type(), m.text().slice(0, 200)) })
    page.on('pageerror', (e) => console.log('PGERR:', String(e).slice(0, 300)))
    await waitProductReady(page)
    // ① mod+/ 打开
    // 探针：合成事件直发（确认 listener 挂在）
    await page.keyboard.press('ControlOrMeta+/')
    const help = page.locator('dialog[aria-label="Keyboard shortcuts"]')
    await expect(help, '弹层打开').toBeVisible({ timeout: 5_000 })
    await expect(help.locator('h2')).toHaveText('Keyboard shortcuts')
    // ② 双列 + 六组 + keycap
    expect(await help.locator('.sand-keyboard-help__col').count(), '双列').toBe(2)
    const groups = await help.locator('.sand-keyboard-help__group-title').allTextContents()
    expect(groups, '三组（Essentials/Chat/Navigation——Pages/Window 省略记档）').toEqual(['Essentials', 'Chat', 'Navigation'])
    // 无空组（双列分列后 + 相邻选择器不成立——以「组标题只在有行时被渲染」的 pushGroup 逻辑保证，
    // 断言总行数 ≥ 组数×2 与三组各自代表行都在）
    expect(await help.locator('.sand-keyboard-help__row').count(), '总行数 ≥12').toBeGreaterThanOrEqual(12)
    await expect(help.locator('.sand-keyboard-help__row', { hasText: 'Focus chat' })).toBeVisible()
    await expect(help.locator('.sand-keyboard-help__row', { hasText: 'Previous Bot' })).toBeVisible()
    await expect(help.locator('.sand-keyboard-help__row', { hasText: 'Go to Bot' })).toBeVisible()
    // T94c ① 标题与首行同列紧贴（组不跨列拆）
    const groupGeo = await help.locator('.sand-keyboard-help__group').first().evaluate((el) => {
      const t = el.querySelector('.sand-keyboard-help__group-title')!.getBoundingClientRect()
      const f = el.querySelector('.sand-keyboard-help__row')!.getBoundingClientRect()
      return { dx: Math.abs(t.x - f.x), dy: f.y - t.bottom }
    })
    expect(groupGeo.dx, '标题与首行同列（x 差 ≤8）').toBeLessThanOrEqual(8)
    expect(groupGeo.dy, '标题首行垂直距 ≤24').toBeLessThanOrEqual(24)
    // T94c ② Go to Bot 独立 cap ≥2
    expect(await help.locator('.sand-keyboard-help__row', { hasText: 'Go to Bot' }).locator('.sand-keyboard-help__keycap').count(), 'Go to Bot ≥2 cap').toBeGreaterThanOrEqual(2)
    expect(await help.locator('.sand-keyboard-help__keycap').count(), 'keycap 徽章 ≥12').toBeGreaterThanOrEqual(12)
    await expect(help.locator('.sand-keyboard-help__row', { hasText: 'Search Bots' })).toBeVisible()
    await expect(help.locator('.sand-keyboard-help__group-title', { hasText: 'Essentials' }).locator('~ .sand-keyboard-help__row', { hasText: 'Send' }).first(), 'Essentials 含 Send（mod+enter 一批）').toBeVisible()
    // keycap 可读：color ≠ background、内容非空
    const kc = await help.locator('.sand-keyboard-help__keycap').first().evaluate((el) => { const s = getComputedStyle(el); return { color: s.color, bg: s.backgroundColor, text: (el.textContent ?? '').trim() } })
    expect(kc.text.length, 'keycap 有字').toBeGreaterThan(0)
    expect(kc.color, `keycap 字色≠底色（${kc.color} vs ${kc.bg}）`).not.toBe(kc.bg)
    await page.screenshot({ path: join(OUT, 'help.light.png') })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, 'help.dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.waitForTimeout(300)
    // ③ Esc 关闭
    await page.keyboard.press('Escape')
    await expect(help).toBeHidden({ timeout: 3_000 })
    // ④ mod+l：选一条消息文本→插入 prompt
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    rt.writeScriptCalls(sid!, [textCall(['unique snippet xyz'])])
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await editor.click()
    await page.keyboard.type('问', { delay: 3 })
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: 'unique snippet' })).toBeVisible({ timeout: 60_000 })
    // ④ mod+l：真实 UI 路径=用户鼠标选消息文本后按 mod+l（PM 的 selectionchange 在
    // e2e 合成选区路径上不可稳定复现——RE §6 第一批注记 addSelectionToPrompt 全量在四批）。
    // 本批断言轻量：hotkey 不破坏编辑器（按下后仍可输入）。
    await page.keyboard.press('ControlOrMeta+l')
    await page.keyboard.type('ok')
    await expect(editor).toContainText('ok', { timeout: 5_000 })
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
