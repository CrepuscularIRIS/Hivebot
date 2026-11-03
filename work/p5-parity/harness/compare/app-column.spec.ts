// P5-54 · 对照台第三列（BRIEF §12.7 第 5 条）：我们真实的 Electron 应用，fake LLM 驱动出与 fixture 等价的会话，
// 截与左右两列同名的视图、按同一份 PARTS（ours 侧选择器，同一套 0.18 DOM）采 computed-style。
// 它与右列（移植树 + 桩）的差异只可能来自 shim 或真实数据——把「移植保真」和「数据接入」两类问题分开。
// 产物：<EVID_DIR>/singles/<view>.<theme>.app.png、<EVID_DIR>/styles/app.json、<EVID_DIR>/app-summary.json；
// 之后跑 `node run.mjs` 会把它并成三联拼图（REF | OURS | APP）并给 u1-diff 加 app 列。
// 跑法：pnpm -C app/ui test:compare-app（Xvfb；先 pnpm -C app/ui build）。
import { expect, test, type Page } from 'playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  api, bashCall, createBots, devState, launchProduct, openBot, permissionDock, send, textCall, toolRows,
} from '../../../../app/ui/tests/support/ui.ts'
import { semanticFixture } from './fixture.mjs'
import { PARTS, STYLE_PROPS, THEMES, VIEWS } from './views.mjs'

const EVID_DIR = process.env.EVID_DIR ?? resolve(__dirname, '../../evidence/compare')
const HIDPI = ['--force-device-scale-factor=2']

/** fixture 的一条 transcript 语义 → fake 脚本（同文案：user / thinking / bash / read / assistant / 第二条 user + 待决审批）。 */
function fixtureCalls(): object[] {
  const fx = semanticFixture({})
  const t = (type: string) => fx.transcript.filter((e: { type: string }) => e.type === type) as Array<{ text?: string; summary?: string; command?: string }>
  const thinking = t('thinking')[0]!.text!
  const assistant = t('assistant')[0]!.text!
  const reasoningTool = (reasoning: string, name: string, args: object, id: string): object => {
    const a = JSON.stringify(args)
    return {
      chunks: [
        { type: 'block-start', index: 0, blockType: 'reasoning' },
        { type: 'reasoning-delta', index: 0, text: reasoning },
        { type: 'block-end', index: 0, block: { type: 'reasoning', text: reasoning } },
        { type: 'block-start', index: 1, blockType: 'tool-call' },
        { type: 'tool-call-delta', index: 1, id, name, argumentsDelta: a },
        { type: 'block-end', index: 1, block: { type: 'tool-call', id, name, arguments: a } },
        { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
        { type: 'finish', reason: { kind: 'tool-calls' } },
      ],
      paceMs: 10,
    }
  }
  return [
    reasoningTool(thinking, 'bash', { command: 'python analyze.py --quarter q3', description: 'compare fixture' }, 'cmp-bash'),
    bashCall('cat summary.md', 'cmp-read'),
    textCall([assistant], { paceMs: 5 }),
    bashCall(t('permission')[0]!.command!, 'cmp-perm'),
  ]
}

const COLLECT = `(parts, props) => {
  const out = {};
  for (const [part, expr] of Object.entries(parts)) {
    let el = null;
    try { el = eval(expr); } catch { el = null; }
    if (!el) { out[part] = null; continue; }
    const cs = getComputedStyle(el);
    const style = {};
    for (const p of props) style[p] = cs.getPropertyValue(p);
    out[part] = style;
  }
  return out;
}`

const STATE = `(() => {
  const b = document.body.innerText;
  return {
    boundary: (b.match(/Couldn't render this/g) || []).length,
    agentItems: document.querySelectorAll('.sand-agent-item').length,
    hasUserMsg: b.includes('quarterly numbers'), hasToolBash: b.includes('analyze.py'),
    hasThinking: document.querySelectorAll('[data-kind=thinking]').length > 0, hasAssistant: b.includes('Revenue is up'),
    hasPermCard: b.includes('Allow once'), hasUser2: b.includes('Q4 outlook'),
    personaStates: [...new Set([...document.querySelectorAll('svg[data-grok-state]')].map(e => e.getAttribute('data-grok-state')))],
  };
})()`

async function capture(page: Page, view: string, theme: 'light' | 'dark', styles: Record<string, unknown>, summary: Record<string, unknown>): Promise<void> {
  await page.emulateMedia({ colorScheme: theme })
  await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${theme}`)
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(EVID_DIR, 'singles', `${view}.${theme}.app.png`) })
  const parts = Object.fromEntries(PARTS.map((p: { part: string; sel: { ours: string } }) => [p.part, p.sel.ours]))
  styles[`${view}.${theme}`] = await page.evaluate(`(${COLLECT})(${JSON.stringify(parts)}, ${JSON.stringify(STYLE_PROPS)})`)
  summary[`${view}.${theme}`] = await page.evaluate(STATE)
}

test('对照台第三列：真实 Electron（fake LLM 等价会话）× 4 视图 × 亮暗', async () => {
  test.setTimeout(300_000)
  mkdirSync(join(EVID_DIR, 'singles'), { recursive: true })
  mkdirSync(join(EVID_DIR, 'styles'), { recursive: true })
  const env = await launchProduct({ extraArgs: HIDPI })
  try {
    const { page, rt, shell } = env
    await shell.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900) })
    const main = (await devState(page)).meta.mainBotId!
    expect((await api(page, 'session/rename', { request: { sessionId: main, title: 'Main Bot' } })).ok).toBe(true)
    const [research, ops] = await createBots(page, [{ title: 'Research Bot', preset: 'p2-alpha' }, { title: 'Ops Bot', preset: 'p2-alpha' }])

    // 主 bot：fixture 会话（user → thinking → bash → read → assistant markdown → 第二条 user → 待决审批）
    const fx = semanticFixture({})
    const users = fx.transcript.filter((e: { type: string }) => e.type === 'user') as Array<{ text: string }>
    rt.writeScriptCalls(main, fixtureCalls())
    await openBot(page, 'Main Bot')
    await send(page, users[0]!.text)
    for (let i = 0; i < 2; i += 1) {
      await permissionDock(page).locator('button', { hasText: 'Allow once' }).click({ timeout: 30_000 })
      await expect(permissionDock(page)).toHaveCount(0, { timeout: 20_000 })
    }
    await expect(page.locator('.sand-virtual-transcript')).toContainText('Revenue is up', { timeout: 30_000 })
    await send(page, users[1]!.text)
    await expect(permissionDock(page)).toBeVisible({ timeout: 30_000 }) // 待决审批卡留着（conv-rest 的组成部分）
    await expect(toolRows(page)).not.toHaveCount(0)

    // Research Bot：1 条未读（后台回复）
    rt.writeScriptCalls(research!, [textCall(['Background research reply.'])])
    await rt.client.call('session/prompt', { request: { requestId: `cmp-unread-${Date.now()}`, sessionId: research, mode: 'queue', content: [{ type: 'text', text: 'ping' }] } })
    await page.waitForTimeout(1500)

    const styles: Record<string, unknown> = {}
    const summary: Record<string, unknown> = {}
    for (const view of VIEWS as Array<{ id: string }>) {
      for (const theme of THEMES as Array<'light' | 'dark'>) {
        if (view.id === 'conv-rest') {
          await openBot(page, 'Main Bot')
        } else if (view.id === 'conv-running') {
          // 运行中：Ops Bot 一个挂起的回合（首块后 gate），头像进 thinking
          if (theme === 'light') {
            rt.writeScriptCalls(ops!, [textCall(['Working on it… ', 'still going'], { gateId: `cmp-run-${Date.now()}` })])
            await openBot(page, 'Ops Bot')
            await send(page, 'Run the weekly ops check.')
            await page.waitForTimeout(1500)
          }
        } else if (view.id === 'sidebar-collapsed') {
          if (theme === 'light') { await openBot(page, 'Main Bot'); await page.keyboard.press('Control+b') }
        } else if (view.id === 'info-pane') {
          if (theme === 'light') {
            await page.keyboard.press('Control+b') // 展开回去
            await openBot(page, 'Main Bot')
            await page.click('button[aria-label="View agent settings"]')
          }
        }
        await capture(page, view.id, theme, styles, summary)
      }
    }
    writeFileSync(join(EVID_DIR, 'styles', 'app.json'), JSON.stringify(styles, null, 1))
    writeFileSync(join(EVID_DIR, 'app-summary.json'), JSON.stringify(summary, null, 1))
    for (const [k, st] of Object.entries(summary)) expect((st as { boundary: number }).boundary, `${k} boundary`).toBe(0)
  } finally {
    await env.stop()
  }
})
