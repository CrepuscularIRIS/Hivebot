// P6-10 容量占位（PLAN 决策 9 / BRIEF D9⑥⑧）：create / send 共用一个
// 「查 + 占位」计数器，两步之间无 await（SDK 单进程，同一 tick 内原子）。
// 占位按 worker 回合运行态计：create 在入口占位，worker 的 turn/end 释放
// （create.mjs 的一shot监听）；启动失败 / 超时 / 断流当场释放。
// P6-10.f1 ②：人工启动（不经 create_bot）的 worker 回合由 trackWorkerTurns
// 在 turn/start 收养进同一计数——否则 bots.json 里的 worker 被手动跑起来时
// 容量虚报 0，并发上限失真。「启动对账」以此实现：新进程里不存在已 running
// 的回合（重启即打断），回合边界对账才是可达状态的全集。
// ponytail: 进程内计数，重启归零（重启打断全部 worker 回合，归零正确）；
// 回合挂死时容量少一格，上限由 P5-27 超时兜底（决策 9 / 26）。
/** Same-tick capacity reservation shared by the coordinator tools (P6-10 ⑩). */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { orchDataDir, BOTS_JSON } from './identity.mjs'

/** 并发 running worker 上限（BRIEF §4-5「并发上限 3」）。 */
export const DEFAULT_CAPACITY = 3

/**
 * Worker session ids registered in bots.json（决策 31 `bots[id].createdBy`；
 * 读取失败 / 无 bots 键 → 空，视为没有可收养的 worker）。
 * @param {string} [dir] data dir (default orchDataDir()).
 * @returns {string[]}
 */
export function readWorkerIds(dir = orchDataDir()) {
  let meta
  try {
    meta = JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8'))
  } catch {
    return []
  }
  const bots = meta?.bots
  if (bots === null || typeof bots !== 'object') return []
  return Object.keys(bots).filter((id) => typeof bots[id]?.createdBy === 'string' && bots[id].createdBy !== '')
}

/**
 * P6-10.f1 ②：把人工启动的 worker 回合收养进共享容量。turn/start 时查
 * bots.json 认 worker 并占位，turn/end 释放；create 流程已占位的 session 在
 * 返回的 holds 里标 'create'（由 create.mjs 登记与释放），不重复计。
 * P6-10.f1a：满额时 turn/start 的 worker 已在 running，收养不了但必须记账
 * （pending）；任何一路释放（本函数的 turn/end、create 流程的 release——两者
 * 都走 Slots.release() 的 onFree 回调）后补收养最早的 pending。不变式：
 * pending 非空 ⇔ used == limit，因此 create 的 reserve 在有人 pending 时必失败，
 * 容量不虚报。
 * ponytail: 每次 turn/start 重读 bots.json（worker ≤ 数十个、事件在回合边界，
 * 开销可忽略；换来崩溃窗口新写入的 worker 也能被收养）。
 * @param {{ on(name: string, fn: (...args: any[]) => void): unknown }} ctx dsh plugin context.
 * @param {Slots} slots 共享容量（P6-10 ⑩）。
 * @param {() => string} [resolveDir] data dir 解析（缺省 orchDataDir()）。
 * @returns {Map<string, 'create' | 'turn'>} sessionId → 占位来源，create 流程共用。
 */
export function trackWorkerTurns(ctx, slots, resolveDir = orchDataDir) {
  /** @type {Map<string, 'create' | 'turn'>} */
  const holds = new Map()
  /** @type {Set<string>} */
  const pending = new Set()
  const adopt = () => {
    const next = pending.values().next().value
    if (next === undefined) return
    pending.delete(next)
    if (slots.reserve()) holds.set(next, 'turn')
    else pending.add(next) // 防御：刚释放一格必成功，失败则继续等
  }
  slots.onFree = adopt
  ctx.on('session/event', (session, event) => {
    const id = String(session?.id ?? '')
    if (id === '') return
    if (event?.type === 'turn/start') {
      if (holds.has(id) || pending.has(id) || !readWorkerIds(resolveDir()).includes(id)) return
      if (slots.reserve()) holds.set(id, 'turn')
      else pending.add(id)
    } else if (event?.type === 'turn/end') {
      if (holds.get(id) === 'turn') {
        // 释放按 hold 记账，不重读 bots.json：回合中途 worker 被删也照常释放。
        holds.delete(id)
        slots.release() // 内部 onFree → 补收养 pending
      } else {
        pending.delete(id) // 满额未收养的 worker 结束：没占过格子，不释放
      }
    }
  })
  return holds
}

export class Slots {
  /**
   * @param {number} [limit] running-worker capacity (default 3).
   */
  constructor(limit = DEFAULT_CAPACITY) {
    this.limit = limit
    this.count = 0
    /** @type {() => void} P6-10.f1a：释放后回调，trackWorkerTurns 挂补收养 pending worker。 */
    this.onFree = undefined
  }

  /** Currently held slots. @returns {number} */
  get used() {
    return this.count
  }

  /**
   * Check-and-occupy in the same tick — no await between the two (决策 9).
   * @returns {boolean} false = at capacity.
   */
  reserve() {
    if (this.count >= this.limit) return false
    this.count += 1
    return true
  }

  /** Free one slot (turn/end or startup failure). Never underflows. */
  release() {
    if (this.count > 0) this.count -= 1
    this.onFree?.()
  }
}

// 进程内单例：P6-11/12/13 的协调者工具都从 sharedSlots() 拿同一份计数，
// 不各写一份（P6-10 ⑩）。首次调用定容量（orchestration.yml 的 capacity）。
let shared

/**
 * The one process-wide slot counter.
 * @param {number} [limit] capacity, honored by the first caller only.
 * @returns {Slots}
 */
export function sharedSlots(limit) {
  if (shared === undefined) shared = new Slots(limit)
  return shared
}
