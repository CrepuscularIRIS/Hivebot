// T40：dsh user-questions → widget 卡 → 攒批作答（工单验收 1 ①–⑦）——经 coordinator 真链
import { afterEach, describe, expect, it } from 'vitest'
import { createShimData } from '../../../renderer-grok/shim/src/data'
import { toWidget, toAnswer, SKIP_SENTINEL } from '../../../renderer-grok/shim/src/questions'

// pageEnv 需要 window（CarrierSocket 的宿主桥）——node 环境下 stub 成最小桌面桥
let restoreWindow: (() => void) | null = null
afterEach(() => { if (restoreWindow !== null) { restoreWindow(); restoreWindow = null } })
const stubWindow = (): void => {
  const orig = (globalThis as { window?: unknown }).window
  ;(globalThis as { window?: unknown }).window = {
    localStorage: { getItem: () => null, setItem: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    postMessage: () => {},
  }
  restoreWindow = () => { (globalThis as { window?: unknown }).window = orig }
}

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})

function rig() {
  const calls: Array<{ method: string; args?: unknown }> = []
  const results = new Map<string, { ok: boolean }>()
  const api = (method: string, args?: unknown) => {
    calls.push({ method, args })
    if (method === 'session/list') return Promise.resolve({ ok: true, value: { items: [{ sessionId: 's1', projections: { values: { title: 'A' } } }] } })
    if (method === '$events/result') {
      const injected = results.get('$events/result')
      if (injected !== undefined) results.delete('$events/result')
      return Promise.resolve(injected ?? { ok: true })
    }
    return Promise.resolve({ ok: true, value: { sessionId: 's-new' } })
  }
  const metaApi = () => Promise.resolve({ ok: true, value: { mainBotId: 's1', recipes: {} } })
  const data = createShimData({ authId: 'auth', api, metaApi })
  return { data, calls, failNext: () => results.set('$events/result', { ok: false }) }
}

const REQ1 = { type: 'waterfall', event: 'user-questions/request', eventId: 'ev1', agentId: 's1', request: { questions: [
  { id: 'q1', question: 'Proceed?', header: 'Confirm', options: [{ label: 'Yes (Recommended)' }, { label: 'No' }] },
] } }
const REQ2 = { type: 'waterfall', event: 'user-questions/request', eventId: 'ev2', agentId: 's1', request: { questions: [
  { id: 'qa', question: 'Color?', options: [{ label: 'Red' }, { label: 'Blue' }] },
  { id: 'qb', question: 'Note?', options: [] },
] } }

/** 注入事件（dev.testFeedEvent——单测环境无 carrier socket，直灌 onEventsItem）。 */
async function feed(data: ReturnType<typeof rig>['data'], item: unknown): Promise<void> {
  ;(data.dev as unknown as { testFeedEvent(i: unknown): void }).testFeedEvent(item)
  await new Promise((r) => setTimeout(r, 10))
}

/** transcript 拉尾（deps.openAgentTail——卡在 entriesOf 拼装层；不经 socket）。 */
async function tail(data: ReturnType<typeof rig>['data'], id = 's1'): Promise<Record<string, unknown>[]> {
  const page = data.deps.openAgentTail(id)
  return (rec(page).entries ?? []) as Record<string, unknown>[]
}
/** coordinator request（createCoordinatorServer 不便单件起——经 deps 的 respondToWidget/dismissWidget 直调）。 */
const widgetApi = (data: ReturnType<typeof rig>['data']) => ({
  respondToWidget: (args: { entryId: string; value: string; agentId: string }) => (data.deps as unknown as { respondToWidget(a: typeof args): Promise<unknown> }).respondToWidget(args),
  dismissWidget: (args: { entryId: string; agentId: string }) => (data.deps as unknown as { dismissWidget(a: typeof args): Promise<void> }).dismissWidget(args),
})

const widgetEntries = (es: Record<string, unknown>[]): Record<string, unknown>[] => es.filter((e) => rec(rec(e).message).type === 'widget')
const widgetOf = (es: Record<string, unknown>[], id: string): Record<string, unknown> => rec(es.find((e) => e.id === id))

describe('T40 提问卡', () => {
  it('① waterfall → transcript 恰 1 条 widget entry（prompt/options 逐字/allowCustom/helpText）', async () => {
    const { data } = rig()
    data.wire({ agents: () => {}, transcript: () => {} })
    await feed(data, REQ1)
    const es = await tail(data)
    const ws = widgetEntries(es)
    expect(ws).toHaveLength(1)
    const w = rec(rec(ws[0]).message).widget
    expect(rec(w).prompt).toBe('Proceed?')
    expect(rec(w).helpText).toBe('Confirm')
    expect((rec(w).options as Array<Record<string, unknown>>).map((o) => o.label)).toEqual(['Yes (Recommended)', 'No'])
    expect(rec(w).allowCustom).toBe(true)
  })
  it('② 点选项 → 恰 1 次 $events/result、outcome 逐字', async () => {
    const { data, calls } = rig()
    data.wire({ agents: () => {}, transcript: () => {} })
    await feed(data, REQ1)
    const co = widgetApi(data)
    const res = await co.respondToWidget({ entryId: 'q-ev1-q1', value: 'No', agentId: 's1' }).then((v) => v, (e) => ({ ok: false, error: { message: String(e) } }))
    expect(rec(res).ok !== false, '作答成功').toBe(true)
    expect(rec(res).accepted, 'adapter 契约 accepted:true').toBe(true)
    const sent = calls.filter((c) => c.method === '$events/result')
    expect(sent).toHaveLength(1)
    expect(rec(sent[0]!.args).outcome).toEqual({ kind: 'result', value: { answers: [{ id: 'q1', selected: ['No'] }] } })
  })
  it('③ 两题一批：第 1 题答后 0 次发送+卡带 respondedValue；第 2 题 dismiss 后恰 1 次（题序）', async () => {
    const { data, calls } = rig()
    data.wire({ agents: () => {}, transcript: () => {} })
    await feed(data, REQ2)
    const co = widgetApi(data)
    await co.respondToWidget({ entryId: 'q-ev2-qa', value: 'Blue', agentId: 's1' })
    expect(calls.filter((c) => c.method === '$events/result')).toHaveLength(0)
    const es = await tail(data)
    expect(widgetOf(es, 'q-ev2-qa').respondedValue, '顶层 respondedValue（0.18 契约）').toBe('Blue')
    await co.dismissWidget({ entryId: 'q-ev2-qb', agentId: 's1' })
    const sent = calls.filter((c) => c.method === '$events/result')
    expect(sent).toHaveLength(1)
    expect(rec(sent[0]!.args).outcome).toEqual({ kind: 'result', value: { answers: [{ id: 'qa', selected: ['Blue'] }, { id: 'qb', selected: [] }] } })
  })
  it('④ 自定义输入不命中 → {selected:[], custom}', async () => {
    const { data, calls } = rig()
    data.wire({ agents: () => {}, transcript: () => {} })
    await feed(data, REQ1)
    const co = widgetApi(data)
    await co.respondToWidget({ entryId: 'q-ev1-q1', value: 'blue please', agentId: 's1' })
    const sent = calls.filter((c) => c.method === '$events/result')
    expect(rec(sent[0]!.args).outcome).toEqual({ kind: 'result', value: { answers: [{ id: 'q1', selected: [], custom: 'blue please' }] } })
  })
  it('⑤ 0 选项题：卡 options 恰 1 项（Skip 哨兵），点它 → selected:[] 无 custom', async () => {
    const { data, calls } = rig()
    data.wire({ agents: () => {}, transcript: () => {} })
    await feed(data, REQ2)
    const es = await tail(data)
    const w = rec(rec(widgetOf(es, 'q-ev2-qb')).message).widget
    const opts = rec(w).options as Array<Record<string, unknown>>
    expect(opts).toHaveLength(1)
    expect(opts[0]!.value).toBe(SKIP_SENTINEL)
    const co = widgetApi(data)
    await co.respondToWidget({ entryId: 'q-ev2-qb', value: SKIP_SENTINEL, agentId: 's1' })
    await co.respondToWidget({ entryId: 'q-ev2-qa', value: 'Red', agentId: 's1' })
    const sent = calls.filter((c) => c.method === '$events/result')
    const answers = rec(rec(rec(sent[0]!.args).outcome).value).answers as Array<Record<string, unknown>>
    const qb = answers.find((a) => a.id === 'qb')!
    expect(qb.selected).toEqual([])
    expect(qb.custom).toBeUndefined()
  })
  it('⑥ cancel 收卡：widgetDismissed；再作答回失败不触发 api', async () => {
    const { data, calls } = rig()
    data.wire({ agents: () => {}, transcript: () => {} })
    await feed(data, REQ1)
    await feed(data, { type: 'cancel', eventId: 'ev1' })
    const es = await tail(data)
    expect(widgetOf(es, 'q-ev1-q1').widgetDismissed, '顶层 widgetDismissed').toBe(true)
    const co = widgetApi(data)
    const res = await co.respondToWidget({ entryId: 'q-ev1-q1', value: 'No', agentId: 's1' }).then((v) => v, (e) => ({ ok: false }))
    expect(rec(res).ok, 'dismissed 批作答失败').toBe(false)
    expect(calls.filter((c) => c.method === '$events/result')).toHaveLength(0)
  })
  it('⑦ M1 失败不吞：卡回可作答（无 respondedValue）', async () => {
    const { data, calls, failNext } = rig()
    data.wire({ agents: () => {}, transcript: () => {} })
    await feed(data, REQ1)
    failNext()
    const co = widgetApi(data)
    const res = await co.respondToWidget({ entryId: 'q-ev1-q1', value: 'No', agentId: 's1' }).then((v) => v, (e) => ({ ok: false }))
    expect(rec(res).ok, 'M1 失败上抛').toBe(false)
    const es = await tail(data)
    expect(widgetOf(es, 'q-ev1-q1').respondedValue, '卡回可作答').toBeUndefined()
  })
  it('review 高：qid 含连字符（uuid 形）——entryId 不拆串，路由正确', async () => {
    const { data, calls } = rig()
    data.wire({ agents: () => {}, transcript: () => {} })
    await feed(data, { type: 'waterfall', event: 'user-questions/request', eventId: 'ev-hyphen', agentId: 's1', request: { questions: [
      { id: 'color-choice', question: 'Pick?', options: [{ label: 'A' }, { label: 'B' }] },
    ] } })
    const es = await tail(data)
    expect(widgetEntries(es)).toHaveLength(1)
    expect(widgetEntries(es)[0]!.id).toBe('q-ev-hyphen-color-choice')
    const co = widgetApi(data)
    const res = await co.respondToWidget({ entryId: 'q-ev-hyphen-color-choice', value: 'B', agentId: 's1' }).then((v) => v, (e) => ({ ok: false }))
    expect(rec(res).accepted).toBe(true)
    const sent = calls.filter((c) => c.method === '$events/result')
    expect(rec(sent[0]!.args).outcome).toEqual({ kind: 'result', value: { answers: [{ id: 'color-choice', selected: ['B'] }] } })
  })
  it('review 中3：先 dismiss qa 再答 qb——qa 是空 selected 非 custom 哨兵；用户输入 "__dismissed__" 文本仍是 custom', async () => {
    const { data, calls } = rig()
    data.wire({ agents: () => {}, transcript: () => {} })
    await feed(data, REQ2)
    const co = widgetApi(data)
    await co.dismissWidget({ entryId: 'q-ev2-qa', agentId: 's1' })
    await co.respondToWidget({ entryId: 'q-ev2-qb', value: '__dismissed__', agentId: 's1' })
    const sent = calls.filter((c) => c.method === '$events/result')
    const answers = rec(rec(rec(sent[0]!.args).outcome).value).answers as Array<Record<string, unknown>>
    expect(answers.find((a) => a.id === 'qa')).toEqual({ id: 'qa', selected: [] }) // dismiss=跳过
    expect(answers.find((a) => a.id === 'qb')).toEqual({ id: 'qb', selected: [], custom: '__dismissed__' }) // 用户真输入
  })
  it('review 中4：dismiss 末题 M1 失败——回滚+上抛', async () => {
    const { data, calls, failNext } = rig()
    data.wire({ agents: () => {}, transcript: () => {} })
    await feed(data, REQ2)
    const co = widgetApi(data)
    await co.respondToWidget({ entryId: 'q-ev2-qa', value: 'Red', agentId: 's1' })
    failNext()
    const res = await co.dismissWidget({ entryId: 'q-ev2-qb', agentId: 's1' }).then((v) => v, (e) => ({ ok: false }))
    expect(rec(res).ok, 'dismiss 失败上抛').toBe(false)
    const es = await tail(data)
    expect(widgetOf(es, 'q-ev2-qb').respondedValue, 'dismiss 回滚').toBeUndefined()
    // 失败后批未 sent——重新 dismiss（无注入）应成功补发
    const res2 = await co.dismissWidget({ entryId: 'q-ev2-qb', agentId: 's1' }).then((v) => v, (e) => ({ ok: false }))
    expect(rec(res2).accepted, '重试 dismiss 成功（回包 accepted）').toBe(true)
    const sent = calls.filter((c) => c.method === '$events/result')
    expect(rec(sent.at(-1)!.args).outcome).toEqual({ kind: 'result', value: { answers: [{ id: 'qa', selected: ['Red'] }, { id: 'qb', selected: [] }] } })
  })
it('T40b 单题 dismiss：卡关且不弹回', async () => {
    const { data, calls } = rig()
    data.wire({ agents: () => {}, transcript: () => {} })
    await feed(data, REQ2)
    const co = widgetApi(data)
    await co.dismissWidget({ entryId: 'q-ev2-qb', agentId: 's1' })
    let es = await tail(data)
    const qb = widgetOf(es, 'q-ev2-qb')
    expect(qb.widgetDismissed, '单题 dismiss 卡关').toBe(true)
    expect(qb.respondedValue).toBeUndefined()
    await co.respondToWidget({ entryId: 'q-ev2-qa', value: 'Red', agentId: 's1' })
    es = await tail(data)
    expect(widgetOf(es, 'q-ev2-qb').widgetDismissed, '后续推送后仍 dismissed').toBe(true)
    expect(widgetOf(es, 'q-ev2-qa').respondedValue).toBe('Red')
    const sent = calls.filter((c) => c.method === '$events/result')
    expect(rec(rec(rec(sent[0]!.args).outcome).value).answers).toEqual([{ id: 'qa', selected: ['Red'] }, { id: 'qb', selected: [] }])
  })
    it('⑫ T40b：dismiss/作答回包 {accepted:true}（deps 面——coordinator 面另经 coordinator.test 端口）', async () => {
    const { data } = rig()
    data.wire({ agents: () => {}, transcript: () => {} })
    await feed(data, REQ2)
    const co = widgetApi(data)
    const d = await co.dismissWidget({ entryId: 'q-ev2-qa', agentId: 's1' }).then((v) => v, (e) => ({ ok: false }))
    expect(rec(d).accepted).toBe(true)
    const r = await co.respondToWidget({ entryId: 'q-ev2-qb', value: 'Blue', agentId: 's1' }).then((v) => v, (e) => ({ ok: false }))
    expect(rec(r).accepted).toBe(true)
  })
  it('纯函数：toWidget 0 选项补 Skip / >6 截断 / multiSelect 降级；toAnswer label 命中', () => {
    const w0 = toWidget({ id: 'x', question: 'Q' })
    expect(w0.options).toEqual([{ label: 'Skip', value: SKIP_SENTINEL }])
    const w7 = toWidget({ id: 'x', question: 'Q', options: Array.from({ length: 8 }, (_, i) => ({ label: `o${i}` })) })
    expect(w7.options).toHaveLength(6)
    const wm = toWidget({ id: 'x', question: 'Q', multiSelect: true, options: [{ label: 'A' }, { label: 'B' }] })
    expect(wm.options.map((o) => o.label)).toEqual(['A', 'B']) // 单选降级（回执记）
    const a = toAnswer('x', { id: 'x', prompt: '', options: [{ label: 'A' }], allowCustom: true }, 'A')
    expect(a).toEqual({ id: 'x', selected: ['A'] })
  })
})
