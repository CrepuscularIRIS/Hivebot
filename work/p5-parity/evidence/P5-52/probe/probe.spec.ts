// P5-52 U4′ 验收员亲点探针：8 项抽验（23 条清单抽样），真实 Electron + fake-LLM 事件流。
// 判定法与 spec 相同：隐藏项看 DOM 缺席；活入口看点击后 DOM 变化 / shim RPC。
import { expect, test } from 'playwright/test'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { launchShell } from '/tmp/bot-wt/P5-52/app/ui/tests/support/launch.ts'
import { tmkdir } from '/tmp/bot-wt/P5-52/app/ui/tests/support/tmp-sweep.ts'
import { fakeOverlayPath, launchSdkRuntime } from '/tmp/bot-wt/P5-52/app/ui/tests/support/sdk-runtime.ts'
import { bashCall, textCall } from '/tmp/bot-wt/P5-52/app/ui/tests/support/ui.ts'

const UI_ROOT = '/tmp/bot-wt/P5-52/app/ui'
const GROK_ROOT = join(UI_ROOT, 'renderer-grok', '.build', 'frontend-shell')
const OUT = '/home/lingxufeng/bot/work/p5-parity/evidence/P5-52/probe-out'
const PRESETS_PATCH = join(UI_ROOT, '..', 'sdk', 'profile', 'patches', 'presets.yml')
const TURN_PROMPT = 'verifier probe turn'

test('U4′ 亲点 8 项', async () => {
  test.setTimeout(300_000)
  mkdirSync(OUT, { recursive: true })
  const ws = tmkdir('bot-p552-vfy-')
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, cwd: ws })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff, PBOTS_APP_ROOT: GROK_ROOT } })
  const page = shell.page
  const lines: string[] = []
  const log = (s: string) => { lines.push(s); console.log(s) }
  try {
    // 造一条有内容的会话（与 spec 同法）
    await expect(page.locator('.sand-agent-item')).toHaveCount(1, { timeout: 60_000 })
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    rt.writeScriptCalls(sid!, [bashCall('echo p552vfy', 'call-p552vfy'), textCall(['Done. Result:\n\n```js\nconsole.log(1)\n```'])])
    await page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]').click({ timeout: 20_000 })
    await page.keyboard.type(TURN_PROMPT, { delay: 5 })
    await page.click('button[aria-label="Send message"]')
    await page.locator('[aria-label="Local tool permissions"] button', { hasText: 'Allow once' }).click({ timeout: 30_000 })
    await expect(page.locator('.sand-virtual-transcript pre')).toHaveCount(1, { timeout: 30_000 })
    await rt.client.call('session/rename', { request: { sessionId: sid, title: 'P5-52 probe' } })
    await page.reload()
    await page.locator('.sand-agent-item', { hasText: 'P5-52 probe' }).click({ timeout: 60_000 })
    await expect(page.locator('.sand-virtual-transcript pre')).toHaveCount(1, { timeout: 30_000 })
    await page.mouse.move(700, 400)
    await page.screenshot({ path: join(OUT, '01-rest.png') })

    // 1 titlebar 自绘控件消失（能力开关 platform=win32）
    const n = await page.locator('.sand-window-controls button').count()
    log(`1 titlebar 自绘控件: .sand-window-controls button count=${n} ${n === 0 ? 'PASS' : 'FAIL'}`)

    // 2 Delete 菜单项消失（模块覆盖：剥 onRequestDeleteAgent）
    await page.locator('.sand-agent-item', { hasText: 'P5-52 probe' }).click({ button: 'right' })
    const rowMenu = await page.locator('[aria-label="Agent actions"] [role=menuitem]').evaluateAll(
      (els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.innerText.trim()))
    log(`2 行菜单可见项: ${JSON.stringify(rowMenu)} Delete=${rowMenu.includes('Delete') ? 'FAIL 仍在' : 'PASS 消失'}`)
    await page.keyboard.press('Escape')

    // 3 Reply 消失（模块覆盖：剥 onReply/onStartThread；保留 More → Copy）
    await page.locator('.sand-virtual-transcript').getByText(TURN_PROMPT).last().hover()
    const anchor = page.locator('.sand-message-action-anchor:hover')
    await expect(anchor.locator('button[aria-label="More message actions"]')).toBeVisible()
    const replyN = await page.locator('button[aria-label^="Reply to"]').count()
    const reactN = await page.locator('button[aria-label="Add reaction"]').count()
    await page.screenshot({ path: join(OUT, '03-hover.png') })
    await anchor.locator('button[aria-label="More message actions"]').click()
    const msgMenu = await page.locator('[role=menu][aria-label="More message actions"] [role=menuitem]').evaluateAll(
      (els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.innerText.trim()))
    log(`3 消息悬浮: Reply count=${replyN} AddReaction count=${reactN} More 菜单=${JSON.stringify(msgMenu)} ${(replyN === 0 && reactN === 0 && msgMenu.join() === 'Copy') ? 'PASS' : 'FAIL'}`)
    await page.keyboard.press('Escape')

    // 4 Channels 消失（模块覆盖：chat header 剥 trailing）
    const chN = await page.locator('button[aria-label="Channels"]').count()
    const bcastN = await page.locator('button[aria-label="Broadcast to agents"]').count()
    const netN = await page.locator('button[aria-label="Agent network"]').count()
    log(`4 header: Channels=${chN} Broadcast=${bcastN} AgentNetwork=${netN} ${chN + bcastN + netN === 0 ? 'PASS' : 'FAIL'}`)
    await page.screenshot({ path: join(OUT, '04-header-sidebar.png') })

    // 5 账户菜单只留前 2（CSS 按位置屏蔽）
    await page.click('button[aria-label="Account"]')
    const acct = await page.locator('[role=menu][aria-label="Account"] [role=menuitem]').evaluateAll(
      (els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.innerText.trim()))
    await page.screenshot({ path: join(OUT, '05-account.png') })
    log(`5 账户菜单可见项: ${JSON.stringify(acct)} ${JSON.stringify(acct) === JSON.stringify(['Settings', 'About']) ? 'PASS' : 'FAIL'}`)
    await page.keyboard.press('Escape')

    // 6 attach/voice 消失（CSS display:none !important）
    const disp = await page.evaluate(() => {
      const g = (l: string) => { const el = document.querySelector(`.sand-prompt-shell button[aria-label="${l}"]`); return el ? getComputedStyle(el).display : 'absent' }
      return { attach: g('Attach file'), voice: g('Start voice input') }
    })
    log(`6 composer: attach=${disp.attach} voice=${disp.voice} ${(disp.attach === 'none' || disp.attach === 'absent') && (disp.voice === 'none' || disp.voice === 'absent') ? 'PASS（存在则 display:none）' : 'FAIL'}`)
    await page.screenshot({ path: join(OUT, '06-composer.png') })

    // 7 修活的 New 按钮：点击后 DOM 变化（新增 agent 行）
    const before = await page.locator('.sand-agent-item').count()
    await page.mouse.move(700, 400)
    const newBtn = page.locator('.sand-agents-sidebar__new')
    await expect(newBtn).toBeVisible()
    await newBtn.click()
    await page.waitForTimeout(1500)
    const after = await page.locator('.sand-agent-item').count()
    await page.screenshot({ path: join(OUT, '07-after-new.png') })
    log(`7 New 按钮: agent 行 ${before}→${after} ${after > before ? 'PASS（活入口）' : 'FAIL（点了没反应=死入口）'}`)

    // 回到有内容的会话
    await page.locator('.sand-agent-item', { hasText: 'P5-52 probe' }).click({ timeout: 60_000 })
    await expect(page.locator('.sand-virtual-transcript pre')).toHaveCount(1, { timeout: 30_000 })

    // 8 info pane 打开可见（修活：拖拽层 pointer-events:none 让出命中）
    await page.click('button[aria-label="View agent settings"]')
    const pane = page.locator('aside.sand-info-pane[data-open]')
    await expect(pane).toBeInViewport()
    await expect(pane.locator('[aria-label="Agent name"]').first()).toBeVisible()
    await page.screenshot({ path: join(OUT, '08-info-pane.png') })
    log('8 info pane: data-open 且 Agent name 输入框可见 PASS')
    // 亲点 info pane 内一个开关验证非死入口（DOM 变化或 RPC）
    const basel = await page.evaluate(() => {
      const w = window as unknown as { __pbotsShim: { requests: string[] } }
      return w.__pbotsShim.requests.length
    })
    const sw = pane.locator('[role=switch]').filter({ visible: true }).first()
    if (await sw.count() > 0) {
      const st0 = await sw.getAttribute('aria-checked')
      await sw.click()
      await page.waitForTimeout(600)
      const st1 = await pane.locator('[role=switch]').filter({ visible: true }).first().getAttribute('aria-checked')
      const rpcs = await page.evaluate(() => (window as unknown as { __pbotsShim: { requests: string[] } }).__pbotsShim.requests.slice(basel))
      log(`8b info pane 开关: aria-checked ${st0}→${st1} rpc=${rpcs.join(',')} ${st0 !== st1 || rpcs.length > 0 ? 'PASS' : 'FAIL'}`)
    } else {
      log('8b info pane: 无 role=switch，跳过')
    }

    const fails = lines.filter((l) => l.includes('FAIL')).length
    log(`SUMMARY: ${8 - fails}/8 PASS`)
    if (fails > 0) throw new Error(`${fails} 项 FAIL`)
  } finally {
    await shell.stop()
    await rt.stop()
    console.log(lines.join('\n'))
  }
})
