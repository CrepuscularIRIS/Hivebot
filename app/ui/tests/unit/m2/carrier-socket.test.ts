// W 包装对象单测（C §2.3「包装对象约 40 行」）：CONNECTING→OPEN、失败/10s 超时 → error 再 close、
// 迟到端口立即 close、拒收错误 source 与未知 requestId（ES:86）、端口 close → W close、上游事件接口。
import { describe, expect, it, vi } from 'vitest'
import { afterEach } from 'vitest'
import { CarrierSocket, type CarrierEnv, type CarrierWindowEvent, type PortLike } from '../../../renderer/carrier/mux-socket'

/** 可编程假 env：windowRef 恒等于 source；listener 由测试驱动。 */
function makeEnv(): {
  env: CarrierEnv
  emit(ev: Partial<CarrierWindowEvent>): void
  listeners: Array<(ev: CarrierWindowEvent) => void>
} {
  const fakeWindow = { tag: 'window' }
  const listeners: Array<(ev: CarrierWindowEvent) => void> = []
  const env: CarrierEnv = {
    windowRef: fakeWindow,
    requestMuxPort: vi.fn(),
    addMessageListener(listener) { listeners.push(listener); return () => { const i = listeners.indexOf(listener); if (i >= 0) listeners.splice(i, 1) } },
    randomId: () => 'rid-1',
  }
  return {
    env,
    listeners,
    emit(ev: Partial<CarrierWindowEvent>): void {
      for (const l of [...listeners]) {
        l({ source: fakeWindow, origin: 'pbots-app://app', data: {}, ports: [], ...ev })
      }
    },
  }
}

class FakePagePort implements PortLike {
  started = false
  closed = false
  posted: unknown[] = []
  private msgListeners: Array<(e: { data: unknown }) => void> = []
  private closeListeners: Array<() => void> = []
  addEventListener(type: 'message' | 'close', listener: (e: { data?: unknown }) => void): void {
    if (type === 'message') this.msgListeners.push(listener as (e: { data: unknown }) => void)
    else this.closeListeners.push(listener as () => void)
  }
  start(): void { this.started = true }
  close(): void {
    if (this.closed) return
    this.closed = true
    for (const l of [...this.closeListeners]) l()
  }
  postMessage(data: unknown): void { this.posted.push(data) }
  deliver(data: unknown): void { for (const l of [...this.msgListeners]) l({ data }) }
  fireClose(): void { for (const l of [...this.closeListeners]) l() }
}

interface Observed { types: string[]; errors: string[]; messages: unknown[] }
function observe(socket: CarrierSocket): Observed {
  const observed: Observed = { types: [], errors: [], messages: [] }
  socket.addEventListener('open', () => { observed.types.push('open') }, { once: true })
  socket.addEventListener('message', (e) => { observed.types.push('message'); observed.messages.push(e.data) })
  socket.addEventListener('error', (e) => { observed.types.push('error'); observed.errors.push(String((e as { error?: Error }).error)) })
  socket.addEventListener('close', () => { observed.types.push('close') })
  return observed
}

afterEach(() => { vi.useRealTimers() })

describe('CarrierSocket（W 包装对象）', () => {
  it('创建即 CONNECTING(0) 且发出端口申请；收到端口后 start→readyState=1→open；send 走 port.postMessage；port message 派发 message', () => {
    const { env, emit } = makeEnv()
    const socket = new CarrierSocket(env, 10_000)
    expect(socket.readyState).toBe(0)
    expect(env.requestMuxPort).toHaveBeenCalledWith('rid-1')
    const observed = observe(socket)
    const port = new FakePagePort()
    emit({ data: { pbotsMux: 'rid-1', ok: true }, ports: [port] })
    expect(port.started).toBe(true)
    expect(socket.readyState).toBe(1)
    expect(observed.types).toEqual(['open'])
    socket.send('{"type":"open"}')
    expect(port.posted).toEqual(['{"type":"open"}'])
    port.deliver({ hello: 1 })
    expect(observed.types).toEqual(['open', 'message'])
    expect(observed.messages).toEqual([{ hello: 1 }])
  })

  it('失败（ok:false）不带端口 → readyState=3，error 先于 close，错误信息透传', () => {
    const { env, emit } = makeEnv()
    const socket = new CarrierSocket(env, 10_000)
    const observed = observe(socket)
    emit({ data: { pbotsMux: 'rid-1', ok: false, error: 'dsh connection not configured' }, ports: [] })
    expect(socket.readyState).toBe(3)
    expect(observed.types).toEqual(['error', 'close'])
    expect(observed.errors[0]).toContain('dsh connection not configured')
  })

  it('10s 超时（注入 50ms）→ readyState=3，error 含 timed out，再 close', async () => {
    vi.useFakeTimers()
    const { env } = makeEnv()
    const socket = new CarrierSocket(env, 50)
    const observed = observe(socket)
    await vi.advanceTimersByTimeAsync(60)
    expect(socket.readyState).toBe(3)
    expect(observed.types).toEqual(['error', 'close'])
    expect(observed.errors[0]).toContain('timed out')
  })

  it('失败后的迟到端口立即 close，不复活、不重复派发', () => {
    const { env, emit } = makeEnv()
    const socket = new CarrierSocket(env, 100)
    const observed = observe(socket)
    emit({ data: { pbotsMux: 'rid-1', ok: false, error: 'no' }, ports: [] })
    expect(observed.types).toEqual(['error', 'close'])
    const late = new FakePagePort()
    emit({ data: { pbotsMux: 'rid-1', ok: true }, ports: [late] })
    expect(late.closed).toBe(true)
    expect(socket.readyState).toBe(3)
    expect(observed.types).toEqual(['error', 'close'])
  })

  it('拒收错误 source 与未知 requestId（ES:86）：不绑定、readyState 保持 0', () => {
    const { env, emit, listeners } = makeEnv()
    const socket = new CarrierSocket(env, 10_000)
    const observed = observe(socket)
    const foreign = new FakePagePort()
    // 错误 source（非 window）
    for (const l of [...listeners]) l({ source: { tag: 'other' }, origin: 'pbots-app://app', data: { pbotsMux: 'rid-1', ok: true }, ports: [foreign] })
    // 未知 requestId
    emit({ data: { pbotsMux: 'rid-other', ok: true }, ports: [foreign] })
    expect(socket.readyState).toBe(0)
    expect(foreign.closed).toBe(false)
    expect(foreign.started).toBe(false)
    expect(observed.types).toEqual([])
  })

  it('多出的端口立即 close，只绑定第一个', () => {
    const { env, emit } = makeEnv()
    const socket = new CarrierSocket(env, 10_000)
    const first = new FakePagePort()
    const extra = new FakePagePort()
    emit({ data: { pbotsMux: 'rid-1', ok: true }, ports: [first, extra] })
    expect(first.started).toBe(true)
    expect(extra.closed).toBe(true)
    expect(socket.readyState).toBe(1)
  })

  it('main 关闭 port（socket 断开传导）→ readyState=3 派发 close', () => {
    const { env, emit } = makeEnv()
    const socket = new CarrierSocket(env, 10_000)
    const observed = observe(socket)
    const port = new FakePagePort()
    emit({ data: { pbotsMux: 'rid-1', ok: true }, ports: [port] })
    port.fireClose()
    expect(socket.readyState).toBe(3)
    expect(observed.types).toEqual(['open', 'close'])
  })

  it('close()：CONNECTING 期可取消（readyState=3 派发 close，不派发 error），迟到的端口立即 close', () => {
    const { env, emit } = makeEnv()
    const socket = new CarrierSocket(env, 10_000)
    const observed = observe(socket)
    socket.close()
    expect(socket.readyState).toBe(3)
    expect(observed.types).toEqual(['close'])
    const late = new FakePagePort()
    emit({ data: { pbotsMux: 'rid-1', ok: true }, ports: [late] })
    expect(late.closed).toBe(true)
  })

  it('close()：OPEN 期关闭 port 并派发 close；再次 close 幂等', () => {
    const { env, emit } = makeEnv()
    const socket = new CarrierSocket(env, 10_000)
    const observed = observe(socket)
    const port = new FakePagePort()
    emit({ data: { pbotsMux: 'rid-1', ok: true }, ports: [port] })
    socket.close(1000, 'disposed')
    expect(port.closed).toBe(true)
    expect(socket.readyState).toBe(3)
    expect(observed.types).toEqual(['open', 'close'])
    socket.close()
    expect(observed.types).toEqual(['open', 'close'])
  })

  it('上游接口兼容：send 在非 OPEN 抛错；removeEventListener 停止派发；open 用 once 只派发一次', () => {
    const { env, emit } = makeEnv()
    const socket = new CarrierSocket(env, 10_000)
    expect(() => socket.send('x')).toThrow(/not open/)
    const onOpen = (): void => { throw new Error('should not fire') }
    socket.addEventListener('open', onOpen)
    socket.removeEventListener('open', onOpen)
    const port = new FakePagePort()
    emit({ data: { pbotsMux: 'rid-1', ok: true }, ports: [port] })
    expect(socket.readyState).toBe(1)
    expect(() => socket.send('x')).not.toThrow()
  })
})
