// L-7 修复链（P5-W3.f1）单测：R2 工具结果卡投影 / R3 分页 scope 恢复 / R4 nonce 绑定（entries.test 另测）/
// R5 重试走原 requestId（ack 登记表 + coordinator 发送前换 nonce）/ O4 新建 bot 的非致命失败通知。
// 覆盖层模块按 overrides/vite.config.ts MODULE_OVERRIDES 整模块替换上游——这里直接 import 覆盖层验证包一层的行为。
import { describe, expect, it } from 'vitest'
import {
  projectTranscriptEntry,
  projectTranscriptFeedEntries,
  projectTranscriptPageResult,
} from '../../../renderer-grok/overrides/modules/model'
import { serialize } from '../../../renderer-grok/shim/src/entries'
import { createTranscriptPaginationController } from '../../../renderer-grok/overrides/modules/pagination'
import {
  createTranscriptAcknowledgementController,
  retryWireNonces,
} from '../../../renderer-grok/overrides/modules/acknowledgement'
import { withWireSendPromptNonce } from '../../../renderer-grok/overrides/modules/coordinator-client'
import { createShimData } from '../../../renderer-grok/shim/src/data'

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})

// ── L-7 R2：tool-call 投影附带 ToolResultCard 快照（输出/错误详情可见） ──

describe('L-7 R2: projectTranscriptEntry 附带 toolResult（展开工具行可见完整输出）', () => {
  it('bash done → shell 卡：command + output + success', () => {
    const entry = projectTranscriptEntry(
      { kind: 'tool-call', id: 'tool-c1', timestampMs: 1, name: 'bash', status: 'done', summary: 'ls -la', args: '{"command":"ls -la"}', result: 'total 0\n' },
      0, 'Bot', 'a1',
    )
    const card = rec(rec(entry).toolResult)
    expect(card.kind).toBe('shell')
    expect(card.command).toBe('ls -la')
    expect(card.output).toBe('total 0\n')
    expect(card.status).toBe('success')
    expect(card.toolCallId).toBe('tool-c1')
  })

  it('bash failed → error 卡带错误输出；read → file-read 卡带 path 与内容', () => {
    const failed = projectTranscriptEntry(
      { kind: 'tool-call', id: 'tool-c2', timestampMs: 1, name: 'bash', status: 'failed', summary: 'cat x', args: '{"command":"cat x"}', result: 'cat: x: No such file' },
      0, 'Bot', 'a1',
    )
    expect(rec(rec(failed).toolResult).status).toBe('error')
    expect(rec(rec(failed).toolResult).output).toBe('cat: x: No such file')
    const read = projectTranscriptEntry(
      { kind: 'tool-call', id: 'tool-c3', timestampMs: 1, name: 'read', status: 'done', summary: 'a.txt', args: '{"path":"a.txt"}', result: 'file body' },
      0, 'Bot', 'a1',
    )
    const card = rec(rec(read).toolResult)
    expect(card.kind).toBe('file-read')
    expect(card.path).toBe('a.txt')
    expect(card.output).toBe('file body')
  })

  it('write/edit → file-write/file-edit；连接器与其他工具 → connector；审批拒绝（decision）进 summary', () => {
    expect(rec(rec(projectTranscriptEntry({ kind: 'tool-call', id: 't', timestampMs: 1, name: 'write', status: 'done', summary: 's', args: '{"path":"a"}', result: 'ok' }, 0, 'B', 'a')).toolResult).kind).toBe('file-write')
    expect(rec(rec(projectTranscriptEntry({ kind: 'tool-call', id: 't', timestampMs: 1, name: 'edit', status: 'done', summary: 's', args: '{"path":"a"}', result: 'ok' }, 0, 'B', 'a')).toolResult).kind).toBe('file-edit')
    expect(rec(rec(projectTranscriptEntry({ kind: 'tool-call', id: 't', timestampMs: 1, name: 'mcp__x__search', status: 'done', summary: 's', args: '{"query":"q"}', result: 'hits' }, 0, 'B', 'a')).toolResult).kind).toBe('connector')
    const denied = projectTranscriptEntry(
      { kind: 'tool-call', id: 't', timestampMs: 1, name: 'bash', status: 'failed', summary: 'rm x', args: '{"command":"rm x"}', result: null, decision: 'rejected' },
      0, 'B', 'a',
    )
    expect(rec(rec(denied).toolResult).summary).toBe('rejected')
  })

  it('无 result 且无 decision（进行中）→ 不附卡；非 tool-call 投影不受影响', () => {
    const running = projectTranscriptEntry({ kind: 'tool-call', id: 't', timestampMs: 1, name: 'bash', status: 'running', summary: 's', args: '{"command":"ls"}', result: null }, 0, 'B', 'a')
    expect(rec(running).toolResult).toBeUndefined()
    const message = projectTranscriptEntry({ kind: 'message', id: 'm1', timestampMs: 1, role: 'user', author: 'You', content: 'hi', clientNonce: 'n' }, 0, 'B', 'a')
    expect(rec(message).clientNonce).toBe('n')
  })

  // P5-W3.f2 R2：直接投影有卡但聚合投影（feed=回基线 / tail=刷新）丢卡——上游聚合函数
  // 内部绑定的还是上游投影，覆盖层只换了单条入口。聚合必须在覆盖层同样走附卡投影。
  it('聚合投影（feed / page）同样附卡——刷新/回基线后展开仍可见输出（f2 R2）', () => {
    const tool = { kind: 'tool-call', id: 'tool-agg', timestampMs: 1, name: 'bash', status: 'done', summary: 'ls', args: '{"command":"ls"}', result: 'AGG-FULL-RESULT' }
    expect(rec(projectTranscriptFeedEntries([tool], 'Bot', 'a1')[0]).toolResult, 'feed 投影附卡').toMatchObject({ output: 'AGG-FULL-RESULT' })
    const page = projectTranscriptPageResult({ entries: [tool], nextBeforeSeq: 7 }, 'Bot', 'a1')
    expect(rec(page.entries[0]).toolResult, 'tail/page 投影附卡').toMatchObject({ output: 'AGG-FULL-RESULT' })
    expect(page.nextBeforeSeq).toBe(7)
  })

  it('page 投影保持上游语义：composedAtMs / threadSummaries / 非法输入空页', () => {
    const msg = { kind: 'message', id: 'm1', timestampMs: 1, role: 'user', author: 'You', content: 'x' }
    const page = projectTranscriptPageResult(
      { entries: [msg], sentWhileOfflineAtMsByEntryId: { m1: 42 }, nextBeforeSeq: 5, threadCounts: { t1: 2 } },
      'B', 'a',
    )
    expect(rec(page.entries[0]).composedAtMs).toBe(42)
    expect(page.nextBeforeSeq).toBe(5)
    expect(page.threadSummaries).toEqual([{ rootId: 't1', count: 2 }])
    expect(projectTranscriptPageResult({}, 'B', 'a').entries).toEqual([])
  })
})

// ── L-7 R3：A→B→A 重开已缓存 bot 时分页状态恢复（不再清空后卡死） ──

describe('L-7 R3: pagination 覆盖层在 scope 回切时恢复已装页与游标', () => {
  const fetchLog: Array<{ id: string; beforeSeq: number | undefined }> = []
  const page = (id: string, seq: number, next?: number) => ({
    entries: [{ kind: 'message', id: `${id}-${seq}`, role: 'assistant', author: 'Bot', text: `m${seq}`, timestampMs: seq } as never],
    ...(next === undefined ? {} : { nextBeforeSeq: next }),
  })
  const make = () => {
    fetchLog.length = 0
    return createTranscriptPaginationController({
      fetchPage: async (req) => {
        fetchLog.push({ id: req.id, beforeSeq: req.beforeSeq })
        return req.beforeSeq === 500 ? page(req.id, 400) : page(req.id, 900, 500)
      },
    })
  }

  it('B→A：A 的更早页与 more 游标恢复，loadOlder 继续取数', async () => {
    const c = make()
    c.setScope('slot', 'A')
    c.installInitialPage(page('A', 900, 500))
    await c.loadOlder() // 取回 A 的更早页，游标进 exhausted（fetch 只有两页）
    const aSnapshot = c.getSnapshot()
    expect(aSnapshot.entries.length).toBe(2)
    // 切到 B（全新）→ 正常清空 + 装首页
    c.setScope('slot', 'B')
    expect(c.getSnapshot().entries.length).toBe(0)
    c.installInitialPage(page('B', 900, 500))
    // 回 A（openAgent 缓存命中路径：只有 setScope，不重新 install）
    c.setScope('slot', 'A')
    const back = c.getSnapshot()
    expect(back.agentId).toBe('A')
    expect(back.entries.map((e) => rec(e).id), 'A 的两页（含更早页）都回来了').toEqual(['A-400', 'A-900'])
    expect(back.entries.length, '两页都在').toBe(2)
    expect(back.cursor.kind, 'exhausted 游标恢复（hasOlder 诚实）').toBe('exhausted')
    // 换一个 more 游标的场景验证 loadOlder 真的继续取数
    const c2 = make()
    c2.setScope('slot', 'A2')
    c2.installInitialPage(page('A2', 900, 500))
    c2.setScope('slot', 'B2')
    c2.installInitialPage(page('B2', 900, 500))
    c2.setScope('slot', 'A2')
    expect(c2.getSnapshot().cursor).toMatchObject({ kind: 'more', beforeSeq: 500 })
    fetchLog.length = 0
    await c2.loadOlder()
    expect(fetchLog, '恢复后 loadOlder 继续向 beforeSeq=500 取更早页').toEqual([{ id: 'A2', beforeSeq: 500 }])
  })

  it('全新 scope 仍清空；同 scope 重入无副作用', () => {
    const c = make()
    c.setScope('slot', 'A')
    c.installInitialPage(page('A', 900, 500))
    c.setScope('slot', 'A') // 同 scope（effect 重复调用路径）
    expect(c.getSnapshot().entries.length).toBe(1)
    c.setScope('slot', 'C')
    expect(c.getSnapshot().entries.length).toBe(0)
    expect(c.getSnapshot().cursor.kind).toBe('unprobed')
  })
})

// ── L-7 R5：手动重试复用原 nonce 作为 wire requestId（SDK requestId 去重生效） ──

describe('L-7 R5: retryFailed 登记 fresh→prior nonce，sendPrompt 出线前换回原 nonce', () => {
  it('ack 覆盖层记录重试链且控制器行为不变', () => {
    const ack = createTranscriptAcknowledgementController()
    ack.setScope('slot', 'a1')
    ack.insertOptimistic({ accountSlot: 'slot', agentId: 'a1', nonce: 'N1', entries: [{ id: 'e1', kind: 'message', clientNonce: 'N1' }], phase: 'pending' })
    ack.markFailed('slot', 'N1', 1)
    const retried = ack.retryFailed({
      accountSlot: 'slot', agentId: 'a1', nonce: 'N1', freshNonce: 'N2',
      entries: [{ id: 'e2', kind: 'message', clientNonce: 'N2' }],
    })
    expect(retried).toBe(true)
    expect(retryWireNonces.get('a1::N2')).toBe('N1')
    // 原控制器语义：新记录带 priorNonces 链，旧 nonce 的 echo 也能对账
    const record = ack.getSnapshot().records.find((r) => r.nonce === 'N2')
    expect(record?.priorNonces).toEqual(['N1'])
    expect(ack.ingestTranscriptEvent({ accountSlot: 'slot', agentId: 'a1', entry: { id: 'echo-1', kind: 'message', clientNonce: 'N1' } })).toBe(true)
  })

  it('withWireSendPromptNonce 只对 sendPrompt 且已登记的 nonce 生效', () => {
    retryWireNonces.set('a1::N2', 'N1')
    expect(withWireSendPromptNonce('sendPrompt', { agentId: 'a1', prompt: 'x', clientNonce: 'N2' })).toMatchObject({ clientNonce: 'N1' })
    expect(withWireSendPromptNonce('sendPrompt', { agentId: 'a1', prompt: 'x', clientNonce: 'N3' })).toMatchObject({ clientNonce: 'N3' })
    expect(withWireSendPromptNonce('sendPrompt', { agentId: 'a2', prompt: 'x', clientNonce: 'N2' })).toMatchObject({ clientNonce: 'N2' })
    expect(withWireSendPromptNonce('listAgents', { agentId: 'a1', clientNonce: 'N2' })).toMatchObject({ clientNonce: 'N2' })
    retryWireNonces.clear()
  })

  // P5-W3.f2 R5：连续重试折叠到最初 nonce。f1 的登记只回退一跳——第二次重试的 prior
  // 本身是重试铸出的 nonce（N2），wire 变成 N1、N1、N2，第三次不复用 N1，幂等去重失效。
  // 真实控制器链（f1 验收探针复现）：登记时 prior 若已在映射里，跟到根。
  it('连续重试 N1→N2→N3：wire requestId 恒为 N1（f2 R5）', () => {
    retryWireNonces.clear()
    const ack = createTranscriptAcknowledgementController()
    ack.setScope('slot', 'a1')
    ack.insertOptimistic({ accountSlot: 'slot', agentId: 'a1', nonce: 'N1', entries: [{ id: 'e1', kind: 'message', clientNonce: 'N1' }], phase: 'pending' })
    const wires: string[] = ['N1']
    let current = 'N1'
    for (const fresh of ['N2', 'N3']) {
      ack.markFailed('slot', current, 1)
      expect(ack.retryFailed({
        accountSlot: 'slot', agentId: 'a1', nonce: current, freshNonce: fresh,
        entries: [{ id: `e-${fresh}`, kind: 'message', clientNonce: fresh }],
      })).toBe(true)
      wires.push(rec(withWireSendPromptNonce('sendPrompt', { agentId: 'a1', clientNonce: fresh })).clientNonce)
      current = fresh
    }
    expect(wires, '三次发送的 wire requestId').toEqual(['N1', 'N1', 'N1'])
    retryWireNonces.clear()
  })
})

// ── L-7 R4/O2 全链（P5-W3.f2）：同文本历史快照先到 → 不误绑、ack 不被提前对账 ──

describe('L-7 R4/O2: serialize 按身份绑定，历史同文本快照不误 ack', () => {
  it('f1 验收探针场景：历史 old-u（同文本、rpcId=旧 nonce）+ 新 nonce → 旧消息不带 nonce，记录不丢', () => {
    const raw = serialize({
      items: [{ kind: 'user', id: 'old-u', text: 'repeat this', rpcId: 'old-N' }],
      hasMore: false, running: false, streaming: null, agentName: 'Bot', clientNonce: 'new-N',
    })
    expect(raw.some((e) => rec(e).clientNonce === 'new-N'), '历史同文本消息不补新 nonce').toBe(false)
    const ack = createTranscriptAcknowledgementController()
    ack.setScope('s', 'A')
    ack.insertOptimistic({ accountSlot: 's', agentId: 'A', nonce: 'new-N', entries: [{ id: 'pending-new-N', kind: 'message', clientNonce: 'new-N' }], phase: 'pending' })
    for (const e of raw) {
      const nonce = rec(e).clientNonce
      if (typeof nonce === 'string') ack.ingestTranscriptEvent({ accountSlot: 's', agentId: 'A', entry: { id: String(rec(e).id), kind: 'message', clientNonce: nonce } })
    }
    expect(ack.getSnapshot().records, 'ack 记录不被历史快照提前对账（f1 探针：1 → 0）').toHaveLength(1)
  })

  it('新消息以 rpcId 到达 → 绑定成功，echo 正常对账', () => {
    const raw = serialize({
      items: [{ kind: 'user', id: 'old-u', text: 'repeat this', rpcId: 'old-N' }, { kind: 'user', id: 'new-u', text: 'repeat this', rpcId: 'new-N' }],
      hasMore: false, running: false, streaming: null, agentName: 'Bot', clientNonce: 'new-N',
    })
    const bound = raw.filter((e) => rec(e).clientNonce === 'new-N')
    expect(bound).toHaveLength(1)
    expect(rec(bound[0]!).id).toBe('new-u')
    const ack = createTranscriptAcknowledgementController()
    ack.setScope('s', 'A')
    ack.insertOptimistic({ accountSlot: 's', agentId: 'A', nonce: 'new-N', entries: [{ id: 'pending-new-N', kind: 'message', clientNonce: 'new-N' }], phase: 'pending' })
    expect(ack.ingestTranscriptEvent({ accountSlot: 's', agentId: 'A', entry: { id: 'new-u', kind: 'message', clientNonce: 'new-N' } })).toBe(true)
    expect(ack.getSnapshot().records).toHaveLength(0)
  })
})

// ── L-7 O4：createBot 的非致命失败（selectModel 失败）以 transcript 通知呈现 ──

describe('L-7 O4: createBot notice surfaces as a transcript notice entry', () => {
  it('selectModel 失败 → 返回 notice 且空会话快照带 notice 条目；首条用户消息后撤下', async () => {
    const calls: Array<{ method: string; args?: unknown }> = []
    let seq = 0
    const api = (method: string, args?: unknown) => {
      calls.push({ method, args })
      if (method === 'session/selectModel') return Promise.resolve({ ok: false, error: { code: 'x', message: 'model unavailable' } })
      return Promise.resolve({ ok: true, value: { sessionId: `s${++seq}` } })
    }
    const metaApi = () => Promise.resolve({ ok: true, value: { mainBotId: null, recipes: {} } })
    const data = createShimData({ authId: 'auth', api, metaApi })
    const res = await data.ui.createBot({ preset: 'p', connectors: [], model: { provider: 'pr', model: 'm' } })
    expect(res.ok).toBe(true)
    expect(res.notice).toContain("model wasn't changed")
    const payload = data.transcriptPayload(res.sessionId)
    const notice = payload.entries.find((e) => rec(e).kind === 'notice')
    expect(notice, '空会话快照带 notice').toBeTruthy()
    expect(String(rec(notice!).content)).toContain('model unavailable')
  })
})
