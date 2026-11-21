// P6-18（决策 23）：OS 通知只发「需要你处理」——worker 挂起审批 / 提问 → 1 条 critical
// 通知，点击聚焦主窗并打开该 worker（openWorker 回调，P6-15 导航语义的 main 侧出口）。
// 完成类不发（ledger 本就只入账两类挂起事件）；非 worker bot 不发（createdBy 判定）。
// 事件源 = main 已有的 $events 台账（m1Ledger，U-12 tap 喂）：照 deadline.ts 先例轮询
// pendingEvents()，不动 ledger.ts。观测面 globalThis.__pbotsNotify（e2e 读 stats，不开新 IPC）。
import { Notification } from 'electron'
import type { EventsLedger, LedgerEntry } from '../dsh/ledger'
import type { BotsMetaStore } from '../m3-meta/store'

/** 主窗最小形状（BrowserWindow 满足；测试注入 fake）。 */
export interface WorkerNotifyWindow {
  isFocused(): boolean
  isMinimized(): boolean
  restore(): void
  focus(): void
  /** 仅 e2e 聚焦态注入用（testBlurWindow）；BrowserWindow 自带。 */
  blur?(): void
  isDestroyed?(): boolean
}

/** Electron Notification 的最小形状（测试注入 fake）。 */
export interface ElectronNotification {
  show(): void
  on(event: 'click' | 'failed', listener: () => void): unknown
  once(event: 'close', listener: () => void): unknown
}

export interface WorkerNotifyStats {
  /** Notification.isSupported() 结果。注意 Linux/libnotify 下恒 true（链接期判定），
   * 真实「无通知守护」降级信号是 failed 计数（Xvfb e2e 断言口径）。 */
  supported: boolean
  /** 实际发出的通知（eventId 维度恰 1 条）。 */
  shown: Array<{ eventId: string; botId: string; kind: 'approval' | 'question' }>
  /** 发出但宿主投递失败的 eventId（如 Xvfb 无通知守护；不重试，恰 1 次尝试）。 */
  failed: string[]
  /** 窗口聚焦被压下的 eventId（用户在场；每 eventId 计数一次）。 */
  suppressedFocused: string[]
  /** 非 worker bot（含主 bot 自己）跳过的 eventId。 */
  skippedNonWorker: string[]
  /** 宿主不支持通知跳过的 eventId。 */
  skippedUnsupported: string[]
  /** bots.json 读失败次数（fail closed：按非 worker 跳过）。 */
  readErrors: number
}

export interface WorkerNotifyDeps {
  /** 共享 $events 台账（main/index.ts 的 m1Ledger）。 */
  ledger: Pick<EventsLedger, 'pendingEvents'>
  /** bots.json 存储（worker 判定 = bots[agentId].createdBy 存在）。 */
  store: Pick<BotsMetaStore, 'read'>
  window: WorkerNotifyWindow
  /** 点击通知后调用（接线处决定怎么打开 worker）。 */
  openWorker: (botId: string) => void
  /** 通知工厂，默认 Electron Notification（决策 23：urgency critical）。 */
  makeNotification?: (opts: { title: string; body: string; urgency: 'critical' }) => ElectronNotification
  isSupported?: () => boolean
  /** 给定时自起轮询 timer；省略后测试手动 review()。 */
  tickMs?: number
  log?: (message: string) => void
}

export interface WorkerNotify {
  /** 单轮巡检（幂等）：timer 或测试驱动。 */
  review(): void
  stop(): void
  readonly stats: WorkerNotifyStats
  /** 仅 e2e 注入用（同 M2Handler.testDropSocket 先例）：Xvfb 下窗口默认聚焦，
   * 降级路径断言需要非聚焦态；返回 blur 后的 isFocused。 */
  testBlurWindow(): boolean
}

/** 轮询间隔（1s：决策 23 的目的就是在用户不看时尽快唤起；开销 = 一个 Map 遍历）。 */
export const NOTIFY_TICK_MS = 1_000

const shortId = (botId: string): string => botId.slice(0, 8)

function bodyOf(entry: LedgerEntry): string {
  return entry.event === 'approval/request'
    ? `Worker ${shortId(entry.agentId)} needs you: ${entry.toolName}`
    : `Worker ${shortId(entry.agentId)} asked ${entry.questionIds.size} question(s)`
}

export function wireWorkerNotify(deps: WorkerNotifyDeps): WorkerNotify {
  const log = deps.log ?? ((message: string) => { console.log(`[notify] ${message}`) })
  const makeNotification = deps.makeNotification ?? ((opts) => new Notification(opts))
  const stats: WorkerNotifyStats = { supported: false, shown: [], failed: [], suppressedFocused: [], skippedNonWorker: [], skippedUnsupported: [], readErrors: 0 }
  stats.supported = (deps.isSupported ?? (() => Notification.isSupported()))()
  if (!stats.supported) log('OS notifications not supported on this host (e.g. Xvfb without a notification daemon); worker alerts degrade to in-app only')

  /** 已处置（已发 / 已跳过）的 eventId：重连补发同 eventId 不重发（恰 1 次）。 */
  const seen = new Set<string>()
  /** 聚焦压下只计数一次的 eventId 集（压下不记 seen：用户离开后仍未决 → 下一轮补发）。 */
  const countedFocused = new Set<string>()
  /** 活通知引用（防 GC 吞掉 click 回调，Electron 文档建议持有引用）。 */
  const live = new Set<ElectronNotification>()
  let loggedReadError = false

  function show(entry: LedgerEntry): void {
    const botId = entry.agentId
    const notification = makeNotification({ title: 'Personal Bots', body: bodyOf(entry), urgency: 'critical' })
    live.add(notification)
    notification.once('close', () => { live.delete(notification) })
    notification.on('failed', () => {
      // Linux/libnotify 下 isSupported 恒 true，无通知守护（Xvfb）在此才可见：记录降级，不重试
      live.delete(notification)
      stats.failed.push(entry.eventId)
    })
    notification.on('click', () => {
      if (deps.window.isDestroyed?.()) return
      if (deps.window.isMinimized()) deps.window.restore()
      deps.window.focus()
      deps.openWorker(botId)
    })
    notification.show()
    stats.shown.push({ eventId: entry.eventId, botId, kind: entry.event === 'approval/request' ? 'approval' : 'question' })
  }

  function review(): void {
    if (deps.window.isDestroyed?.()) return
    for (const entry of deps.ledger.pendingEvents()) {
      if (seen.has(entry.eventId)) continue
      let isWorker = false
      try {
        isWorker = deps.store.read().bots?.[entry.agentId] !== undefined
      } catch (error) {
        stats.readErrors += 1
        if (!loggedReadError) {
          loggedReadError = true
          log(`bots.json unreadable; worker alerts fail closed: ${String(error)}`)
        }
      }
      if (!isWorker) { seen.add(entry.eventId); stats.skippedNonWorker.push(entry.eventId); continue }
      if (!stats.supported) { seen.add(entry.eventId); stats.skippedUnsupported.push(entry.eventId); continue }
      if (deps.window.isFocused()) {
        if (!countedFocused.has(entry.eventId)) { countedFocused.add(entry.eventId); stats.suppressedFocused.push(entry.eventId) }
        continue
      }
      seen.add(entry.eventId)
      show(entry)
    }
  }

  let timer: NodeJS.Timeout | undefined
  const tickMs = deps.tickMs ?? NOTIFY_TICK_MS
  timer = setInterval(review, tickMs)
  timer.unref?.()

  const notify: WorkerNotify = {
    review,
    stop(): void {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
    },
    testBlurWindow(): boolean {
      deps.window.blur?.()
      return deps.window.isFocused()
    },
    stats,
  }
  ;(globalThis as { __pbotsNotify?: WorkerNotify }).__pbotsNotify = notify
  return notify
}
