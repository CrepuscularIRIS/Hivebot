// U-16 集成单测：main 常驻 $events 订阅随每代 socket 开启（不依赖 renderer 端口），
// waterfall 喂 ledger、ready 只进 deadline（不覆盖 M1 校验用的 renderer clientId），
// 断挂满 deadline 后 main 以自己订阅的 clientId 经本连接代答（gateway 同 Peer 校验，
// dsh-api-gateway 0.2.2-alpha.2 lib/index.js:991-1013：clientId 必须是 active client）。
// backend.received 跨测试累积：各测试用 baseline 切片只看自己产生的帧。
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', async () => {
  const { makeChannelPair } = await import('./support')
  return {
    MessageChannelMain: class {
      constructor(): unknown { return makeChannelPair() }
    },
  }
})

import { fakeDsh, fakeEvent, pagePort, startMuxBackend, type MuxBackend } from './support'
import { registerM2Mux } from '../../../main/m2-mux'

let backend: MuxBackend

beforeAll(async () => { backend = await startMuxBackend() })
afterAll(async () => { await backend.stop() })

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** baseline 之后 main 常驻 $events 流的 open 帧（endpoint $events；无 port 参与）。 */
function mainEventsOpens(baseline: number): Array<{ streamId: string }> {
  return backend.received
    .slice(baseline)
    .filter((f) => f.type === 'open' && f.endpoint === '$events') as Array<{ streamId: string }>
}

const waterfallItem = (eventId: string) => ({
  type: 'item' as const,
  value: { type: 'waterfall', event: 'approval/request', eventId, agentId: 'ag-1', request: { toolName: 'bash' } },
})

describe('U-16 main 常驻 $events 订阅 + deadline 代答（集成）', () => {
  it('① 无任何 renderer 端口时也常驻订阅；waterfall 进 ledger、ready 不进；断挂满 deadline → 以 main 自己的 clientId 代答 rejected 恰好 1 次；gateway cancel 下账', async () => {
    const baseline = backend.received.length
    const dsh = fakeDsh()
    const m2 = registerM2Mux({ dsh: dsh.conn, deadlineMs: 150, deadlineTickMs: 20 })
    const socket = await backend.open()
    dsh.setLive(socket)
    await sleep(80) // boot 常驻循环：wire + open $events（无端口转交也发生）

    const opens = mainEventsOpens(baseline)
    expect(opens).toHaveLength(1)
    expect(opens[0]).toMatchObject({ endpoint: '$events' })
    const sid = opens[0].streamId

    backend.send({ type: 'item', streamId: sid, value: { type: 'ready', clientId: 'main-c1' } })
    backend.send({ ...waterfallItem('ev-m'), streamId: sid })
    await sleep(60)
    expect(m2.ledger.pendingEvents().map((e) => e.eventId)).toEqual(['ev-m'])
    expect(m2.ledger.readyClientId).toBe(undefined) // main 的 ready 不进台账：readyClientId 归 renderer（M1 §2.2 校验源）

    await sleep(600) // > deadline 150ms + tick
    expect(dsh.rpcCalls).toEqual([{
      method: '$events/result',
      args: { clientId: 'main-c1', eventId: 'ev-m', outcome: { kind: 'result', value: 'rejected' } },
    }])
    expect(m2.stats.deadline.answers).toBe(1)
    expect(m2.stats.deadline.answeredEvents).toEqual(['ev-m'])
    expect(m2.ledger.pendingEvents()).toEqual([]) // 作答成功即下账

    // gateway 再向 main 订阅推 cancel 帧（其余被 deliver 方路径）→ 幂等，不复活、不重发
    backend.send({ type: 'item', streamId: sid, value: { type: 'cancel', eventId: 'ev-m' } })
    await sleep(60)
    expect(m2.ledger.pendingEvents()).toEqual([])
    await sleep(300)
    expect(dsh.rpcCalls).toHaveLength(1) // 恰好 1 次
    socket.close()
  })

  it('① socket 断开重连后新一代上重开 $events 并用新 clientId 代答（常驻跨代）', async () => {
    const baseline = backend.received.length
    const dsh = fakeDsh()
    registerM2Mux({ dsh: dsh.conn, deadlineMs: 150, deadlineTickMs: 20, pollMs: 10 })
    const socket1 = await backend.open()
    dsh.setLive(socket1)
    await sleep(80)
    expect(mainEventsOpens(baseline)).toHaveLength(1)

    backend.terminateAll() // socket 死亡 → 常驻循环等下一代
    const socket2 = await backend.open()
    dsh.setLive(socket2)
    await sleep(200) // 轮询间隔 + wire
    const opens = mainEventsOpens(baseline)
    expect(opens).toHaveLength(2) // 新一代 socket 上重开（gateway 对新 client 补发未决）

    const sid2 = opens[1].streamId
    backend.send({ type: 'item', streamId: sid2, value: { type: 'ready', clientId: 'main-c2' } })
    backend.send({ ...waterfallItem('ev-r'), streamId: sid2 })
    await sleep(600)
    expect(dsh.rpcCalls).toEqual([{
      method: '$events/result',
      args: { clientId: 'main-c2', eventId: 'ev-r', outcome: { kind: 'result', value: 'rejected' } },
    }])
    socket2.close()
  })

  it('② renderer $events 端口挂载期间不代答（用户在场）', async () => {
    const baseline = backend.received.length
    const dsh = fakeDsh()
    const m2 = registerM2Mux({ dsh: dsh.conn, deadlineMs: 150, deadlineTickMs: 20 })
    const socket = await backend.open()
    dsh.setLive(socket)
    await sleep(80)
    const sid = mainEventsOpens(baseline)[0].streamId
    backend.send({ type: 'item', streamId: sid, value: { type: 'ready', clientId: 'main-c3' } })
    backend.send({ ...waterfallItem('ev-g'), streamId: sid })
    // renderer 经 port 开自己的 $events（挂载）
    const { event, posts } = fakeEvent()
    m2(event, { requestId: 'grace' })
    await sleep(50)
    const port = pagePort(posts)
    port.postMessage(JSON.stringify({ type: 'open', streamId: 'page-ev', endpoint: '$events', payload: { args: {} } }))
    await sleep(60)
    expect(m2.ledger.pendingEvents().map((e) => e.eventId)).toEqual(['ev-g'])

    await sleep(500) // 远超 deadline：挂载中不代答
    expect(dsh.rpcCalls).toEqual([])
    expect(m2.stats.deadline.answers).toBe(0)
    socket.close()
  })
})
