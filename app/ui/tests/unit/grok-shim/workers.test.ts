// P6-15 / P6-16 单测：worker 档位（决策 21）、侧栏预览、主 bot 汇总、合成 section、编排条目 peer 元数据。
// 定稿 work/p6-orchestration/ui/P6-15-16-FINAL.md；E 编号 = UX-1-A §9，圈号 = UX-1-C §11。
import { describe, expect, it } from 'vitest'
import {
  aggregateOf, assignError, assignPeer, endKind, firstLine, orderWorkers, peerFallback, previewOf, rankOf, sectionsOf, viewFacts,
  type WorkerFacts,
} from '../../../renderer-grok/shim/src/workers'
import { askPendingOf, createdByOf } from '../../../renderer-grok/shim/src/data'
import { initView, reduceFollow } from '../../../renderer/session/reduce'

const w = (id: string, over: Partial<WorkerFacts> = {}): WorkerFacts => ({
  id, blockedReason: null, running: false, unread: false, end: null, failure: null, lastText: null, updatedAt: 0, ...over,
})

describe('P6-15 档位（决策 21：审批/提问 > 回合中 > 出错/已停止 > 新结果 > 空闲）', () => {
  const five = {
    blocked: w('b', { blockedReason: 'Allow git push?', running: true }),
    running: w('r', { running: true }),
    failed: w('f', { unread: true, end: 'failed', failure: 'boom' }),
    unread: w('u', { unread: true, end: 'ok', lastText: '18 passed' }),
    done: w('d', { end: 'ok', lastText: 'old' }),
  }
  it('5 档各一例；running + 待决 ask = blocked（C②）', () => {
    expect(Object.values(five).map(rankOf)).toEqual([0, 1, 2, 3, 4])
  })
  it('stopped 未读与 failed 同档；读过的 failed/stopped 进 done（FINAL §1-7）', () => {
    expect(rankOf(w('s', { unread: true, end: 'stopped' }))).toBe(2)
    expect(rankOf(w('s', { end: 'stopped' }))).toBe(4)
    expect(rankOf(w('f', { end: 'failed' }))).toBe(4)
  })
  it('组内次序：rank → updatedAt 降序 → sessionId 稳定平局（C）', () => {
    const order = orderWorkers([five.done, w('u2', { unread: true, end: 'ok', updatedAt: 5 }), five.unread, five.blocked, w('a', { unread: true, end: 'ok', updatedAt: 5 }), five.running])
    expect(order.map((x) => x.id)).toEqual(['b', 'r', 'a', 'u2', 'u', 'd'])
  })
  it('终止原因分类：completed=ok；aborted/interrupted/cancelled=stopped；其余=failed', () => {
    expect(['completed', 'aborted', 'interrupted', 'cancelled', 'error', 'max-tokens', 'blocked'].map(endKind))
      .toEqual(['ok', 'stopped', 'stopped', 'stopped', 'failed', 'failed', 'failed'])
    expect(endKind(null)).toBeNull()
  })
})

describe('P6-15 侧栏预览（不露 JSON / 包装句，首行 ≤80）', () => {
  it('failed → Failed: 首行；stopped → Stopped；有结果 → 结果首行；从未跑过 → Not started yet', () => {
    expect(previewOf(w('f', { end: 'failed', failure: 'boom\nstack' }))).toBe('Failed: boom')
    expect(previewOf(w('s', { end: 'stopped', lastText: 'x' }))).toBe('Stopped')
    expect(previewOf(w('u', { end: 'ok', lastText: '\n\n  18 passed. Fixed 2\nmore' }))).toBe('18 passed. Fixed 2')
    expect(previewOf(w('n'))).toBe('Not started yet')
    expect(previewOf(w('r', { running: true }))).toBe('Working')
  })
  it('超长首行截断到 80 字（含省略号）', () => {
    const line = firstLine('x'.repeat(200))!
    expect(line).toHaveLength(80)
    expect(line.endsWith('…')).toBe(true)
  })
  it('viewFacts：从 follow 视图取终态 / 失败原因 / 最近正文', () => {
    let v = reduceFollow(initView('w'), { type: 'snapshot', header: {}, records: [] })
    const ev = (type: string, data: object) => ({ type: 'event', event: { type, data } })
    v = reduceFollow(v, ev('turn/start', { turn: 1 }))
    v = reduceFollow(v, ev('assistant/message', { turn: 1, step: 1, message: { content: [{ type: 'text', text: 'partial' }] } }))
    v = reduceFollow(v, ev('turn/end', { turn: 1, reason: { kind: 'error', message: 'provider down' } }))
    expect(viewFacts(v)).toEqual({ end: 'failed', failure: 'provider down', lastText: 'partial' })
    expect(viewFacts(undefined)).toEqual({ end: null, failure: null, lastText: null })
  })
})

describe('P6-15 主 bot 汇总（决策 21；E6 / E7 / C③）', () => {
  const name = (id: string) => ({ a: 'Test fixer', b: 'Doc writer' })[id] ?? id
  it('1 个 blocked → 「名: 原因」；2 个 → 「2 workers need you」', () => {
    expect(aggregateOf([w('a', { blockedReason: 'Allow git push origin?' })], name).reason).toBe('Test fixer: Allow git push origin?')
    expect(aggregateOf([w('a', { blockedReason: 'x' }), w('b', { blockedReason: 'y' })], name).reason).toBe('2 workers need you')
  })
  it('未读只来自 rank 2/3 的 worker；处理完最后一个 ask 后 blocked 消失、其他未读保留', () => {
    expect(aggregateOf([w('a', { end: 'ok' })], name)).toEqual({ reason: null, unread: false })
    expect(aggregateOf([w('a', { unread: true, end: 'ok' })], name).unread).toBe(true)
    expect(aggregateOf([w('a', { unread: true, end: 'stopped' })], name).unread).toBe(true)
    const after = aggregateOf([w('a'), w('b', { unread: true, end: 'ok' })], name)
    expect(after).toEqual({ reason: null, unread: true })
  })
})

describe('P6-15 合成 section（E1 / E2 / E11）', () => {
  it('无 worker → null（侧栏走扁平列表，D11⑤ 字节不变）', () => {
    expect(sectionsOf([])).toBeNull()
    expect(sectionsOf([{ creatorId: 'm', workers: [] }])).toBeNull()
  })
  it('每个创建者 main → Workers（rank 0–3，按档位排）→ Done（rank 4）；worker 不进 main 组', () => {
    const s = sectionsOf([{ creatorId: 'm', workers: [w('d', { end: 'ok' }), w('u', { unread: true, end: 'ok' }), w('b', { blockedReason: 'r' })] }])!
    expect(s.map((x) => [x.id, x.name, x.agentIds])).toEqual([
      ['pbots:main:m', '', ['m']],
      ['pbots:workers:m', 'Workers', ['b', 'u']],
      ['pbots:done:m', 'Done', ['d']],
    ])
  })
  it('正打开着的 worker 读完（rank 4）留在 Workers 末尾，离开后才进 Done', () => {
    const ws = [w('d', { end: 'ok' }), w('u', { unread: true, end: 'ok' })]
    expect(sectionsOf([{ creatorId: 'm', workers: ws }], 'd')!.map((x) => x.agentIds)).toEqual([['m'], ['u', 'd'], []])
    expect(sectionsOf([{ creatorId: 'm', workers: ws }], null)!.map((x) => x.agentIds)).toEqual([['m'], ['u'], ['d']])
  })
  it('换主后旧主的 worker 仍挂在旧主名下（按创建者分组）', () => {
    const s = sectionsOf([{ creatorId: 'm2', workers: [w('x')] }, { creatorId: 'm1', workers: [w('y')] }])!
    expect(s.map((x) => x.id)).toEqual(['pbots:main:m2', 'pbots:workers:m2', 'pbots:done:m2', 'pbots:main:m1', 'pbots:workers:m1', 'pbots:done:m1'])
  })
  it('createdByOf：只取 {createdBy:非空串}，自指与坏值丢弃；无 bots 键 → {}', () => {
    expect(createdByOf({ version: 1, mainBotId: 'm', recipes: {} })).toEqual({})
    expect(createdByOf({ bots: { w1: { createdBy: 'm' }, w2: { createdBy: '' }, w3: null, w4: { createdBy: 'w4' }, w5: { createdBy: 3 } } })).toEqual({ w1: 'm' })
  })
})

describe('P6-16 Messaging 行元数据（E12；C⑦）', () => {
  it('create_bot 成功：workerId 取结果 sessionId，名字取实参；预览取 prompt 首行', () => {
    const m = assignPeer({ name: 'create_bot', args: '{"name":"Test fixer","prompt":"Run tests\\nthen fix"}', status: 'done', result: '{"sessionId":"s-1"}' })
    expect(m).toMatchObject({ tool: 'create_bot', status: 'done', workerId: 's-1', name: 'Test fixer', preview: 'Run tests', error: null })
    expect(peerFallback(m)).toBe('Messaging Test fixer')
  })
  it('create_bot 进行中：workerId 未知（不画假链接）；结果是纯文本时按 uuid 认', () => {
    expect(assignPeer({ name: 'create_bot', args: '{"name":"A"}', status: 'running', result: null }).workerId).toBeNull()
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
    expect(assignPeer({ name: 'create_bot', args: '{}', status: 'done', result: `created ${id}` }).workerId).toBe(id)
  })
  it('send_to_bot：目标取实参（botId / bot / sessionId 都认）；名字由覆盖层现查', () => {
    expect(assignPeer({ name: 'send_to_bot', args: '{"botId":"w9","prompt":"again"}', status: 'done', result: 'ok' })).toMatchObject({ tool: 'send_to_bot', workerId: 'w9', name: null })
    expect(assignPeer({ name: 'send_to_bot', args: '{"bot":"w8","message":"m"}', status: 'running', result: null }).workerId).toBe('w8')
  })
  it('无名 → Messaging another assistant；failed → 不可点、文案按错误码（不露原码）', () => {
    expect(peerFallback(assignPeer({ name: 'create_bot', args: '{}', status: 'running', result: null }))).toBe('Messaging another assistant')
    const busy = assignPeer({ name: 'send_to_bot', args: '{"botId":"w","prompt":"p"}', status: 'failed', result: 'pbots/busy: target running' })
    expect(busy.workerId).toBe('w') // send 的目标已知；覆盖层对 failed 不给打开（notice-view target 判定）
    expect(busy.error).toBe('This worker is busy')
    expect(assignError('main-unavailable timeout', 'A')).toBe('Result unknown — check Workers')
    expect(assignError('pbots/forbidden', null)).toBe('Not allowed')
    expect(assignError('pbots/capacity', null)).toBe('Too many workers running')
    expect(assignError('weird\nstack', null)).toBe('weird')
    expect(peerFallback(busy)).toBe("Couldn't message another assistant: This worker is busy")
  })
  it('超长名不截断数据（截断交给 CSS 省略）', () => {
    const long = 'N'.repeat(300)
    expect(assignPeer({ name: 'create_bot', args: JSON.stringify({ name: long }), status: 'running', result: null }).name).toBe(long)
  })
})

describe('P6-16 回报 / 任务回落文本（E19：覆盖层失效仍可读）', () => {
  it('合批回报逐项列出；ask 项写 Needs you', () => {
    const items = [
      { key: 'a1:end', kind: 'end' as const, workerId: 'a', name: 'Test fixer', assignmentId: 'a1', outcome: 'completed' as const, awaiting: null, eventId: null, result: 'ok' },
      { key: 'b1:ask:e', kind: 'ask' as const, workerId: 'b', name: null, assignmentId: 'b1', outcome: null, awaiting: 'approval' as const, eventId: 'e', result: null },
    ]
    expect(peerFallback({ kind: 'report', items })).toBe('Test fixer · Done; Worker · Needs you')
    expect(peerFallback({ kind: 'report', items: [] })).toBe('Worker update')
    expect(peerFallback({ kind: 'task', fromId: 'm', text: '\nRun the suite\nmore' })).toBe('From main bot: Run the suite')
  })
})

describe('GU-P6-15-r1 ②：ask 身份两路都对不上 → 中性，不借用该 worker 当前未决', () => {
  const ev = (type: string, data: object) => ({ type: 'event', event: { type, data } })
  /** w 的视图：ev-1 已答（rejected），ev-2 待答（第二个 ask）。 */
  const answeredThenPending = () => {
    let v = reduceFollow(initView('w'), { type: 'snapshot', header: {}, records: [] })
    v = reduceFollow(v, ev('tool/call', { callId: 'c1', name: 'bash', arguments: '{}' }))
    v = reduceFollow(v, ev('approval/asked', { id: 'ev-1', callId: 'c1' }))
    v = reduceFollow(v, ev('approval/decided', { id: 'ev-1', outcome: 'rejected' }))
    v = reduceFollow(v, ev('tool/call', { callId: 'c2', name: 'bash', arguments: '{}' }))
    return reduceFollow(v, ev('approval/asked', { id: 'ev-2', callId: 'c2' }))
  }
  it('旧 ask 已答、第二个 ask 待答：旧 eventId → false（Answered），新 eventId → true（Needs you）', () => {
    const v = answeredThenPending()
    expect(askPendingOf('w', 'ev-1', new Map(), v)).toBe(false)
    expect(askPendingOf('w', 'ev-2', new Map(), v)).toBe(true)
  })
  it('eventId 两路都对不上 → false（中性），即使该 worker 名下另有未决 ask', () => {
    const asks = new Map([['ev-9', { agentId: 'w' }]]) // 如重启后 $events 丢了旧 id，worker 已有新 ask
    expect(askPendingOf('w', 'ev-gone', asks, answeredThenPending())).toBe(false)
    expect(askPendingOf('w', 'ev-gone', new Map(), undefined)).toBe(false)
  })
  it('$events 一路按 agentId 归属；eventId=null 仍看该 worker 是否有未决', () => {
    expect(askPendingOf('w', 'ev-1', new Map([['ev-1', { agentId: 'w' }]]), undefined)).toBe(true)
    expect(askPendingOf('w', 'ev-1', new Map([['ev-1', { agentId: 'other' }]]), undefined)).toBe(false)
    expect(askPendingOf('w', null, new Map([['ev-9', { agentId: 'w' }]]), undefined)).toBe(true)
    expect(askPendingOf('w', null, new Map([['ev-9', { agentId: 'other' }]]), undefined)).toBe(false)
  })
})

// T73c 四审补：Sol 指出的两场景固化（questions.test 的 rig/dev.testFeedEvent/data.deps 直驱先例）
describe('T73c 待答生命周期（终态过滤+在途回滚）', () => {
  it('① 旧终态不遮新 pending：askPendingOf 对终态 ask 返回 false、新 pending true；factsOf 阻塞判新', () => {
    const asks = new Map([['ev-old', { agentId: 'w', outcome: 'skipped' as const }], ['ev-new', { agentId: 'w' }]])
    expect(askPendingOf('w', 'ev-old', asks)).toBe(false)
    expect(askPendingOf('w', 'ev-new', asks)).toBe(true)
    expect(askPendingOf('w', null, asks)).toBe(true)
  })
})

// T73c 四审补②（Sol 挂点先例 rig/testFeedEvent/deps.resolvePermission 直驱）：
// 在途 follow（approval/decided 先于 $events/result 返回）+ RPC 失败回滚——卡回 pending 且推送恢复。
describe('T73c resolvePermission 在途竞态（真 shim 直驱）', () => {
  it('② follow 先到 + RPC 失败：ask 不被删，回滚后仍 pending（可重试）', async () => {
    const { createShimData } = await import('../../../renderer-grok/shim/src/data')
    const calls: Array<{ method: string; args?: unknown }> = []
    let rpcResult: { ok: boolean } = { ok: false } // RPC 慢且失败
    let rpcPending: Promise<{ ok: boolean }> | null = null
    const api = (method: string, args?: unknown) => {
      calls.push({ method, args })
      if (method === '$events/result') { rpcPending = new Promise((res) => setTimeout(() => res(rpcResult), 40)); return rpcPending }
      if (method === 'session/list') return Promise.resolve({ ok: true, value: { items: [{ sessionId: 's1', projections: { values: { title: 'A' } } }] } })
      return Promise.resolve({ ok: true, value: {} })
    }
    const data = createShimData({ authId: 'auth', api, metaApi: () => Promise.resolve({ ok: true, value: { mainBotId: 's1', recipes: {} } }) })
    const dev = data.dev as unknown as { testFeedEvent(i: unknown): void }
    dev.testFeedEvent({ type: 'waterfall', event: 'approval/request', eventId: 'ev-1', agentId: 's1', request: { callId: 'c1', toolName: 'mcp__server-memory-30e6e77d__create_entities', reason: 'p2sdk policy: connector tools require user approval' } })
    await new Promise((r) => setTimeout(r, 10))
    const resolve = data.deps.resolvePermission as (i: { requestId: string; dshValue: string }) => Promise<void>
    const p = resolve({ requestId: 'ev-1', dshValue: 'rejected' })
    await new Promise((r) => setTimeout(r, 10)) // RPC 在途
    // follow 的 approval/decided 先到（工具已定局）——在途 ask（answering）不可被删
    dev.testFeedEvent({ type: 'event', agentId: 's1', event: { type: 'tool/call', callId: 'c1', name: 'mcp__server-memory-30e6e77d__create_entities', seq: 1, time: Date.now(), data: { status: 'done', decision: { kind: 'deny' } } } })
    await new Promise((r) => setTimeout(r, 10))
    await p.then(() => {}, () => {}) // RPC 失败结算
    await new Promise((r) => setTimeout(r, 10))
    const page = data.deps.openAgentTail('s1') as unknown as { entries?: Array<{ message?: { ask?: { status?: string } } }> }
    const asks = (page.entries ?? []).filter((e) => e.message?.ask !== undefined)
    expect(asks.length, 'ask 保留（失败回滚）').toBe(1)
    expect(asks[0]?.message?.ask?.status, '回滚后投影 pending（卡可重试）').toBe('pending')
  })
})
