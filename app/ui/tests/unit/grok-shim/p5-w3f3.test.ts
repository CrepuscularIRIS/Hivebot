// L-8 修复链（P5-W3.f3）单测：R2 args=JSON null 的投影守卫 + feed/page 聚合
// per-entry 隔离（单条坏实参不再整页挂）/ R3 审批决定不遮蔽完整输出（summary 仅
// result 为空时回落 decision）。路径与 p5-w3f1.test.ts 相同：直接 import 覆盖层。
import { describe, expect, it } from 'vitest'
import {
  projectTranscriptEntry,
  projectTranscriptFeedEntries,
  projectTranscriptPageResult,
} from '../../../renderer-grok/overrides/modules/model'

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})

// ── L-8 R2：args 是合法 JSON 的 null（模型实参，不可信 wire 输入）不得让投影抛异常 ──

describe('L-8 R2: args that are legal JSON null must not crash the tool-result card', () => {
  it("args='null' + failed result → card attached with the error output, no throw", () => {
    // L-8 verifier 复现形状：parseArguments 对 'null' 不报错（合法 JSON），tool body
    // 抛「args must be an object」类错误 → tool/result 非空 + status failed。
    const entry = projectTranscriptEntry(
      { kind: 'tool-call', id: 't-null', timestampMs: 1, name: 'bash', status: 'failed', summary: 'rm x', args: 'null', result: 'Error: args must be an object' },
      0, 'Bot', 'a1',
    )
    expect(entry).not.toBeNull()
    const card = rec(rec(entry).toolResult)
    expect(card.output).toBe('Error: args must be an object')
    expect(card.command, 'args 非对象 → 无 command 可取，不断言崩溃').toBeNull()
  })

  it("other non-object JSON ('[1,2]', '\"str\"', '123') stays safe", () => {
    for (const args of ['[1,2]', '"str"', '123']) {
      const entry = projectTranscriptEntry(
        { kind: 'tool-call', id: 't', timestampMs: 1, name: 'bash', status: 'done', summary: 'x', args, result: 'OUT' },
        0, 'Bot', 'a1',
      )
      expect(rec(rec(entry).toolResult).output, `args=${args}`).toBe('OUT')
    }
  })

  it('one poisoned entry does not kill the feed/page aggregate (per-entry isolation)', () => {
    const good = (id: string) => ({ kind: 'tool-call', id, timestampMs: 1, name: 'bash', status: 'done', summary: 'ls', args: '{"command":"ls"}', result: 'OK' })
    // 坏法一：args 读取即抛（腐化/敌意持久化数据）——上游投影不读 args，仍可投影。
    const poisonArgs = { kind: 'tool-call', id: 'poison-args', timestampMs: 2, name: 'bash', status: 'done', summary: 'x', result: 'R' }
    Object.defineProperty(poisonArgs, 'args', { enumerable: true, get() { throw new Error('poison args read') } })
    // 坏法二：连上游投影都抛（kind 读取即抛）——聚合层跳过该条。
    const poisonKind = { id: 'poison-kind', timestampMs: 3, summary: 'x' }
    Object.defineProperty(poisonKind, 'kind', { enumerable: true, get() { throw new Error('poison kind read') } })

    const feed = projectTranscriptFeedEntries([good('g1'), poisonArgs, poisonKind, good('g2')], 'Bot', 'a1')
    expect(feed.map((e) => rec(e).id), '附卡失败的条目退回无卡投影（行仍可见），上游投影抛错的条目跳过').toEqual(['g1', 'poison-args', 'g2'])
    expect(rec(feed[0]).toolResult, '好条目仍附卡').toMatchObject({ output: 'OK' })
    expect(rec(feed[1]).toolResult).toBeUndefined()

    const page = projectTranscriptPageResult({ entries: [good('g1'), poisonKind, good('g2')], nextBeforeSeq: 5 }, 'Bot', 'a1')
    expect(page.entries.map((e) => rec(e).id), 'page 聚合同样隔离，其余条目与游标不受影响').toEqual(['g1', 'g2'])
    expect(page.nextBeforeSeq).toBe(5)
  })
})

// ── L-8 R3：成功审批决定不得写进优先 summary 遮住完整输出 ──

describe('L-8 R3: an approval decision must not shadow the tool output', () => {
  it("decision='allowed-once' with a result → summary empty so view renders output (detail = summary || diff || output)", () => {
    const entry = projectTranscriptEntry(
      { kind: 'tool-call', id: 't-ap', timestampMs: 1, name: 'bash', status: 'done', summary: 'curl', args: '{"command":"curl example.com"}', result: 'FULL STDOUT OUTPUT', decision: 'allowed-once' },
      0, 'Bot', 'a1',
    )
    const card = rec(rec(entry).toolResult)
    expect(card.summary).toBe('')
    expect(card.output).toBe('FULL STDOUT OUTPUT')
    expect(String(card.summary || card.diff || card.output), 'view.tsx detail 取值看到全文而非 allowed-once').toBe('FULL STDOUT OUTPUT')
  })

  it("decision='rejected' with no result keeps the decision as summary (denial reason stays visible)", () => {
    const entry = projectTranscriptEntry(
      { kind: 'tool-call', id: 't-dn', timestampMs: 1, name: 'bash', status: 'failed', summary: 'rm x', args: '{"command":"rm x"}', result: null, decision: 'rejected' },
      0, 'Bot', 'a1',
    )
    expect(rec(rec(entry).toolResult).summary).toBe('rejected')
  })
})
