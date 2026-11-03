// O1（REVIEW-P4终审）：#11「加载更早」的响应没有绑定 follow 快照版本 —— 断链重连的新快照
// 先到时，迟到的旧分页会拼进新窗口（跳段 + 游标回退，缺口不可补）。修复：view.gen 随每次
// snapshot 重建 +1（reduce.ts），loadOlder 响应到达时 gen 已换代即丢弃该页。
// 本文件经 vi.mock 替换 carrier 层（socket 立即 open、mux.open 返回可控 stream），在 node 下
// 驱动真实 store 全链路：bootSession → openFollow → loadOlder。
import { describe, expect, it, vi } from 'vitest'

interface TestStream { streamId: string; endpoint: string; items: unknown[]; done: boolean }
const h = vi.hoisted(() => ({ streams: [] as TestStream[] }))

vi.mock('../../../renderer/carrier/index', () => ({
  CarrierSocket: class {
    readyState = 1
    constructor(_env: unknown) { void _env }
    addEventListener(type: string, cb: () => void): void { if (type === 'open') cb() } // 立即 open：bootSession 同步建 mux
    send(): void { /* 测试不经 wire */ }
  },
  pageEnv: (): Record<string, never> => ({}),
}))
vi.mock('../../../renderer/carrier/mux', () => ({
  PageMux: class {
    readonly streams = new Map<string, TestStream>()
    constructor(_socket: unknown) { void _socket }
    open(endpoint: string): TestStream {
      const stream: TestStream = { streamId: `s${this.streams.size}`, endpoint, items: [], done: false }
      this.streams.set(stream.streamId, stream)
      h.streams.push(stream)
      return stream
    }
    cancel(stream: { done: boolean }): void { stream.done = true }
  },
  newDevSocket: (): never => { throw new Error('unused in this test') },
}))

import { getState, loadOlder, startStore } from '../../../renderer/shell/store'

const msg = (seq: number, text: string): unknown => ({
  type: 'event', event: { type: 'user/message', seq, data: { source: { kind: 'user' }, id: `u${seq}`, content: [{ type: 'text', text }] } },
})
/** 一条 follow snapshot 帧：records 携带 seq（firstSeqOf / beforeSeq 游标）。 */
const snap = (seqs: number[]): unknown => ({
  type: 'snapshot', header: {}, hasMore: true, projections: {},
  records: seqs.map((seq) => msg(seq, `m${seq}`)),
})
/** #11 分页响应（wire 壳 {value:{records,hasMore}}）。 */
const page = (seqs: number[]): { ok: true; value: { records: unknown[]; hasMore: boolean } } => ({
  ok: true, value: { records: seqs.map((seq) => msg(seq, `old${seq}`)), hasMore: true },
})

const until = async (cond: () => boolean, ms = 3_000): Promise<void> => {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout waiting for store state')
    await new Promise((r) => setTimeout(r, 25))
  }
}

describe('O1：#11 分页响应绑定 follow 快照代号', () => {
  it('迟到分页到达时快照已换代（重连重建窗口）→ 丢弃该页：firstSeq 不回退、不 prepend', async () => {
    // 挂起中的 session/events 响应（第一窗口发出的「加载更早」）
    let resolveEvents: ((v: { ok: true; value: { records: unknown[]; hasMore: boolean } }) => void) | undefined
    ;(globalThis as { window?: unknown }).window = {
      pbots: {
        api: (method: string): unknown => {
          if (method === 'session/list') {
            return Promise.resolve({ ok: true, value: { items: [{ sessionId: 's1', running: false, updatedAt: 1 }] } })
          }
          if (method === 'session/events') {
            return new Promise((resolve) => { resolveEvents = resolve })
          }
          return Promise.resolve({ ok: true, value: {} })
        },
        botsMeta: () => Promise.resolve({ ok: true, value: { version: 1, mainBotId: 's1', recipes: {} } }),
      },
    }
    startStore()
    await until(() => getState().boot === 'ready')
    const follow = h.streams.find((s) => s.endpoint === 'session/follow')
    expect(follow).toBeDefined()

    // 窗口 1：seq 61..64（gen 1）
    follow!.items.push(snap([61, 62, 63, 64]))
    await until(() => getState().views.s1?.loaded === true)
    expect(getState().views.s1?.gen).toBe(1)
    expect(getState().views.s1?.firstSeq).toBe(61)

    // 发起「加载更早」（对窗口 1 的 firstSeq=61）→ 响应挂起
    const older = loadOlder('s1')
    await until(() => getState().views.s1?.older.phase === 'loading')
    expect(resolveEvents).toBeDefined()

    // 断链重连：follow 重挂，新快照窗口 seq 71..74（gen 2）
    follow!.items.push(snap([71, 72, 73, 74]))
    await until(() => getState().views.s1?.firstSeq === 71)
    expect(getState().views.s1?.gen).toBe(2)
    const itemsAfterSnapshot = getState().views.s1?.items.length

    // 旧分页（seq 21..24，还带 hasMore）此刻才返回
    resolveEvents!(page([21, 22, 23, 24]))
    await older
    await new Promise((r) => setTimeout(r, 120)) // 让丢弃路径的后续 tick 走完

    const v = getState().views.s1!
    expect(v.firstSeq).toBe(71) // 修复前：firstSeq 回退到 21（旧页照拼新窗口）
    expect(v.items.length).toBe(itemsAfterSnapshot) // 修复前：prepend 旧页 4 条
    expect(v.items.some((i) => i.kind === 'user' && i.text === 'old21')).toBe(false)
    expect(v.older.phase).toBe('idle') // 新快照已重置；旧页不再覆盖
  }, 15_000)
})
