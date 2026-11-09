// P5-52 · U4′ 静息态零死入口（renderer-grok + shim，真实 main + fake-LLM 事件流）。
// ① 隐藏清单逐条断言（能力开关 / 模块覆盖 / CSS 覆盖，见 renderer-grok/overrides/）；
// ② 遍历主视图（侧栏+会话、消息悬浮、行菜单、账户菜单、搜索面板、市场 overlay、设置三节、info pane）中
//    视口内可见、可用的每个 button / [role=button] / a / menuitem / option / tab：点击后要么有 DOM 变化
//    （persona 动画子树除外），要么 shim 收到 RPC；且不得触发 shim 无 handler 的 RPC。死入口清单必须为空。
// 前置：pnpm build（main）+ cd renderer-grok && pnpm build（shim 与 overrides 注入）。
import { expect, test, type Page } from 'playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { bashCall, textCall } from '../support/ui.ts'

const UI_ROOT = resolve(__dirname, '..', '..')
const EVIDENCE = join(UI_ROOT, 'test-output', 'P5-52')
const PRESETS_PATCH = join(UI_ROOT, '..', 'sdk', 'profile', 'patches', 'presets.yml')
const TURN_PROMPT = 'dead entry probe'
const AGENT_NAME = 'P5-52 probe'

interface Clickable { key: string; x: number; y: number; external: boolean }
interface Effect { mutations: number; rpcs: string[]; unhandled: string[] }
type Shim = { requests: string[]; unhandled: string[] }

/** 视口内可见、可用、非当前选中、非 inert 的可点击元素。key = aria-label|文本|tag|role（跨 reload 稳定）。 */
const LIST_CLICKABLES = `(() => {
  const sel = 'button, [role=button], a[href], [role=menuitem], [role=option], [role=tab], [role=switch]';
  const ok = (el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false;
    if (el.disabled === true || el.getAttribute('aria-disabled') === 'true' || el.closest('[inert],[aria-hidden=true]')) return false;
    if (cs.pointerEvents === 'none') return false;
    for (let a = el; a; a = a.parentElement) if (Number(getComputedStyle(a).opacity) === 0) return false; // 悬浮工具条未悬浮时透明
    if (el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-current')) return false; // 已选中的 tab/导航项：点了不变是正确行为
    return true;
  };
  const seen = new Set();
  return [...document.querySelectorAll(sel)].filter(ok).map((el) => {
    const r = el.getBoundingClientRect();
    const text = (el.innerText || '').trim().replace(/\\s+/g, ' ').replace(/[\\u{e000}-\\u{f8ff}]/gu, '').trim().slice(0, 40);
    const external = el.tagName === 'A' && /^https?:/.test(el.getAttribute('href') || '');
    return { key: [el.getAttribute('aria-label') || '', text, el.tagName, el.getAttribute('role') || ''].join('|'), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), external };
  }).filter((c) => !seen.has(c.key) && seen.add(c.key));
})()`

async function arm(page: Page): Promise<[number, number]> {
  return page.evaluate(() => {
    const w = window as unknown as { __u4m: number; __u4o?: MutationObserver; __pbotsShim: Shim }
    w.__u4m = 0
    w.__u4o?.disconnect()
    w.__u4o = new MutationObserver((list) => {
      // persona 头像 rAF 动画持续改属性，不算点击效果
      w.__u4m += list.filter((m) => !(m.target instanceof Element ? m.target : m.target.parentElement)?.closest('[data-grok-state]')).length
    })
    w.__u4o.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
    return [w.__pbotsShim.requests.length, w.__pbotsShim.unhandled.length]
  })
}

async function measure(page: Page, [r0, u0]: [number, number]): Promise<Effect> {
  return page.evaluate(([r, u]) => {
    const w = window as unknown as { __u4m: number; __u4o?: MutationObserver; __pbotsShim: Shim }
    w.__u4o?.disconnect()
    return { mutations: w.__u4m, rpcs: w.__pbotsShim.requests.slice(r), unhandled: w.__pbotsShim.unhandled.slice(u) }
  }, [r0, u0] as [number, number])
}

const clickables = (page: Page): Promise<Clickable[]> => page.evaluate(LIST_CLICKABLES) as Promise<Clickable[]>
const visibleTexts = (page: Page, selector: string): Promise<string[]> =>
  page.locator(selector).evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => (e as HTMLElement).innerText.replace(/[\u{e000}-\u{f8ff}]/gu, '').trim()))

/** 视图打开序列：每次都从「reload → 选中有内容的会话」的静息态开始。 */
const VIEWS: Record<string, (page: Page) => Promise<void>> = {
  'sidebar+conversation': async () => {},
  'message hover': async (page) => { await page.locator('.sand-virtual-transcript').getByText(TURN_PROMPT).last().hover() },
  'code block hover': async (page) => { await page.locator('.sand-virtual-transcript pre').hover() },
  'message more menu': async (page) => {
    await page.locator('.sand-virtual-transcript').getByText(TURN_PROMPT).last().hover()
    await page.locator('.sand-message-action-anchor:hover button[aria-label="More message actions"]').click()
  },
  'agent row menu': async (page) => { await page.locator('.sand-agent-item', { hasText: AGENT_NAME }).click({ button: 'right' }) },
  'account menu': async (page) => { await page.click('button[aria-label="Account"]') },
  'search palette': async (page) => { await page.click('button[aria-label="Search"]') },
  // P5-57：footer 入口文案 Connect apps，overlay 换成 P-C 市场（本 env 无目录源 → 空态 + Close；Yours / Filter 是 0.18 Cursor 目录的构件，已不存在）
  'market overlay': async (page) => { await page.locator('.sand-agents-sidebar__plugins').click() },
  'settings General': async (page) => { await page.click('button[aria-label="Account"]'); await page.locator('[role=menuitem]', { hasText: 'Settings' }).click() },
  'settings General (scrolled)': async (page) => {
    await VIEWS['settings General'](page)
    await page.locator('.sand-settings-panel__body').evaluate((el) => { el.scrollTop = el.scrollHeight; for (const s of el.querySelectorAll('*')) if (s.scrollHeight > s.clientHeight) s.scrollTop = s.scrollHeight })
  },
  'info pane (agent settings)': async (page) => { await page.click('button[aria-label="View agent settings"]') },
}

async function reset(page: Page): Promise<void> {
  // T41b：段②遍历会点行菜单每一项（含 Hide from sidebar——把 P5-52 probe 藏了）；
  // reset 清掉隐藏偏好，reload 后行回来
  await page.evaluate(() => { try { window.localStorage.removeItem('pbots.shim.hidden-agents') } catch { /* ignore */ } })
  await page.reload()
  await page.locator('.sand-agent-item', { hasText: AGENT_NAME }).click({ timeout: 60_000 })
  await expect(page.locator('.sand-virtual-transcript pre')).toHaveCount(1, { timeout: 30_000 })
  await page.mouse.move(700, 400)
}

test('U4′：死入口隐藏清单逐条生效 + 主视图遍历零死入口', async () => {
  test.setTimeout(900_000)
  mkdirSync(EVIDENCE, { recursive: true })
  const ws = tmkdir('bot-p552-ws-') // P5-H1：登记，进程退出清扫
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, cwd: ws })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  const page = shell.page
  try {
    // ---- 一个有内容的会话：用户消息、bash 行（审批 allow-once）、assistant markdown（代码块） ----
    await waitProductReady(page) // T7bd：T26b 后裸 launchShell 首启进 onboarding、agent 恒 0——用兜底
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    rt.writeScriptCalls(sid!, [bashCall('echo p552', 'call-p552'), textCall(['Done. See [the docs](https://example.com/docs). Result:\n\n```js\nconsole.log(1)\n```\n'])])
    await page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]').click({ timeout: 20_000 })
    await page.keyboard.type(TURN_PROMPT, { delay: 5 })
    await page.click('button[aria-label="Send message"]')
    await page.locator('[aria-label="Local tool permissions"] button', { hasText: 'Allow once' }).click({ timeout: 30_000 })
    await expect(page.locator('.sand-virtual-transcript pre')).toHaveCount(1, { timeout: 30_000 })
    // 固定会话名（遍历会点 New 新建会话；reset 靠名字回到这条有内容的会话）
    await rt.client.call('session/rename', { request: { sessionId: sid, title: AGENT_NAME } })
    await reset(page)
    await page.screenshot({ path: join(EVIDENCE, 'rest-light.png') })

    // 外链：assistant markdown 链接是 target=_blank 的 https 链接（main setWindowOpenHandler → shell.openExternal，遍历不点）
    await expect(page.locator('.sand-virtual-transcript a', { hasText: 'the docs' })).toHaveAttribute('target', '_blank')

    // ---- ① 隐藏清单（每条一断言；机制见 REPORT-P5-52 隐藏清单表） ----
    // 能力开关：platform=win32 → 上游不画自绘窗口控件（宿主 titleBarOverlay 画原生的）
    await expect(page.locator('.sand-window-controls button')).toHaveCount(0)
    // 模块覆盖：sidebar（剥 onBroadcast/onOpenNetwork）
    await expect(page.locator('button[aria-label="Broadcast to agents"]')).toHaveCount(0)
    await expect(page.locator('button[aria-label="Agent network"]')).toHaveCount(0)
    // 模块覆盖：computer view（ComputerHeaderControl/ComputerInfoPane → null）
    await expect(page.locator('.sand-chat-header__computer')).toHaveCount(0)
    await expect(page.locator('aside.sand-info-pane:not([data-open])')).toHaveCount(0)
    // 模块覆盖：chat header（剥 trailing = Channels）
    await expect(page.locator('button[aria-label="Channels"]')).toHaveCount(0)
    // CSS 覆盖：composer 附件 / 语音
    await expect(page.locator('button[aria-label="Attach file"]')).toBeHidden()
    await expect(page.locator('button[aria-label="Start voice input"]')).toBeHidden()
    // 模块覆盖：transcript（剥 renderMessageReactionActions / onReply / onStartThread）
    await page.locator('.sand-virtual-transcript').getByText(TURN_PROMPT).last().hover()
    const hovered = page.locator('.sand-message-action-anchor:hover')
    await expect(hovered.locator('button[aria-label="More message actions"]')).toBeVisible()
    await expect(page.locator('button[aria-label="Add reaction"]')).toHaveCount(0)
    await expect(page.locator('button[aria-label^="Reply to"]')).toHaveCount(0)
    await hovered.locator('button[aria-label="More message actions"]').click()
    expect(await visibleTexts(page, '[role=menu][aria-label="More message actions"] [role=menuitem]')).toEqual(['Copy'])
    await page.keyboard.press('Escape')
    // 模块覆盖：sidebar（剥 onDuplicateAgent/onRequestDeleteAgent/onShowFullConversation）+ row-actions model（滤 Hide from sidebar）
    await page.locator('.sand-agent-item', { hasText: AGENT_NAME }).click({ button: 'right' })
    const rowMenu = await visibleTexts(page, '[aria-label="Agent actions"] [role=menuitem]')
    expect(rowMenu).toEqual(['Edit Profile', 'Show full conversation', 'Move to new section', 'Pin', 'Mark as Unread', 'Copy conversation ID', 'Hide from sidebar']) // T41：删 P5-52 过滤——上游产出序（agentRowActions 尾位）
    await page.keyboard.press('Escape')
    // CSS 覆盖：账户菜单只剩 Settings / About（Help Center / Send Feedback / Log out 屏蔽）
    await page.click('button[aria-label="Account"]')
    expect(await visibleTexts(page, '[role=menu][aria-label="Account"] [role=menuitem]')).toEqual(['Settings', 'About'])
    // CSS 覆盖：设置 → Account 卡片无 Sign Out；Close 可点（不被导航压住）
    await page.locator('[role=menuitem]', { hasText: 'Settings' }).click()
    await expect(page.locator('.sand-account-card')).toBeVisible()
    await expect(page.locator('.sand-account-card > button')).toBeHidden()
    // 模块覆盖：settings view 只留 General；settings panels 剥 Auto-review / Security Key
    expect(await visibleTexts(page, '.sand-settings-nav__item')).toEqual(['General'])
    await expect(page.locator('.sand-settings-panel [role=switch]')).toHaveCount(0) // Auto-review / Security Key 两个开关
    await expect(page.locator('.sand-settings-panel h3', { hasText: /Security Key|Egress/ })).toHaveCount(0)
    await expect(page.locator('[aria-label="Auto-review rules"]')).toHaveCount(0)
    const close = page.locator('.sand-settings-panel__close')
    const box = (await close.boundingBox())!
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.sand-settings-panel__close') != null, [box.x + box.width / 2, box.y + box.height / 2])).toBe(true)
    await page.keyboard.press('Escape')
    // 模块覆盖：palette Actions 滤 Channels / Usage & Billing；CSS 覆盖：tab 只剩 All / Agents / Actions
    await page.click('button[aria-label="Search"]')
    expect(await visibleTexts(page, '[role=tablist][aria-label="Filter results"] [role=tab]')).toEqual(['All', 'Agents', 'Actions'])
    await page.locator('[role=tablist][aria-label="Filter results"] [role=tab]', { hasText: 'Actions' }).click()
    const actions = await visibleTexts(page, '[role=listbox] [role=option]')
    expect(actions.some((t) => /Channels|Usage & Billing|Settings: Updates/.test(t))).toBe(false)
    expect(actions.some((t) => t.startsWith('Chat Settings'))).toBe(true)
    await page.keyboard.press('Escape')
    // CSS 覆盖：info pane 在视口内；Notifications 开关 / Edit agent avatar 屏蔽
    await page.click('button[aria-label="View agent settings"]')
    const pane = page.locator('aside.sand-info-pane[data-open]')
    await expect(pane).toBeInViewport()
    await expect(pane.locator('input[aria-label="Agent name"], [aria-label="Agent name"]').first()).toBeVisible()
    await expect(pane.locator('.sand-agent-settings__card')).toBeHidden()
    await expect(pane.locator('button[aria-label="Edit agent avatar"]')).toHaveCount(0) // 未 ready 时不渲染，ready 时被 CSS 屏蔽
      .catch(async () => expect(pane.locator('button[aria-label="Edit agent avatar"]')).toBeHidden())
    await page.screenshot({ path: join(EVIDENCE, 'info-pane-light.png') })
    // ---- ② 主视图遍历：零死入口 ----
    const dead: string[] = []
    const tested = new Set<string>()
    const report: string[] = []
    for (const [view, open] of Object.entries(VIEWS)) {
      await reset(page)
      await open(page)
      await page.waitForTimeout(600)
      const items = (await clickables(page)).filter((c) => !tested.has(c.key))
      await page.screenshot({ path: join(EVIDENCE, `view-${view.replace(/[^a-z]+/gi, '-')}.png`) })
      for (const item of items) {
        tested.add(item.key)
        // 外链 <a target=_blank href=http…> 由 main setWindowOpenHandler → shell.openExternal 接管：点了会拉起宿主浏览器（沙箱外副作用），不点
        if (item.external) { report.push(`${view}\t${item.key}\tSKIP(外链，main openExternal)`); continue }
        const t0 = Date.now()
        await reset(page)
        await open(page)
        await page.waitForTimeout(600)
        const now = (await clickables(page)).find((c) => c.key === item.key)
        if (now === undefined) { report.push(`${view}\t${item.key}\tSKIP(重开后不在)`); continue }
        const baseline = await arm(page)
        await page.mouse.click(now.x, now.y)
        await page.waitForTimeout(700)
        const effect = await measure(page, baseline)
        const isDead = (effect.mutations === 0 && effect.rpcs.length === 0) || effect.unhandled.length > 0
        report.push(`${view}\t${item.key}\tmut=${effect.mutations}\trpc=${effect.rpcs.join(',')}\tunhandled=${effect.unhandled.join(',')}\t${isDead ? 'DEAD' : 'ok'}\t${Date.now() - t0}ms`)
        if (isDead) dead.push(`${view} :: ${item.key} :: ${JSON.stringify(effect)}`)
      }
    }
    // 暗色静息态证据（隐藏机制与主题无关，截图供 GU 对照）
    await reset(page)
    await page.evaluate(() => (window as unknown as { desktop: { theme: { set(p: string): Promise<unknown> } } }).desktop.theme.set('dark'))
    await page.waitForTimeout(800)
    await page.screenshot({ path: join(EVIDENCE, 'rest-dark.png') })
    writeFileSync(join(EVIDENCE, 'u4-traverse.tsv'), `view\tclickable\teffect\n${report.join('\n')}\n`)
    expect(tested.size).toBeGreaterThan(25)
    expect(dead).toEqual([])
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
