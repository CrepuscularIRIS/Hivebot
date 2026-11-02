// U-16 D4③ 无人应答 deadline 单测（假时钟，PLAN U-16 ①）：
// 未决 eventId 且无 $events 端口挂载满 deadline → main 以自己的常驻订阅 clientId 代答
// value 'rejected' 恰好 1 次；deadline 前重新挂端口 → 计数 0；只会代答 'rejected'。
// 依据：work/p4-ui/PLAN.md U-16、work/p4-ui/spike-data.md S5（上游 300s 零终态）。
import { describe, expect, it } from 'vitest'
import type { ConnectionRpcResult } from '../../../main/dsh/connect'
import { EventsLedger } from '../../../main/dsh/ledger'
import { APPROVAL_DEADLINE_DEFAULT_MS, createApprovalDeadline } from '../../../main/m2-mux/deadline'

interface RpcCall { method: string; args: unknown }

function makeDsh(results: Array<ConnectionRpcResult | Error> = []): {
  dsh: { rpc(method: string, args: unknown): Promise<ConnectionRpcResult> }
  calls: RpcCall[]
} {
  const calls: RpcCall[] = []
  return {
    calls,
    dsh: {
      rpc: async (method: string, args: unknown): Promise<ConnectionRpcResult> => {
        calls.push({ method, args })
        const next = results.shift()
        if (next instanceof Error) return { ok: false, error: { code: 'pbots/upstream', message: next.message, details: {} } }
        return next ?? { ok: true, value: undefined }
      },
    },
  }
}

const waterfall = (eventId: string) => ({
  type: 'waterfall' as const,
  event: 'approval/request',
  eventId,
  agentId: 'ag-1',
  request: { toolName: 'bash' },
})

/** 假时钟驱动的被测组件：手动 review()，nowMs 由测试拨动。 */
function setup(opts: { mounted?: boolean; clientId?: string | undefined; deadlineMs?: number } = {}) {
  const ledger = new EventsLedger()
  const { dsh, calls } = makeDsh()
  let mounted = opts.mounted ?? false
  let clientId = opts.clientId === undefined ? 'main-c1' : opts.clientId
  let nowMs = 0
  const dl = createApprovalDeadline({
    dsh,
    ledger,
    isPortMounted: () => mounted,
    mainClientId: () => clientId,
    deadlineMs: opts.deadlineMs ?? 1_000,
    now: () => nowMs,
    log: () => { /* 静默 */ },
  })
  return {
    dl, ledger, calls,
    review: () => dl.review(),
    set mounted(v: boolean) { mounted = v },
    set clientId(v: string | undefined) { clientId = v },
    advance(ms: number): void { nowMs += ms; dl.review() },
    get now(): number { return nowMs },
  }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('U-16 审批无人应答 deadline（假时钟）', () => {
  it('① 未决且未挂载满 deadline → 以 main 常驻订阅 clientId 代答 rejected 恰好 1 次；gateway cancel 到达后下账', async () => {
    const s = setup({ deadlineMs: 2_000 })
    s.ledger.record(waterfall('ev-1'))
    s.review() // t=0：开始观察窗口
    // ③ 观察窗口可证伪（前半）：deadline 内无终态、不作答，pending 持续存在
    s.advance(1_999)
    expect(s.calls).toEqual([])
    expect(s.ledger.pendingEvents().map((e) => e.eventId)).toEqual(['ev-1'])

    s.advance(1) // t=2_000 到期
    await flush()
    expect(s.calls).toEqual([{
      method: '$events/result',
      args: { clientId: 'main-c1', eventId: 'ev-1', outcome: { kind: 'result', value: 'rejected' } },
    }])
    expect(s.dl.stats.answers).toBe(1)
    expect(s.dl.stats.answeredEvents).toEqual(['ev-1'])

    // 恰好 1 次：后续轮次不再发
    s.advance(10_000)
    s.review()
    await flush()
    expect(s.calls).toHaveLength(1)

    // 作答成功即下账（作答方收不到自己的 cancel 帧；gateway 后续再推 cancel 时 record 幂等）
    expect(s.ledger.pendingEvents()).toEqual([])
    s.ledger.record({ type: 'cancel', eventId: 'ev-1' }) // 幂等：不抛、不复活
    expect(s.ledger.pendingEvents()).toEqual([])
  })

  it('① deadline 前重新挂端口 → 计数 === 0；窗口按重新失联的时点重新起算', async () => {
    const s = setup({ deadlineMs: 2_000 })
    s.ledger.record(waterfall('ev-2'))
    s.review()                       // t=0 失联开始
    s.advance(1_500)
    s.mounted = true                 // 窗口内 renderer 重连接手
    s.advance(499)
    s.review()
    expect(s.calls).toEqual([])      // 挂载即清零（宽限）

    s.mounted = false                // 再次失联：新窗口从现在起算
    s.review()                       // t=1_999 记新起点
    s.advance(1_999)
    s.review()
    expect(s.calls).toEqual([])      // t=3_998 < 1_999+2_000，仍不发
    s.advance(2)
    s.review()
    await flush()
    expect(s.calls).toHaveLength(1)  // t=4_000 恰到期
  })

  it('② 挂载期间（用户在场）永不代答，即使远超 deadline', async () => {
    const s = setup({ mounted: true, deadlineMs: 1_000 })
    s.ledger.record(waterfall('ev-3'))
    for (let i = 0; i < 10; i++) { s.advance(1_000) }
    await flush()
    expect(s.calls).toEqual([])
    expect(s.dl.stats.answers).toBe(0)
  })

  it('main 常驻订阅未 ready（clientId undefined）→ 不发；ready 后下一轮补发', async () => {
    const s = setup({ clientId: undefined, deadlineMs: 1_000 })
    s.ledger.record(waterfall('ev-4'))
    s.advance(5_000)
    expect(s.calls).toEqual([])      // 无可用 clientId：等待，不盲发
    s.clientId = 'main-late'
    s.advance(1_000)                 // 窗口起点在 t=5000，t=6000 到期
    await flush()
    expect(s.calls).toHaveLength(1)
    expect((s.calls[0].args as { clientId: string }).clientId).toBe('main-late')
  })

  it('rpc 失败不计成功并允许后续轮重试；成功后停止', async () => {
    const ledger = new EventsLedger()
    const calls: RpcCall[] = []
    let fail = true
    let nowMs = 0
    const dl = createApprovalDeadline({
      dsh: {
        rpc: async (method: string, args: unknown): Promise<ConnectionRpcResult> => {
          calls.push({ method, args })
          return fail
            ? { ok: false, error: { code: 'pbots/upstream', message: 'socket dead', details: {} } }
            : { ok: true, value: undefined }
        },
      },
      ledger,
      isPortMounted: () => false,
      mainClientId: () => 'main-c1',
      deadlineMs: 1_000,
      now: () => nowMs,
      log: () => { /* 静默 */ },
    })
    ledger.record(waterfall('ev-5'))
    dl.review() // t=0：起算
    nowMs = 1_000
    dl.review()
    await flush()
    expect(calls).toHaveLength(1)
    expect(dl.stats.answers).toBe(0) // 失败不计
    dl.review()
    await flush()
    expect(calls).toHaveLength(2)    // 重试（已过期，每轮满足时限）
    fail = false
    dl.review()
    await flush()
    expect(calls).toHaveLength(3)
    expect(dl.stats.answers).toBe(1)
    dl.review()
    await flush()
    expect(calls).toHaveLength(3)    // 成功后恰好 1 次成功，不再发
  })

  it('默认 deadline = 2×10s（BRIEF D4③：观察窗口 2×已知超时）', () => {
    expect(APPROVAL_DEADLINE_DEFAULT_MS).toBe(20_000)
  })
})
