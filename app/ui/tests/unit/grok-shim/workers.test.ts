// P6-15 / P6-16 单测：worker 档位（决策 21）、侧栏预览、主 bot 汇总、合成 section、编排条目 peer 元数据。
// 定稿 work/p6-orchestration/ui/P6-15-16-FINAL.md；E 编号 = UX-1-A §9，圈号 = UX-1-C §11。
import { describe, expect, it } from 'vitest'
import {
  aggregateOf, assignError, assignPeer, endKind, firstLine, orderWorkers, peerFallback, previewOf, rankOf, sectionsOf, viewFacts,
  type WorkerFacts,
} from '../../../renderer-grok/shim/src/workers'
import { createdByOf } from '../../../renderer-grok/shim/src/data'
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
