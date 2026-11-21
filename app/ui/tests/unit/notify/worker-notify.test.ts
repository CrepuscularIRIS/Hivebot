// P6-18（决策 23）单测：OS 通知只发「需要你处理」——worker 挂起审批/提问 → 1 条
// critical 通知；同 eventId 恰 1 次（重连不重发）；窗口聚焦 0 次；完成类 0 次；
// 非 worker bot 0 次；点击 → 聚焦主窗 + openWorker(botId)。Notification 全部注入 mock。
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  // 默认工厂兜底用（多数用例显式注入 makeNotification / isSupported）
  Notification: class {
    show(): void {}
    on(): unknown { return this }
    once(): unknown { return this }
    static isSupported(): boolean { return true }
  },
}))

import { EventsLedger } from '../../../main/dsh/ledger'
import { BotsMetaStore } from '../../../main/m3-meta/store'
import { wireWorkerNotify, type ElectronNotification } from '../../../main/notify/worker-notify'
import { tmkdir } from '../../support/tmp-sweep.ts'

interface FakeNotification extends ElectronNotification {
  opts: { title: string; body: string; urgency: string }
  clicks: Array<() => void>
  failures: Array<() => void>
  closes: Array<() => void>
  shown: number
}

function fakeNotificationFactory(): { make: (opts: { title: string; body: string; urgency: 'critical' }) => FakeNotification; all: FakeNotification[] } {
  const all: FakeNotification[] = []
  return {
    all,
    make(opts): FakeNotification {
      const n: FakeNotification = {
        opts, clicks: [], failures: [], closes: [], shown: 0,
        show() { this.shown += 1 },
        on(event, listener) {
          if (event === 'failed') this.failures.push(listener)
          else this.clicks.push(listener)
          return this
        },
        once(_event, listener) { this.closes.push(listener); return this },
      }
      all.push(n)
      return n
    },
  }
}

interface FakeWindow {
  focused: boolean
  minimized: boolean
  destroyed: boolean
  focusCalls: number
  restoreCalls: number
}

function fakeWindow(focused = false): FakeWindow {
  return {
    focused, minimized: false, destroyed: false, focusCalls: 0, restoreCalls: 0,
    isFocused() { return this.focused },
    isMinimized() { return this.minimized },
    restore() { this.restoreCalls += 1 },
    focus() { this.focusCalls += 1 },
    isDestroyed() { return this.destroyed },
  }
}

async function seededStore(bots: Record<string, { createdBy: string }>): Promise<BotsMetaStore> {
  const store = new BotsMetaStore(tmkdir('bot-p618-unit-'))
  await store.init()
  for (const [id, v] of Object.entries(bots)) await store.putBot(id, v.createdBy)
  return store
}

/** 喂一条 worker 审批挂起事件（agentId = 该 worker）。 */
function feedApproval(ledger: EventsLedger, eventId: string, agentId: string, toolName = 'bash'): void {
  ledger.record({ type: 'waterfall', event: 'approval/request', eventId, agentId, request: { toolName } })
}

function feedQuestion(ledger: EventsLedger, eventId: string, agentId: string, ids: string[]): void {
  ledger.record({
    type: 'waterfall', event: 'user-questions/request', eventId, agentId,
    request: { questions: ids.map((id) => ({ id, text: `q ${id}` })) },
  })
}

const WORKER = 'sess-worker-0001'
const MAIN = 'sess-main-0000'

describe('wireWorkerNotify（P6-18 决策 23）', () => {
  it('① worker 挂起审批 → 恰 1 条 critical 通知；重连重投同 eventId 不重发（恰 1 次）', async () => {
    const ledger = new EventsLedger()
    const store = await seededStore({ [WORKER]: { createdBy: MAIN } })
    const win = fakeWindow()
    const openWorker = vi.fn()
    const factory = fakeNotificationFactory()
    const notify = wireWorkerNotify({ ledger, store, window: win, openWorker, makeNotification: factory.make, isSupported: () => true })

    feedApproval(ledger, 'ev-1', WORKER, 'git push origin main')
    notify.review()
    expect(factory.all).toHaveLength(1)
    expect(factory.all[0]!.opts).toMatchObject({ urgency: 'critical' })
    expect(factory.all[0]!.opts.body).toContain('git push origin main')
    expect(factory.all[0]!.opts.body).toContain(WORKER.slice(0, 8))
    expect(notify.stats.shown).toEqual([{ eventId: 'ev-1', botId: WORKER, kind: 'approval' }])

    // 重连：gateway 对新 client 补发未决 → ledger 重录同 eventId（Map 覆盖，仍 pending）
    feedApproval(ledger, 'ev-1', WORKER, 'git push origin main')
    notify.review()
    notify.review()
    expect(factory.all).toHaveLength(1)
    expect(notify.stats.shown).toHaveLength(1)
    expect(factory.all[0]!.shown).toBe(1)
    notify.stop()
  })

  it('② 提问挂起同样发 1 条（kind question），eventId 维度去重', async () => {
    const ledger = new EventsLedger()
    const store = await seededStore({ [WORKER]: { createdBy: MAIN } })
    const factory = fakeNotificationFactory()
    const notify = wireWorkerNotify({ ledger, store, window: fakeWindow(), openWorker: vi.fn(), makeNotification: factory.make, isSupported: () => true })

    feedQuestion(ledger, 'ev-q1', WORKER, ['q1', 'q2'])
    notify.review()
    expect(factory.all).toHaveLength(1)
    expect(notify.stats.shown).toEqual([{ eventId: 'ev-q1', botId: WORKER, kind: 'question' }])
    expect(factory.all[0]!.opts.body).toContain('2')
    notify.stop()
  })

  it('③ 窗口聚焦时 0 次（用户在场，看得到卡）；离开后仍未决 → 下一轮补发恰 1 次', async () => {
    const ledger = new EventsLedger()
    const store = await seededStore({ [WORKER]: { createdBy: MAIN } })
    const win = fakeWindow(true)
    const factory = fakeNotificationFactory()
    const notify = wireWorkerNotify({ ledger, store, window: win, openWorker: vi.fn(), makeNotification: factory.make, isSupported: () => true })

    feedApproval(ledger, 'ev-2', WORKER)
    notify.review()
    notify.review()
    expect(factory.all).toHaveLength(0)
    expect(notify.stats.shown).toHaveLength(0)
    expect(notify.stats.suppressedFocused).toEqual(['ev-2']) // 计数一次，不随轮次累积

    win.focused = false
    notify.review()
    expect(factory.all).toHaveLength(1)
    notify.review() // 发过即 seen，不再发
    expect(factory.all).toHaveLength(1)
    notify.stop()
  })

  it('④ 完成类 0 次：cancel 下账后不再发；终态事件本就不入账（pendingEvents 只有两类挂起）', async () => {
    const ledger = new EventsLedger()
    const store = await seededStore({ [WORKER]: { createdBy: MAIN } })
    const win = fakeWindow()
    const factory = fakeNotificationFactory()
    const notify = wireWorkerNotify({ ledger, store, window: win, openWorker: vi.fn(), makeNotification: factory.make, isSupported: () => true })

    // 用户作答（完成类终态路径）：$events cancel → ledger 下账 → 无可发
    feedApproval(ledger, 'ev-3', WORKER)
    ledger.record({ type: 'cancel', eventId: 'ev-3' })
    notify.review()
    expect(factory.all).toHaveLength(0)
    expect(notify.stats.shown).toHaveLength(0)
    // 全空台账常态轮询也不发
    notify.review()
    expect(factory.all).toHaveLength(0)
    notify.stop()
  })

  it('⑤ 非 worker bot（主 bot 自己挂审批）0 次', async () => {
    const ledger = new EventsLedger()
    const store = await seededStore({ [WORKER]: { createdBy: MAIN } })
    const factory = fakeNotificationFactory()
    const notify = wireWorkerNotify({ ledger, store, window: fakeWindow(), openWorker: vi.fn(), makeNotification: factory.make, isSupported: () => true })

    feedApproval(ledger, 'ev-main', MAIN) // 主 bot 不在 bots 键里（非 worker）
    notify.review()
    expect(factory.all).toHaveLength(0)
    expect(notify.stats.skippedNonWorker).toEqual(['ev-main'])
    notify.stop()
  })

  it('⑥ isSupported() === false（无通知能力的宿主；Linux 恒 true、降级走⑪ failed 路径）：静默不发，事件已判过不重判', async () => {
    const ledger = new EventsLedger()
    const store = await seededStore({ [WORKER]: { createdBy: MAIN } })
    const factory = fakeNotificationFactory()
    const log = vi.fn()
    const notify = wireWorkerNotify({ ledger, store, window: fakeWindow(), openWorker: vi.fn(), makeNotification: factory.make, isSupported: () => false, log })

    feedApproval(ledger, 'ev-4', WORKER)
    expect(() => notify.review()).not.toThrow()
    expect(factory.all).toHaveLength(0)
    expect(notify.stats.supported).toBe(false)
    expect(notify.stats.skippedUnsupported).toEqual(['ev-4'])
    notify.review()
    expect(notify.stats.skippedUnsupported).toHaveLength(1) // seen，不重复记
    notify.stop()
  })

  it('⑦ 点击通知 → 最小化先 restore、focus 主窗、openWorker(该 worker)', async () => {
    const ledger = new EventsLedger()
    const store = await seededStore({ [WORKER]: { createdBy: MAIN } })
    const win = fakeWindow()
    win.minimized = true
    const openWorker = vi.fn()
    const factory = fakeNotificationFactory()
    const notify = wireWorkerNotify({ ledger, store, window: win, openWorker, makeNotification: factory.make, isSupported: () => true })

    feedApproval(ledger, 'ev-5', WORKER)
    notify.review()
    const n = factory.all[0]!
    n.clicks[0]!()
    expect(win.restoreCalls).toBe(1)
    expect(win.focusCalls).toBe(1)
    expect(openWorker).toHaveBeenCalledTimes(1)
    expect(openWorker).toHaveBeenCalledWith(WORKER)

    // 窗口销毁后的迟到点击不抛
    win.destroyed = true
    expect(() => n.clicks[0]!()).not.toThrow()
    expect(openWorker).toHaveBeenCalledTimes(1)
    notify.stop()
  })

  it('⑧ store 读失败（坏 bots.json）→ fail closed 不发、不重复刷日志', async () => {
    const ledger = new EventsLedger()
    const store = await seededStore({})
    vi.spyOn(store, 'read').mockImplementation(() => { throw new Error('bots.json unreadable') })
    const factory = fakeNotificationFactory()
    const log = vi.fn()
    const notify = wireWorkerNotify({ ledger, store, window: fakeWindow(), openWorker: vi.fn(), makeNotification: factory.make, isSupported: () => true, log })

    feedApproval(ledger, 'ev-6', WORKER)
    notify.review()
    notify.review()
    expect(factory.all).toHaveLength(0)
    expect(notify.stats.readErrors).toBeGreaterThanOrEqual(1)
    expect(log).toHaveBeenCalledTimes(1) // 只记一次
    notify.stop()
  })

  it('⑨ tickMs 定时轮询自动驱动；stop 后停', async () => {
    const ledger = new EventsLedger()
    const store = await seededStore({ [WORKER]: { createdBy: MAIN } })
    const factory = fakeNotificationFactory()
    const notify = wireWorkerNotify({ ledger, store, window: fakeWindow(), openWorker: vi.fn(), makeNotification: factory.make, isSupported: () => true, tickMs: 20 })

    feedApproval(ledger, 'ev-7', WORKER)
    await new Promise((r) => setTimeout(r, 120))
    expect(factory.all).toHaveLength(1)
    notify.stop()
    feedApproval(ledger, 'ev-8', WORKER)
    await new Promise((r) => setTimeout(r, 80))
    expect(factory.all).toHaveLength(1) // 停了，ev-8 不发
    notify.stop()
  })

  it('⑩ 观测面挂 globalThis.__pbotsNotify（e2e 读 stats 用，不开新 IPC）', async () => {
    const ledger = new EventsLedger()
    const store = await seededStore({ [WORKER]: { createdBy: MAIN } })
    const notify = wireWorkerNotify({ ledger, store, window: fakeWindow(), openWorker: vi.fn(), isSupported: () => true })
    const g = globalThis as { __pbotsNotify?: { stats: unknown } }
    expect(g.__pbotsNotify?.stats).toBe(notify.stats)
    notify.stop()
  })

  it('⑪ Linux 无通知守护（isSupported 恒 true、投递失败走 failed 事件）：记录降级不重试（恰 1 次尝试）', async () => {
    const ledger = new EventsLedger()
    const store = await seededStore({ [WORKER]: { createdBy: MAIN } })
    const factory = fakeNotificationFactory()
    const notify = wireWorkerNotify({ ledger, store, window: fakeWindow(), openWorker: vi.fn(), makeNotification: factory.make, isSupported: () => true })

    feedApproval(ledger, 'ev-9', WORKER)
    notify.review()
    expect(factory.all).toHaveLength(1)
    factory.all[0]!.failures[0]!() // 宿主投递失败（libnotify 连不上守护）
    expect(notify.stats.failed).toEqual(['ev-9'])
    notify.review()
    expect(factory.all).toHaveLength(1) // seen：不因失败重试
    expect(factory.all[0]!.shown).toBe(1)
    notify.stop()
  })
})
