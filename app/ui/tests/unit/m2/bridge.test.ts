// M2 端口转交桥单测：C §2.3 时序（转交/失败/10s 超时/断线清理）+ streamId 归属 (a)(b)(c)
// + endpoint 白名单 + ipc 来源校验 + ledger/tap 计数。真 DshMuxSocket + 本地 ws 后端 + 注入端口对。
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', async () => {
  const { makeChannelPair } = await import('./support')
  return {
    MessageChannelMain: class {
      constructor(): unknown { return makeChannelPair() }
    },
  }
})

import { fakeDsh, fakeEvent, pagePort, startMuxBackend, type MuxBackend, type FakePort, type RecordedPost } from './support'
import { registerM2Mux, type M2Handler } from '../../../main/m2-mux'
import type { MuxFrame } from '../../../main/dsh/socket'

let backend: MuxBackend

beforeAll(async () => { backend = await startMuxBackend() })
afterAll(async () => { await backend.stop() })

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 页面侧发帧（JSON 文本，C §2.3 W.send(text)）。 */
const send = (port: FakePort, frame: Record<string, unknown>): void => { port.postMessage(JSON.stringify(frame)) }

/** 收满 n 条下行帧到 port2（页面侧视角，已按文本协议解析）；立即 start。 */
function collect(port: FakePort, n: number, ms = 2000): { promise: Promise<unknown[]> } {
  const out: unknown[] = []
  const promise = new Promise<unknown[]>((resolve) => {
    const timer = setTimeout(() => resolve(out), ms)
    port.on('message', (e) => {
      out.push(typeof e.data === 'string' ? JSON.parse(e.data as string) : e.data)
      if (out.length >= n) { clearTimeout(timer); resolve(out) }
    })
  })
  port.start()
  return { promise }
}

/** 单请求转交：真 socket 就绪后受理一个 requestId，返回双方句柄。 */
async function drive(requestId = 'req-1'): Promise<{
  m2: M2Handler
  dsh: FakeDsh
  posts: RecordedPost[]
  port2: FakePort
  socket: import('../../../main/dsh/socket').DshMuxSocket
}> {
  const dsh = fakeDsh()
  const m2 = registerM2Mux({ dsh: dsh.conn })
  const socket = await backend.open()
  dsh.setLive(socket)
  const { event, posts } = fakeEvent()
  m2(event, { requestId })
  await sleep(50)
  return { m2, dsh, posts, port2: pagePort(posts), socket }
}

describe('M2 端口转交（C §2.3 时序）', () => {
  it('① 成功转交：postMessage {ok:true} 带 port2；上下行原帧直通', async () => {
    const { posts, port2, socket } = await drive('req-A')
    expect(posts).toHaveLength(1)
    expect(posts[0].channel).toBe('pbots:mux-port')
    expect(posts[0].payload).toEqual({ requestId: 'req-A', ok: true })
    expect(posts[0].ports).toHaveLength(1)

    const sink = collect(port2, 2)
    await sleep(20)
    send(port2, { type: 'open', streamId: 'sid-1', endpoint: '$events', payload: { args: {} } })
    await sleep(20)
    backend.send({ type: 'item', streamId: 'sid-1', value: { type: 'ready', clientId: 'c1' } })
    backend.send({ type: 'end', streamId: 'sid-1' })
    expect(await sink.promise).toEqual([
      { type: 'item', streamId: 'sid-1', value: { type: 'ready', clientId: 'c1' } },
      { type: 'end', streamId: 'sid-1' },
    ])
    // U-16 起 wire 时 main 常驻自开一条 $events（随机 streamId）：opens 全集不再恰一条，
    // 按流断言——port 的 sid-1 原样直通恰一次 + main 常驻 $events 开帧恰一次（payload {args:{}}）。
    expect(backend.received.filter((f) => f.type === 'open' && f.streamId === 'sid-1')).toEqual([
      { type: 'open', streamId: 'sid-1', endpoint: '$events', payload: { args: {} } },
    ] as MuxFrame[])
    const mainOpens = backend.received.filter((f) => f.type === 'open' && f.endpoint === '$events' && f.streamId !== 'sid-1')
    expect(mainOpens).toHaveLength(1)
    expect(mainOpens[0].payload).toEqual({ args: {} })
    socket.close()
  })

  it('① 两个并发 requestId 各回不同帧，不串线', async () => {
    const dsh = fakeDsh()
    const m2 = registerM2Mux({ dsh: dsh.conn })
    const socket = await backend.open()
    dsh.setLive(socket)
    const a = fakeEvent()
    const b = fakeEvent()
    m2(a.event, { requestId: 'rA' })
    m2(b.event, { requestId: 'rB' })
    await sleep(50)
    expect(a.posts[0].payload).toEqual({ requestId: 'rA', ok: true })
    expect(b.posts[0].payload).toEqual({ requestId: 'rB', ok: true })
    const portA = a.posts[0].ports[0] as FakePort
    const portB = b.posts[0].ports[0] as FakePort
    expect(portA).not.toBe(portB)

    const sinkA = collect(portA, 1)
    const sinkB = collect(portB, 1)
    await sleep(20)
    send(portA, { type: 'open', streamId: 'sA', endpoint: '$events', payload: { args: {} } })
    send(portB, { type: 'open', streamId: 'sB', endpoint: 'session/follow', payload: { args: { request: 1 } } })
    await sleep(20)
    backend.send({ type: 'item', streamId: 'sA', value: 'for-A' })
    backend.send({ type: 'item', streamId: 'sB', value: 'for-B' })
    expect(await sinkA.promise).toEqual([{ type: 'item', streamId: 'sA', value: 'for-A' }])
    expect(await sinkB.promise).toEqual([{ type: 'item', streamId: 'sB', value: 'for-B' }])
    socket.close()
  })

  it('① 失败不带端口：dsh 未配置 → 立即 {ok:false,error}', async () => {
    const m2 = registerM2Mux({})
    const { event, posts } = fakeEvent()
    m2(event, { requestId: 'rX' })
    await sleep(20)
    expect(posts).toEqual([{
      channel: 'pbots:mux-port',
      payload: { requestId: 'rX', ok: false, error: 'dsh connection not configured' },
      ports: [],
    }])
    expect(m2.stats.transfers).toBe(0)
  })

  it('① 10s 超时（注入 80ms）：socket 一直不就绪 → {ok:false,error 含 timed out}，无端口', async () => {
    const dsh = fakeDsh() // setLive 不调用：ready() 永久 pending
    const m2 = registerM2Mux({ dsh: dsh.conn, timeoutMs: 80 })
    const { event, posts } = fakeEvent()
    m2(event, { requestId: 'rT' })
    await sleep(200)
    expect(posts).toHaveLength(1)
    const payload = posts[0].payload as { requestId: string; ok: boolean; error: string }
    expect(payload.ok).toBe(false)
    expect(payload.error).toContain('timed out')
    expect(posts[0].ports).toEqual([])
    expect(m2.stats.timeouts).toBe(1)
  })

  it('① 等待期间 sender 销毁 → 不转交也不 postMessage', async () => {
    const dsh = fakeDsh() // 未就绪，触发等待路径
    const m2 = registerM2Mux({ dsh: dsh.conn, timeoutMs: 60 })
    const alive = fakeEvent()
    m2(alive.event, { requestId: 'r-alive' })
    const dead = fakeEvent({ destroyed: true })
    m2(dead.event, { requestId: 'r-dead' })
    await sleep(120)
    const okCalls = alive.posts.filter((p) => (p.payload as { ok?: boolean }).ok === true)
    const deadCalls = dead.posts.filter((p) => (p.payload as { requestId?: string }).requestId === 'r-dead')
    expect(okCalls).toEqual([])  // alive 请求超时走 ok:false
    expect(alive.posts[0].payload).toEqual(expect.objectContaining({ requestId: 'r-alive', ok: false }))
    expect(deadCalls).toEqual([]) // 销毁的 sender 连 ok:false 都不回
  })

  it('④ ipc 来源校验：senderFrame 为 null / 非 pbots-app origin → 不转交、无 postMessage、dsh 不被触碰', async () => {
    const dsh = fakeDsh()
    const m2 = registerM2Mux({ dsh: dsh.conn })
    const socket = await backend.open()
    dsh.setLive(socket)
    const bads = [
      fakeEvent({ url: null }),
      fakeEvent({ url: 'file:///tmp/x.html' }),
      fakeEvent({ url: 'https://evil.example/' }),
    ]
    for (const bad of bads) m2(bad.event, { requestId: 'r-evil' })
    await sleep(80)
    expect(bads.flatMap((b) => b.posts)).toEqual([])
    expect(m2.stats.transfers).toBe(0)
    expect(m2.stats.rejectedSenders).toBe(3)
    // requestId 非字符串同样忽略
    const notString = fakeEvent()
    m2(notString.event, { requestId: 42 } as unknown as { requestId: string })
    await sleep(30)
    expect(notString.posts).toEqual([])
    socket.close()
  })
})

describe('M2 endpoint 白名单（③，恰三个：session/follow、$events、session/control）', () => {
  it.each(['session/create', 'workspace/list', 'credentials/get'])('表外 endpoint %s → error 帧回 port，ws 不收到 open，记 rejectedEndpoints', async (endpoint) => {
    const { m2, port2, socket } = await drive()
    const beforeRejected = m2.stats.rejectedEndpoints.length
    const sink = collect(port2, 1)
    await sleep(20)
    send(port2, { type: 'open', streamId: 'sid-x', endpoint })
    const got = (await sink.promise) as Array<{ type: string; streamId: string; error: { code: string } }>
    expect(got[0].type).toBe('error')
    expect(got[0].streamId).toBe('sid-x')
    expect(got[0].error.code).toBe('pbots/forbidden')
    expect(backend.received.filter((f) => f.type === 'open' && f.streamId === 'sid-x')).toEqual([])
    expect(m2.stats.rejectedEndpoints.slice(beforeRejected)).toEqual([endpoint])
    socket.close()
  })

  it.each(['session/follow', '$events', 'session/control'])('表内 endpoint %s 放行', async (endpoint) => {
    const { port2, socket } = await drive()
    const sink = collect(port2, 1)
    await sleep(20)
    send(port2, { type: 'open', streamId: `sid-${endpoint}`, endpoint, payload: { args: {} } })
    await sleep(20)
    backend.send({ type: 'item', streamId: `sid-${endpoint}`, value: 'echo' })
    expect(await sink.promise).toEqual([{ type: 'item', streamId: `sid-${endpoint}`, value: 'echo' }])
    socket.close()
  })
})

describe('streamId 归属（②）', () => {
  it('(a) open 的 streamId 与另一 port 现有流冲突即拒：B 收 error，ws 只见一次 open', async () => {
    const dsh = fakeDsh()
    const m2 = registerM2Mux({ dsh: dsh.conn })
    const socket = await backend.open()
    dsh.setLive(socket)
    const a = fakeEvent()
    const b = fakeEvent()
    m2(a.event, { requestId: 'ra' })
    m2(b.event, { requestId: 'rb' })
    await sleep(50)
    const portA = pagePort(a.posts)
    const portB = pagePort(b.posts)
    send(portA, { type: 'open', streamId: 'dup', endpoint: '$events', payload: { args: {} } })
    await sleep(20)
    const sink = collect(portB, 1)
    send(portB, { type: 'open', streamId: 'dup', endpoint: '$events', payload: { args: {} } })
    const got = (await sink.promise) as Array<{ type: string; error: { code: string } }>
    expect(got[0].type).toBe('error')
    expect(got[0].error.code).toBe('pbots/forbidden')
    expect(backend.received.filter((f) => f.type === 'open' && f.streamId === 'dup')).toHaveLength(1)
    socket.close()
  })

  it('(a) open 的 streamId 与 main 自己的流冲突即拒（tap 观察到的 main 归属流）', async () => {
    const dsh = fakeDsh()
    const m2 = registerM2Mux({ dsh: dsh.conn })
    const socket = await backend.open()
    dsh.setLive(socket)
    // 先 wire tap（首次转交或 U-16 常驻循环），再开 main 流：main 归属靠 tap 观察；
    // U-16 起 main 常驻自开 $events，但本测试手动开的 mainStream 是另一条随机流，互不影响。
    const { event, posts } = fakeEvent()
    m2(event, { requestId: 'rm' })
    await sleep(50)
    const mainStream = socket.open('$events', {})
    await sleep(20)
    const port = pagePort(posts)
    const sink = collect(port, 1)
    send(port, { type: 'open', streamId: mainStream.streamId, endpoint: '$events', payload: { args: {} } })
    const got = (await sink.promise) as Array<{ type: string; error: { code: string } }>
    expect(got[0].type).toBe('error')
    expect(got[0].error.code).toBe('pbots/forbidden')
    expect(backend.received.filter((f) => f.type === 'open' && f.streamId === mainStream.streamId)).toHaveLength(1)
    mainStream.cancel()
    socket.close()
  })

  it('(b) 上行 item/end/cancel 只放行经本 port open 过的 streamId：越权与未知一律不上 ws', async () => {
    const dsh = fakeDsh()
    const m2 = registerM2Mux({ dsh: dsh.conn })
    const socket = await backend.open()
    dsh.setLive(socket)
    const a = fakeEvent()
    const b = fakeEvent()
    m2(a.event, { requestId: 'ra' })
    m2(b.event, { requestId: 'rb' })
    await sleep(50)
    const portA = pagePort(a.posts)
    const portB = pagePort(b.posts)
    send(portA, { type: 'open', streamId: 'own-a', endpoint: 'session/follow', payload: { args: {} } })
    await sleep(20)
    const before = backend.received.length
    const droppedBefore = m2.stats.uplinkDropped
    send(portB, { type: 'item', streamId: 'own-a', value: 'foreign' })      // B 冒充 A 的流
    send(portB, { type: 'end', streamId: 'own-a' })
    send(portB, { type: 'cancel', streamId: 'own-a' })
    send(portB, { type: 'item', streamId: 'never-opened', value: 'ghost' }) // 未知 streamId
    await sleep(50)
    expect(backend.received.length).toBe(before)
    expect(m2.stats.uplinkDropped).toBe(droppedBefore + 4)
    // A 自己的 item 仍放行
    send(portA, { type: 'item', streamId: 'own-a', value: 'mine' })
    await sleep(20)
    expect(backend.received[backend.received.length - 1]).toEqual({ type: 'item', streamId: 'own-a', value: 'mine' })
    socket.close()
  })

  it('(c) 下行帧只转给拥有该 streamId 的 port', async () => {
    const dsh = fakeDsh()
    const m2 = registerM2Mux({ dsh: dsh.conn })
    const socket = await backend.open()
    dsh.setLive(socket)
    const a = fakeEvent()
    const b = fakeEvent()
    m2(a.event, { requestId: 'ra' })
    m2(b.event, { requestId: 'rb' })
    await sleep(50)
    const portA = pagePort(a.posts)
    const portB = pagePort(b.posts)
    const seenB: unknown[] = []
    portB.on('message', (e) => seenB.push(e.data))
    send(portA, { type: 'open', streamId: 'sa', endpoint: 'session/follow', payload: { args: {} } })
    send(portB, { type: 'open', streamId: 'sb', endpoint: 'session/follow', payload: { args: {} } })
    await sleep(20)
    const sinkA = collect(portA, 1)
    backend.send({ type: 'item', streamId: 'sa', value: 'only-a' })
    expect(await sinkA.promise).toEqual([{ type: 'item', streamId: 'sa', value: 'only-a' }])
    await sleep(50)
    expect(seenB).toEqual([]) // sa 不属于 B，B 不应收到
    socket.close()
  })

  it('port 关闭 → 对本 port 的每个 streamId 发 cancel，归属清空（重用同 id 可再 open）', async () => {
    const { m2, port2, socket } = await drive('rc')
    expect(m2.stats.portCancels).toBe(0)
    send(port2, { type: 'open', streamId: 's1', endpoint: '$events', payload: { args: {} } })
    send(port2, { type: 'open', streamId: 's2', endpoint: 'session/follow', payload: { args: {} } })
    await sleep(20)
    const before = backend.received.length
    port2.close()
    await sleep(50)
    const cancels = backend.received.slice(before).filter((f) => f.type === 'cancel')
    expect(cancels.map((f) => f.streamId).sort()).toEqual(['s1', 's2'])
    expect(m2.stats.portCancels).toBe(2)
    // 归属已清：同一 m2 上新 port 可重用同 streamId
    const { event: ev2, posts: posts2 } = fakeEvent()
    m2(ev2, { requestId: 'rc2' })
    await sleep(50)
    const portNext = pagePort(posts2)
    const sink = collect(portNext, 1)
    send(portNext, { type: 'open', streamId: 's1', endpoint: '$events', payload: { args: {} } })
    await sleep(20)
    backend.send({ type: 'item', streamId: 's1', value: 'reused' })
    expect(await sink.promise).toEqual([{ type: 'item', streamId: 's1', value: 'reused' }])
    socket.close()
  })

  it('socket 断开 → 关闭全部 port（页面侧收到 close）；重连就绪前不转交新 port，就绪后可转交', async () => {
    const dsh = fakeDsh()
    const m2 = registerM2Mux({ dsh: dsh.conn, timeoutMs: 500, pollMs: 10 })
    const socket1 = await backend.open()
    dsh.setLive(socket1)
    const { event, posts } = fakeEvent()
    m2(event, { requestId: 'rd' })
    await sleep(50)
    const port = pagePort(posts)
    let closed = false
    port.on('close', () => { closed = true })

    backend.terminateAll() // socket 死亡
    await sleep(100)
    expect(closed).toBe(true)

    // dead socket 仍被 ready() 返回（重连间隙）：新请求不得转交到死 socket
    const { event: ev2, posts: posts2 } = fakeEvent()
    m2(ev2, { requestId: 'rd2' })
    await sleep(80)
    expect(posts2).toEqual([])

    // 新 generation 就绪后可转交
    const socket2 = await backend.open()
    dsh.setLive(socket2)
    await sleep(80)
    expect(posts2).toHaveLength(1)
    expect((posts2[0].payload as { ok: boolean }).ok).toBe(true)
    socket2.close()
  })
})

describe('tap 计数与 ledger（④）', () => {
  it('$events 帧（ready/waterfall/cancel）写进 ledger；下行计数与 orphan 可读', async () => {
    const { m2, port2, socket } = await drive('rl')
    send(port2, { type: 'open', streamId: 'se', endpoint: '$events', payload: { args: {} } })
    await sleep(20)
    const sink = collect(port2, 3)
    backend.send({ type: 'item', streamId: 'se', value: { type: 'ready', clientId: 'cl-1' } })
    backend.send({ type: 'item', streamId: 'se', value: { type: 'waterfall', event: 'approval/request', eventId: 'ev-1', agentId: 'ag-1', request: { toolName: 'bash' } } })
    backend.send({ type: 'item', streamId: 'se', value: { type: 'cancel', eventId: 'ev-1' } })
    backend.send({ type: 'item', streamId: 'nobody-owns', value: 'orphan' })
    expect(await sink.promise).toHaveLength(3)
    await sleep(80) // 等 orphan 帧过 tap（第 4 帧不在 sink 的等待集内）

    expect(m2.ledger.readyClientId).toBe('cl-1')
    expect(m2.ledger.pendingEvents()).toEqual([]) // ev-1 已 cancel
    expect(m2.stats.downlink.items['se']).toBe(3)
    expect(m2.stats.downlink.items['nobody-owns']).toBe(1)
    expect(m2.stats.downlink.total).toBeGreaterThanOrEqual(4)
    expect(m2.stats.downlink.orphan).toBeGreaterThanOrEqual(1)
    socket.close()
  })

  it('testDropSocket 关掉当前 socket（E2E 断链注入用）', async () => {
    const { m2, port2, socket } = await drive('rdrop')
    let closed = false
    port2.on('close', () => { closed = true })
    await sleep(20)
    m2.testDropSocket()
    await sleep(100)
    expect(closed).toBe(true) // socket 断开 → port 全关
    expect(backend.connections[backend.connections.length - 1].readyState).toBe(3) // CLOSED
  })
})
