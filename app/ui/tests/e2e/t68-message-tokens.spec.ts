// T68：会话区橄榄色硬编码清零——全集格扫 .sand-virtual-transcript 与输入 dock 的全部 computed 色，
// 断言不含 0.18 橄榄色集合（正对照=能找到 agent 气泡 token 色，防遍历空转）。
// hover 动作钮/附件卡逐项断言（注入元素只用于读 computed，工单口径）。
import { expect, test, type Page } from 'playwright/test'
import { join, resolve } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { textCall, waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const UI_ROOT = resolve(__dirname, '..', '..')
const PRESETS_PATCH = join(UI_ROOT, '..', 'sdk', 'profile', 'patches', 'presets.yml')
// T68b：脚本化长回复（≥200 字，撞 560 上限与窄窗 80% 分支）——PRESETS_PATCH 让 fake 会话可跑
const LONG_REPLY = 'The border system uses four translucent hairline tokens keyed by strength. Primary marks focus and hover on the composer frame. Secondary is the resting frame of menus, dialogs and tooltips. Tertiary carries structural separators like the sidebar edge. Quaternary traces the glass ring around agent bubbles. Shadows are literal black at low alpha and vanish entirely in dark mode, where depth comes only from these half-pixel strokes.'

const OUT = '/home/lingxufeng/bot/work/ui-borders-connect/evidence/T68'
const HIDPI = ['--force-device-scale-factor=2']

// 0.18 橄榄色集合 → rgb（工单验收 1 全集格）
const OLIVE = new Set(['rgb(32, 35, 31)', 'rgb(41, 45, 38)', 'rgb(52, 56, 50)', 'rgb(169, 175, 163)', 'rgb(169, 200, 93)', 'rgb(146, 153, 141)', 'rgb(199, 236, 107)', 'rgb(240, 167, 167)', 'rgb(121, 128, 118)', 'rgb(155, 163, 146)', 'rgb(116, 123, 112)'])

const tokenOf = (page: Page, token: string, prop: string): Promise<string> =>
  page.evaluate(([t, p]) => {
    const probe = document.createElement('div')
    probe.style[p] = `var(${t})`
    probe.style.display = 'none'
    document.body.append(probe)
    const v = getComputedStyle(probe)[p as 'color']
    probe.remove()
    return v
  }, [token, prop] as [string, string])
const sameColor = (a: string, b: string): boolean => {
  const num = (s: string): number[] => (s.match(/[\d.]+/g) ?? []).map(Number)
  const [r1, g1, b1, a1 = 1] = num(a); const [r2, g2, b2, a2 = 1] = num(b)
  return Math.abs(r1 - r2) <= 2 && Math.abs(g1 - g2) <= 2 && Math.abs(b1 - b2) <= 2 && Math.abs(a1 - a2) <= 0.02
}
const cs = (page: Page, sel: string, props: string[]): Promise<Record<string, string>> =>
  page.locator(sel).first().evaluate((el, keys) => {
    const c = getComputedStyle(el)
    return Object.fromEntries(keys.map((k) => [k, (c as unknown as Record<string, string>)[k]]))
  }, props)

/** 全集扫描：两根下全部元素的 color/bg/border/outline computed。 */
const sweep = (page: Page): Promise<{ hits: string[]; sawBubble: boolean }> =>
  page.evaluate((olive) => {
    const roots = [...document.querySelectorAll('.sand-virtual-transcript, .sand-chat-input-dock')]
    const hits = new Set<string>()
    let sawBubble = false
    const bubbleFill = getComputedStyle(document.documentElement).getPropertyValue('--sand-fill-bubble-agent').trim()
    const bubbleRgb = (() => { const d = document.createElement('div'); d.style.color = bubbleFill; d.style.display = 'none'; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v })()
    for (const root of roots) {
      for (const el of [root, ...root.querySelectorAll('*')] as Element[]) {
        const c = getComputedStyle(el)
        for (const v of [c.color, c.backgroundColor, c.borderTopColor, c.borderRightColor, c.borderBottomColor, c.borderLeftColor, c.outlineColor]) {
          if (v && olive.includes(v)) hits.add(`${(el as HTMLElement).className && String((el as HTMLElement).className).slice(0, 40)} => ${v}`)
        }
        if (c.backgroundColor === bubbleRgb) sawBubble = true
      }
    }
    return { hits: [...hits], sawBubble }
  }, [...OLIVE])

test('T68：会话区橄榄色清零（DPR2 亮暗）', async () => {
  test.setTimeout(300_000)
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, cwd: tmkdir('bot-t68-ws-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, extraArgs: HIDPI })
  try {
    const page = shell.page
    expect(await page.evaluate(() => devicePixelRatio), 'DPR=2 前提').toBe(2)
    await waitProductReady(page)
    // 主 bot sid（grok-shim :76 同款）→ 预写脚本长回复 → 发消息消费
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid, '主 bot 会话存在').toBeTruthy()
    rt.writeScriptCalls(sid!, [textCall([LONG_REPLY])])
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await editor.click()
    await page.keyboard.type('hi', { delay: 5 })
    await page.click('button[aria-label="Send message"]')
    // agent 长气泡（data-role=assistant——T68b：0.18 transcript:776 侧别标记）
    const agentBubble = page.locator('.sand-message[data-role="assistant"]')
    await expect(agentBubble.first()).toBeVisible({ timeout: 60_000 })
    await expect(agentBubble.first()).toContainText('hairline', { timeout: 30_000 })

    // 注入同类名元素（附件卡/排队行——真实态难造，工单允许注入只读 computed）
    await page.evaluate(() => {
      const dock = document.querySelector('.sand-chat-input-dock') ?? document.querySelector('.sand-virtual-transcript')?.parentElement
      const att = document.createElement('div')
      att.className = 'sand-message-attachment'
      att.innerHTML = '<span></span><span><strong>f.txt</strong><small>2 KB</small></span>'
      const q = document.createElement('div')
      q.className = 'sand-queued-send-notice'
      q.innerHTML = '<span>Queued</span><button>Retry</button>'
      dock?.append(att, q)
    })

    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
      const tag = mode as string

      // ---- 全集格：无橄榄色 + 正对照 ----
      const sw = await sweep(page)
      expect(sw.sawBubble, `${tag} 正对照：遍历真扫到了 agent 气泡`).toBe(true)
      expect(sw.hits, `${tag} 全集无橄榄色（残留：${sw.hits.slice(0, 5).join(' | ')}）`).toEqual([])

      // ---- hover 动作钮（T68b：真实 hover 硬断言，无注入兜底）----
      const row = page.locator('.sand-message[data-role="assistant"]').first()
      await row.hover()
      await page.waitForTimeout(300)
      const hbtn = page.locator('.sand-message-hover-actions__button')
      await expect(hbtn.first(), `${tag} 真实 hover 出动作钮`).toHaveCount(1, { timeout: 5_000 })
      // 可见态（anchor :hover 激活中）
      const h = await cs(page, '.sand-message-hover-actions__button', ['borderTopWidth', 'borderTopColor', 'backgroundColor'])
      expect(h.borderTopWidth, `${tag} hover 钮 1px`).toBe('1px')
      expect(sameColor(h.borderTopColor, await tokenOf(page, '--sand-border-tertiary-translucent', 'color')), `${tag} hover 钮边 tertiary（${h.borderTopColor}）`).toBe(true)
      expect(sameColor(h.backgroundColor, await tokenOf(page, '--sand-bg-elevated', 'backgroundColor')), `${tag} hover 钮可见态底 elevated（${h.backgroundColor}）`).toBe(true)
      // 按钮 hover 后底：0.18 布局里按钮悬在 anchor 盒外（bottom:-30px），真移入即失 anchor:hover 闪没
      // ——「移上去读底」不可达，改样式表规则断言（:hover 规则的 background 含 elevated-hover token 链）
      const hoverRule = await page.evaluate(() => {
        const found: string[] = []
        for (const sheet of document.styleSheets) {
          let rules: CSSRuleList; try { rules = sheet.cssRules } catch { continue }
          for (const r of rules) {
            if (!(r instanceof CSSStyleRule)) continue
            if (r.cssText.includes('sand-message-hover-actions__button:hover')) found.push(r.cssText)
          }
        }
        return found.find((t) => t.includes('--sand-bg-elevated-hover')) ?? null
      })
      expect(hoverRule, `${tag} :hover 覆盖规则在表且底走 elevated-hover 链（原版橄榄 hover 规则同时存在，被 !important 压制）`).toContain('--sand-bg-elevated-hover')

      // ---- 附件卡：border 0 + .5px 环 + 附件卡 token ----
      const a = await cs(page, '.sand-message-attachment', ['borderTopWidth', 'boxShadow'])
      expect(a.borderTopWidth, `${tag} 附件卡无边`).toBe('0px')
      expect(a.boxShadow, `${tag} 附件卡 .5px 环`).toContain('0.5px')
      expect(sameColor(a.boxShadow, await tokenOf(page, '--sand-border-attachment-card', 'color')), `${tag} 环色 attachment-card`).toBe(true)

      // ---- agent 气泡 max-width 两档 ----
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.waitForTimeout(300)
      // ---- agent 气泡 max-width：三路断言（computed 对 min() 序列化不可靠——规则在表 + 宽窗量测 + 窄窗 80%）----
      const ruleInSheet = await page.evaluate(() => {
        for (const sheet of document.styleSheets) {
          let rules: CSSRuleList; try { rules = sheet.cssRules } catch { continue }
          for (const r of rules) {
            if (!(r instanceof CSSStyleRule)) continue
            // T74 架构：agent 封顶从 .sand-message 移到 anchor（:has 规则）——探针跟随
            if (!r.selectorText.includes('sand-message-action-anchor:has(> .sand-message[data-role="assistant"')) continue
            const mw = r.style.maxWidth ?? ''
            if (mw.includes('min(80%') && mw.includes('560px')) return mw
          }
        }
        return null
      })
      expect(ruleInSheet, `${tag} .sand-message max-width 规则在表（min(80%,560px,…))`).toContain('560px')
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.waitForTimeout(300)
      // T68b：agent 长气泡撞上限——宽窗 [555,561]（贴住 560，非恒真 ≤）
      const bub = await page.evaluate(() => {
        const el = document.querySelector('.sand-message[data-role="assistant"]')
        if (el === null) return null
        return { w: el.getBoundingClientRect().width }
      })
      expect(bub, `${tag} 找到 agent 气泡（data-role=assistant）`).not.toBeNull()
      expect(bub!.w, `${tag} 宽窗 agent 气泡贴 560 上限（实测 ${bub!.w}）`).toBeGreaterThanOrEqual(555)
      expect(bub!.w, `${tag} 宽窗不超上限`).toBeLessThanOrEqual(561)
      await page.setViewportSize({ width: 700, height: 800 })
      await page.waitForTimeout(300)
      const bub2 = await page.evaluate(() => {
        const el = document.querySelector('.sand-message[data-role="assistant"]')
        const col = document.querySelector('.sand-virtual-transcript')
        if (el === null || col === null) return null
        return { w: el.getBoundingClientRect().width, colW: col.getBoundingClientRect().width }
      })
      expect(bub2, `${tag} 窄窗找到 agent 气泡`).not.toBeNull()
      // 窄窗「真撞上限」不可达：prose 的 overflow-wrap 折断长 token，内容自然宽 306 < min() 上限——
      // 以「≤ 上限」+宽窗贴顶 560（同一条 min() 规则的另一分支已证生效）+规则在表三证替代，回执存疑记
      const capNarrow = Math.min(bub2!.colW * 0.8, bub2!.colW - 82, 560)
      expect(bub2!.w, `${tag} 窄窗 ≤ min() 上限（${Math.round(capNarrow)}）`).toBeLessThanOrEqual(capNarrow + 1)
      await page.setViewportSize({ width: 1280, height: 800 })

      if (mode === 'light') {
        await row.hover()
        await page.screenshot({ path: join(OUT, 'transcript-light.png') })
      } else {
        await page.screenshot({ path: join(OUT, 'transcript-dark.png') })
      }
    }
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
