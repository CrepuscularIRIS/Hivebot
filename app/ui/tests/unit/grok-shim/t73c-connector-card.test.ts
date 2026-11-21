// @vitest-environment happy-dom
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// T73c 连接器审批卡单测（工单边界 2 五格）：三钮形态/Always 时序（先 remember 后
// resolve）/remember 失败不作答可重试/Allow once·Skip·Esc 映射/非 mcp 卡零变化。
// mock：pbots-ui 的 api（M1 桥）、shim data 的 noteConnectorAlways、recovered view 的
// resolveLocalToolPermissionAction（保留其余导出）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from '../../../renderer-grok/node_modules/react'
import { createRoot, type Root } from '../../../renderer-grok/node_modules/react-dom/client'
import { act } from '../../../renderer-grok/node_modules/react'

const rememberCalls: Array<unknown> = []
const resolveCalls: Array<unknown> = []
const order: string[] = []

vi.mock('../../../renderer-grok/overrides/modules/pbots-ui', () => ({
  api: vi.fn(async (method: string, args: unknown) => {
    order.push(method)
    rememberCalls.push(args)
    if (method === 'p2sdk/connector_grants_remember') return { ok: true }
    return { ok: true }
  }),
}))
vi.mock('../../../renderer-grok/shim/src/data', () => ({
  noteConnectorAlways: vi.fn((eventId: string) => { order.push(`note:${eventId}`) }),
}))
vi.mock('../../../renderer-grok/frontend/src/recovered/features/permissions/local-tool/view', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../../renderer-grok/frontend/src/recovered/features/permissions/local-tool/view')>()
  return {
    ...orig,
    resolveLocalToolPermissionAction: vi.fn(async ({ resolution }: { resolution: string }) => {
      order.push(`resolve:${resolution}`)
      resolveCalls.push(resolution)
    }),
  }
})

import { LocalToolPermissionPrompt } from '../../../renderer-grok/overrides/modules/local-tool-view'

const connectorAsk = { requestId: 'ev-1', status: 'pending' as const, action: { kind: 'run-command' as const, command: 'mcp__server-memory-30e6e77d__create_entities' }, connector: { serverName: 'server-memory-30e6e77d', displayName: 'Memory' } }
const bashAsk = { requestId: 'ev-2', status: 'pending' as const, action: { kind: 'run-command' as const, command: 'pip install x' } }
const noopStore = { noteReconnect: () => { /* 组件 useEffect 探活 */ } } as never
const noopResolve = (() => { /* 卡经 resolveLocalToolPermissionAction，不走这个 prop 的真实现 */ }) as never

let root: Root | null = null
let container: HTMLElement | null = null
const render = (props: Record<string, unknown>): HTMLElement => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => { root!.render(createElement(LocalToolPermissionPrompt as never, { store: noopStore, resolveLocalToolPermission: noopResolve, transportState: 'connected', ...props } as never)) })
  return container
}
const click = (el: Element | null): void => { act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true })) }) }

beforeEach(() => { rememberCalls.length = 0; resolveCalls.length = 0; order.length = 0; vi.clearAllMocks() })
afterEach(async () => { await act(async () => { root?.unmount() }); container?.remove(); root = null; container = null })

describe('T73c 连接器审批卡', () => {
  it('① 三钮（Always allow 主钮在前/Allow once/Skip）、无下拉、无 Team/account 字样、标题 Allow {名}', () => {
    const el = render({ entryId: 'e1', ask: connectorAsk, agentId: 'session-bot-1', isEscapeTarget: true })
    const btns = [...el.querySelectorAll('button')].map((b) => b.textContent ?? '').filter((t) => t.trim() !== '')
    expect(btns, '三钮俱在（关闭钮 icon-only 文本为空不计）').toEqual(expect.arrayContaining(['Always allow', 'Allow once', 'Skip']))
    expect(btns.indexOf('Always allow')).toBeLessThan(btns.indexOf('Allow once'))
    expect(btns.indexOf('Allow once')).toBeLessThan(btns.indexOf('Skip'))
    expect(el.querySelector('select')).toBeNull()
    const text = el.textContent ?? ''
    expect(text).not.toMatch(/team|account/i)
    expect(text).toContain('Allow Memory')
  })

  it('② Always allow：remember（{request:{botId,serverName}}）先于 resolve，resolution=always', async () => {
    const el = render({ entryId: 'e1', ask: connectorAsk, agentId: 'session-bot-1' })
    click(el.querySelector('button[data-always]'))
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
    expect(rememberCalls[0]).toEqual({ request: { botId: 'session-bot-1', serverName: 'server-memory-30e6e77d' } })
    expect(order).toEqual(['p2sdk/connector_grants_remember', 'note:ev-1', 'resolve:always'])
  })

  it('③ remember 失败：resolve 计数 0、出现重试文案、按钮恢复可点（再点可成）', async () => {
    const { api } = await import('../../../renderer-grok/overrides/modules/pbots-ui')
    vi.mocked(api).mockRejectedValueOnce(new Error('refused') as never)
    const el = render({ entryId: 'e1', ask: connectorAsk, agentId: 'session-bot-1' })
    click(el.querySelector('button[data-always]'))
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
    expect(resolveCalls).toHaveLength(0)
    expect(el.textContent).toContain("didn't go through")
    const always = el.querySelector('button[data-always]') as HTMLButtonElement
    expect(always.disabled, '失败后按钮可再点').toBe(false)
    click(always)
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
    expect(resolveCalls).toEqual(['always'])
  })

  it('③b remember 返回 ok:false（非异常）同样不作答可重试（审补）', async () => {
    const { api } = await import('../../../renderer-grok/overrides/modules/pbots-ui')
    vi.mocked(api).mockResolvedValueOnce({ ok: false } as never)
    const el = render({ entryId: 'e1', ask: connectorAsk, agentId: 'session-bot-1' })
    click(el.querySelector('button[data-always]'))
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
    expect(resolveCalls).toHaveLength(0)
    expect(el.textContent).toContain("didn't go through")
    expect((el.querySelector('button[data-always]') as HTMLButtonElement).disabled).toBe(false)
  })

  it('④ Allow once / Skip / Esc → allow-once / deny / deny，remember 计数 0', async () => {
    const el = render({ entryId: 'e1', ask: connectorAsk, agentId: 'session-bot-1', isEscapeTarget: true })
    const labels = [...el.querySelectorAll('button')].map((b) => b.textContent ?? '')
    click(el.querySelectorAll('button')[labels.indexOf('Allow once')])
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
    expect(resolveCalls).toEqual(['allow-once'])
    expect(rememberCalls).toHaveLength(0)
    resolveCalls.length = 0
    const el2 = render({ entryId: 'e1b', ask: { ...connectorAsk, requestId: 'ev-1b' }, agentId: 'session-bot-1' })
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
    expect(resolveCalls).toEqual(['deny'])
    expect(rememberCalls).toHaveLength(0)
    // Skip 钮同值（视觉钮）——独立渲染验
    resolveCalls.length = 0
    const el3 = render({ entryId: 'e1c', ask: { ...connectorAsk, requestId: 'ev-1c' }, agentId: 'session-bot-1' })
    const labels3 = [...el3.querySelectorAll('button')].map((b) => b.textContent ?? '')
    click(el3.querySelectorAll('button')[labels3.indexOf('Skip')])
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
    expect(resolveCalls).toEqual(['deny'])
  })

  it('⑤ 非 mcp 卡（无 connector）：仍 Allow once / Deny once 两钮', () => {
    const el = render({ entryId: 'e2', ask: bashAsk, agentId: 'session-bot-1', isEscapeTarget: true })
    const btns = [...el.querySelectorAll('button')].map((b) => b.textContent ?? '').filter((t) => t.trim() !== '')
    expect(btns).toEqual(expect.arrayContaining(['Allow once', 'Deny once']))
    expect(btns, '非 mcp 卡无 Always/Skip').not.toContain('Always allow')
    expect(el.querySelector('[data-connector-card]')).toBeNull()
  })
})


describe('T73c 连接器卡终态回显（组件 !pending 分支直测——e2e 层推送链不压 DOM 断言）', () => {
  const outcomeLine = (status: string): string => {
    const el = render({ entryId: 'e9', ask: { ...connectorAsk, status }, agentId: 'session-bot-1' })
    return el.textContent ?? ''
  }
  it('⑥ always → Allowed … for your messages to this Bot.', () => {
    expect(outcomeLine('always')).toContain('Allowed Memory for your messages to this Bot.')
  })
  it('⑦ allow-once → Allowed … once；skipped → Skipped …', () => {
    expect(outcomeLine('allow-once')).toContain('Allowed Memory once')
    expect(outcomeLine('skipped')).toContain('Skipped Memory')
  })
  it('⑧ 非 mcp 终态文案不变（零回归）', () => {
    const el = render({ entryId: 'e10', ask: { ...bashAsk, status: 'allow-once' }, agentId: 'session-bot-1' })
    expect(el.textContent).toContain('can run commands on your computer this time')
  })
})
