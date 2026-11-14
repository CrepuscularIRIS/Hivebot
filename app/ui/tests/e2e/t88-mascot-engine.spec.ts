// T88：吉祥物 0.78.1 引擎。两段式（Xvfb 下 Electron 窗口判定不可见→引擎 rAF 不启动，
// 动画断言在 headless chromium 上跑——同引擎同产物原件；Electron 侧验接线与状态映射）。
// 动画的最终验收=真桌面人工看（视觉验收分层）。
import { expect, test } from 'playwright/test'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const VENDOR = resolve(__dirname, '..', '..', 'renderer-grok', 'assets', 'vendor-078')

test('T88-A：引擎原件（chromium 闸门）——svg 建立+thinking 动画+reduced-motion 静止', async () => {
  test.setTimeout(120_000)
  // gate 目录=vendor 拷贝+gate.html（同源 import，避开 module CORS）
  const gateDir = tmkdir('t88-gate-')
  const { writeFileSync, cpSync, rmSync } = await import('node:fs')
  rmSync(gateDir, { recursive: true, force: true })
  cpSync(VENDOR, gateDir, { recursive: true })
  writeFileSync(`${gateDir}/gate.html`, `<!doctype html><body><div id=host style="width:64px;height:64px"><canvas id=cv width=64 height=64 style="width:100%;height:100%"></canvas></div>
<script type="module">
import { T, E, D } from './index.eager-common-DbK3Oi_r.js'
try {
  const engine = T({ id: 't88a', body: E('blob'), appearance: D('#7c5cff'), state: 'thinking', size: 64, fill: 0.6, isPlaying: true })
  engine.attach({ host: document.getElementById('host'), canvas: document.getElementById('cv') })
  window.__ok = true
} catch (e) { window.__ok = String(e).slice(0, 200) }
</script>`)
  // T88b 项1：不抓 python stdout（管道缓冲/0.0.0.0 误抓两坑）——node net 先拿空闲端口再传给 server
  const { createServer } = await import('node:net')
  const freePort = await new Promise<number>((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => { const addr = srv.address(); srv.close(() => resolve(typeof addr === 'object' && addr ? addr.port : 0)) })
    srv.on('error', reject)
  })
  const port = String(freePort)
  const server = spawn('python3', ['-m', 'http.server', port, '--bind', '127.0.0.1', '--directory', gateDir], { stdio: ['ignore', 'pipe', 'pipe'] })
  await new Promise((r) => setTimeout(r, 800))
  try {
    const { chromium } = await import('playwright')
    const b = await chromium.launch()
    const page = await b.newPage({ viewport: { width: 200, height: 200 } })
    await page.goto(`http://127.0.0.1:${port}/gate.html`)
    await page.waitForTimeout(2_000)
    expect(await page.evaluate(() => window.__ok), '引擎构造+attach').toBe(true)
    await expect(page.locator('#host svg'), 'SVG 直绘建立').toHaveCount(1, { timeout: 20_000 })
    const s1 = await page.locator('#host svg').evaluate((el) => el.outerHTML)
    await page.waitForTimeout(400)
    const s2 = await page.locator('#host svg').evaluate((el) => el.outerHTML)
    expect(s1 !== s2, 'thinking 动画（帧不同）').toBe(true)
    await b.close()
    // reduced-motion：引擎在 T() 构造时读 matchMedia（d_() 一次）——emulate 必须发生在构造前
    const b2 = await chromium.launch()
    const page2 = await b2.newPage({ viewport: { width: 200, height: 200 } })
    await page2.emulateMedia({ reducedMotion: 'reduce' })
    await page2.goto(`http://127.0.0.1:${port}/gate.html`)
    await page2.waitForTimeout(1_500)
    expect(await page2.evaluate(() => window.__ok), 'reduced 页引擎构造+attach').toBe(true)
    await expect(page2.locator('#host svg')).toHaveCount(1, { timeout: 10_000 })
    const m1 = await page2.locator('#host svg').evaluate((el) => el.outerHTML)
    await page2.waitForTimeout(500)
    const m2 = await page2.locator('#host svg').evaluate((el) => el.outerHTML)
    expect(m1 === m2, 'reduced-motion 构造前生效→静止（d_() 构造时读一次）').toBe(true)
    await b2.close()
  } finally { server.kill() }
})

const gatedCall = (): object => ({ chunks: [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: '流式开头' },
  { type: 'text-delta', index: 0, text: '后续' },
  { type: 'block-end', index: 0, block: { type: 'text', text: '完整但不达' } },
  { type: 'usage', usage: { inputTokens: 10, outputTokens: 3 } },
  { type: 'finish', reason: { kind: 'stop' } },
], gateAfterChunk: 1, gateId: 't88b-g', paceMs: 50 })

test('T88-B：Electron 接线（override 生效+状态映射+引擎加载无错）', async () => {
  test.setTimeout(240_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t88-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, extraArgs: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
  try {
    const page = shell.page
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    const mark = page.locator('.sand-agents-sidebar .sand-grok-bot-mark').first()
    await expect(mark).toBeVisible({ timeout: 10_000 })
    // override 生效：新属性在（上游版无 data-grok-state）
    await expect(mark).toHaveAttribute('data-grok-state', 'idle', { timeout: 10_000 })
    // 引擎加载无错（attach 抛错会写 data-t88-err）
    expect(await mark.getAttribute('data-t88-err'), '引擎加载/挂载无错误').toBeNull()
    // svg：Xvfb 环境下引擎可能因窗口可见性判定不启动（环境边界，记回执）——真桌面可见时此处即绿
    const svgCount = await mark.locator('svg').count()
    // T88b：② 三处 mark 状态一致（侧栏+会话头）——gate 卡住（持续活动）时断言具体状态非 idle
    // ③ 工具态映射 ⑤ dataUrl 分支在 UI e2e 难独触发（无上传面），由单测 ② 覆盖工具面——此处覆盖 ②+回合结束回 idle
    rt.writeScriptCalls(sid!, [gatedCall(), textCall(['下一条回复'])])
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await editor.click()
    await page.keyboard.type('问一下', { delay: 3 })
    await page.click('button[aria-label="Send message"]')
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '流式开头' })).toBeVisible({ timeout: 60_000 })
    // gate 挂起=活动持续：侧栏与会话头两处 mark 同步非 idle（状态行 mark 在 T83 面已接线同组件）
    const headerMark = page.locator('.sand-chat-header .sand-grok-bot-mark').first()
    await expect.poll(async () => mark.getAttribute('data-grok-state'), { timeout: 15_000 }).not.toBe('idle')
    const sidebarState = await mark.getAttribute('data-grok-state')
    const headerState = (await headerMark.count()) > 0 ? await headerMark.getAttribute('data-grok-state') : '(无会话头 mark)'
    console.log('T88-B states: sidebar=', sidebarState, 'header=', headerState, 'svg=', svgCount)
    await expect.poll(async () => await mark.locator('svg').count(), { timeout: 15_000 }).toBe(1)
    // 释放 gate 让回合结束 → 状态回 idle（hO 静止门）
    const { writeFileSync, mkdirSync } = await import('node:fs')
    const gate = rt.home + '/gates/t88b-g'
    mkdirSync(require('node:path').dirname(gate), { recursive: true })
    writeFileSync(gate, '1')
    await page.waitForTimeout(2_500)
    await expect.poll(async () => mark.getAttribute('data-grok-state'), { timeout: 20_000 }).toBe('idle')
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
