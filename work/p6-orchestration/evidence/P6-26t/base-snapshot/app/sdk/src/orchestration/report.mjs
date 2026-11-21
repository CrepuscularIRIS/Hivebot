// P6-12 worker 回报 → 主 bot（PLAN p6-orchestration v4.1 P6-12；决策 14/16/17/27/28）。
// 触发、合批、撤回与 result 载荷全在本文件；投递与恢复的地板是 P6-21：
// delivery.send（幂等 + flush 回执）、computeDue（两份落盘日志重算，唯一真相）。
// 本文件不存任何队列——重启后 flush 重算即恢复（决策 27①②）。
//
// 合批语义同构 G18 completion-revivals.ts:91-153（第 3 级，只搬语义）：
// 主 bot 忙时到达的回报全攒（flush 入口判忙即返回），主 bot turn/end 是触发，
// 触发时合成一条通知；空闲时首项到达后等 ≤BATCH_WINDOW_MS 收齐（决策 15）。
// 单飞（flushing）对应 G18 的 reviving 集合：投递进行中不重入，期间新到的
// 事件会再开一个窗口，幂等重算兜底。
// 文案参照 dsh continuation-messages.ts:80-172 的 settlement 结构（一行状态
// 总结 + 尾正文），按决策 17 改写为「数据非指令」口径（buildReportMessage，
// P6-21 已带）。
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { orchDataDir, readMainBotId, BOTS_JSON } from './identity.mjs'
import { buildReportMessage, computeDue, REPORT_PREFIX } from './pending.mjs'
import { foldAssignments, QUESTION_TOOL } from './assignment.mjs'

/** 决策 15：空闲主 bot 首项回报后的收齐窗口（`ponytail:` 常量）。 */
export const BATCH_WINDOW_MS = 2_000
/** 决策 17：result 上限（字），超出截断并附 worker id。 */
export const RESULT_LIMIT = 4_000
/** crashAt 注入点的退出码（测试专用，P6-09 (f5) 同法）。 */
const CRASH_EXIT_CODE = 87

const warn = (text) => console.warn(`[pbots-orchestration] ${text}`)

/**
 * 决策 17：Assignment 回合「末工具后正文」——turn 内最后一个 tool/result 之后
 * 的 assistant 文本拼接；无工具则取整 turn 正文；末工具后无正文 → undefined
 * （调用方按决策 28 的 outcome 兜底，不补 result）。
 * @param {object[]} events projected worker log（delivery.mjs projectEvent 形状）。
 * @param {number} turn the assignment-consuming turn.
 * @returns {string | undefined}
 */
export function resultTextFor(events, turn) {
  let lastToolSeq = -1
  const texts = []
  for (const ev of events) {
    if (ev.type === 'tool/result' && ev.turn === turn) lastToolSeq = ev.seq
    else if (ev.type === 'assistant/message' && ev.turn === turn && ev.text) texts.push(ev)
  }
  const tail = texts.filter((t) => t.seq > lastToolSeq).map((t) => t.text).join('')
  return tail === '' ? undefined : tail
}

/**
 * 决策 17 截断：≤limit 原样；超出则截到**含标注共 limit 字**（result 整体
 * 不超过上限），标注指明截断与 worker id。
 * @param {string} text @param {string} workerId @param {number} [limit]
 */
export function truncateResult(text, workerId, limit = RESULT_LIMIT) {
  if (text.length <= limit) return text
  const note = `…（result 已截断，完整内容见 worker ${workerId}）`
  return text.slice(0, limit - note.length) + note
}

/** bots.json 里 createdBy = mainId 的 worker id 集（决策 27② 的遍历范围）。 */
async function ownWorkerIds(dir, mainId) {
  let text
  try {
    text = await readFile(join(dir, BOTS_JSON), 'utf8')
  } catch {
    return []
  }
  try {
    const meta = JSON.parse(text)
    const bots = meta?.bots
    if (bots === null || typeof bots !== 'object') return []
    return Object.keys(bots).filter((id) => bots[id]?.createdBy === mainId)
  } catch {
    return []
  }
}

/**
 * The P6-12 reporter: watches worker terminal / ask events and main-bot turn
 * ends, recomputes the due set from the two persisted logs, and delivers one
 * batched pbots-worker message to the main bot. Owns no queue — every flush
 * is a fresh decision-27 recomputation.
 */
export class Reporter {
  /**
   * @param {object} orch the owning OrchestrationPlugin（delivery / agentOf /
   * config 与 ctx；与 create/send 共用同一实例）。
   * @param {{ batchWindowMs?: number }} [options] 窗口可注入（测试缩短用；
   * 缺省 BATCH_WINDOW_MS，决策 15）。
   */
  constructor(orch, { batchWindowMs = BATCH_WINDOW_MS } = {}) {
    this.orch = orch
    this.ctx = orch.ctx
    this.batchWindowMs = batchWindowMs
    this.timer = null
    this.flushing = false
    /** 进程内主 bot 回合记账：turn/start/end 事件维护，flush 判忙的快路径。 */
    this.mainRunning = false
    /**
     * 事件判「是不是主 bot」用的 mainId 缓存；每次 flush 前刷新。换主窗口内
     * 可能滞后一步——滞后的后果只是触发走 2s 窗口而非立即，恰一次语义不受
     * 影响（flush 内部重读权威 mainBotId）。`ponytail:` 不监听 bots.json。
     */
    this.cachedMainId = undefined
    this.off = () => {}
  }

  /** Mount event listeners and run the boot reconcile (决策 27③: SDK 启动直接扫日志). */
  start() {
    this.off = this.ctx.on('session/event', (session, event) => this.handleEvent(session, event))
    queueMicrotask(() => { this.flush('boot').catch((error) => warn(`boot reconcile failed: ${String(error instanceof Error ? error.message : error)}`)) })
    return () => this.stop()
  }

  stop() {
    this.off()
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /** @param {unknown} session @param {{ type?: string, data?: any }} event */
  handleEvent(session, event) {
    if (!event || typeof event.type !== 'string') return
    const sid = String(session?.id ?? '')
    if (sid === '') return
    if (event.type === 'turn/start') {
      if (sid === this.cachedMainId) this.mainRunning = true
      return
    }
    if (event.type === 'turn/end') {
      if (sid === this.cachedMainId) this.mainRunning = false
      if (String(event.data?.reason?.kind ?? '') === 'aborted') {
        // 决策 27⑤（v4.1）：用户停止 → 撤回 inbox 中待处理回报（落 canceled
        // splice，键回未投），aborted 不触发投递；用户下一回合结束后补投。
        if (sid === this.cachedMainId) this.withdrawWithRetry(sid)
        return
      }
      // 主 bot 终态（触发，合成一条）与 worker 终态（收齐）共用 ≤2s 窗口：
      // 窗口内新到的键并入同一条通知（决策 15 / G18 semantics）。
      this.scheduleFlush()
      return
    }
    if (event.type === 'approval/asked') {
      this.scheduleFlush() // ask 挂起（回合不结束，等作答——必须由事件触发）
      return
    }
    if (event.type === 'tool/call' && String(event.data?.name ?? '') === QUESTION_TOOL) {
      this.scheduleFlush() // 提问挂起（同上）
    }
  }

  /** Open (or keep) the ≤2s collection window; one flush per window. */
  scheduleFlush() {
    if (this.timer !== null) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush('window').catch((error) => warn(`report flush failed: ${String(error instanceof Error ? error.message : error)}`))
    }, this.batchWindowMs)
  }

  /**
   * 决策 16：投递条件——主 bot 无进行中回合且 inbox 无待处理 user 消息
   * （用户消息永远先跑）。
   * @param {object} agent
   */
  mainBusy(agent) {
    if (this.mainRunning) return true
    if (agent.status === 'running') return true
    return [...agent.inbox.nextTurn, ...agent.inbox.nextStep].some((m) => m?.source?.kind === 'user')
  }

  /**
   * One recompute-and-deliver pass. Single-flighted; a pass that finds the
   * main bot busy just returns (the reports stay due in the logs and the next
   * trigger — the main bot's own turn/end — reopens the window).
   * @param {string} trigger 'boot' | 'window'（日志用）。
   */
  async flush(trigger) {
    if (this.flushing) return
    this.flushing = true
    try {
      const dir = this.orch.config.dataDir ?? orchDataDir()
      const mainId = await readMainBotId(dir)
      this.cachedMainId = mainId
      if (mainId === null || mainId === undefined) return // 无主 / 不可读 → 没有回报对象，fail closed
      let mainAgent
      try {
        mainAgent = await this.orch.agentOf(mainId)
      } catch (error) {
        warn(`main bot ${mainId} unresolvable, reports stay due: ${String(error instanceof Error ? error.message : error)}`)
        return
      }
      if (this.mainBusy(mainAgent)) return // 忙：攒（决策 15），下次触发重开窗口

      const mainEvents = await this.orch.delivery.readLog(mainId)
      /** @type {Array<{ workerId: string, events: object[], idle: boolean }>} */
      const workers = []
      const folds = new Map()
      for (const workerId of await ownWorkerIds(dir, mainId)) {
        const events = await this.orch.delivery.readLog(workerId)
        // 冷 worker 不 resume：重启后不可能有 running 回合（slots 同款口径），
        // 无 turn/end + 非 running 即崩溃孤儿 → computeDue 判 stopped。live 的
        // 才读 status（maintenance 期间报 idle，方向安全：最多早投，不丢）。
        const live = this.ctx.agents.get(workerId)
        const idle = live === undefined ? true : live.status !== 'running'
        workers.push({ workerId, events, idle })
        folds.set(workerId, foldAssignments(events))
      }
      const { due, needsWake } = computeDue({ mainId, mainEvents, workers })
      // (f2)：恢复的 inbox 不自动认领——唤醒（remove + 同 id followup）
      for (const nw of needsWake) {
        try {
          this.orch.delivery.wake(await this.orch.agentOf(nw.sessionId), nw.messageId)
        } catch (error) {
          warn(`wake ${nw.sessionId}/${nw.messageId} failed: ${String(error instanceof Error ? error.message : error)}`)
        }
      }
      if (due.length === 0) return
      if (this.orch.config.crashAt === 'report-before-send') process.exit(CRASH_EXIT_CODE)
      // 决策 17：end 项补 result（末工具后正文，≤4000 截断附 worker id）
      const items = due.map((item) => {
        if (item.kind !== 'end') return item
        const turn = folds.get(item.workerId)?.assignments.get(item.assignmentId)?.turn
        const raw = turn === undefined ? undefined : resultTextFor(workers.find((w) => w.workerId === item.workerId)?.events ?? [], turn)
        return raw === undefined ? item : { ...item, result: truncateResult(raw, item.workerId) }
      })
      if (this.orch.config.crashAt === 'report-before-splice') process.exit(CRASH_EXIT_CODE)
      await this.orch.delivery.send(mainAgent, buildReportMessage(items))
      if (this.orch.config.crashAt === 'report-after-send') process.exit(CRASH_EXIT_CODE)
    } finally {
      this.flushing = false
    }
  }

  /**
   * withdrawPendingReports 的延迟重试壳：session/event 回调在 turn/end 的
   * append 发布栈内同步执行，此刻 inbox.remove 的落盘 append 会撞宿主的
   * 重入保护（P6-12 live ⑦ 实测）。跳到发布窗口外重试，短暂竞态自愈；
   * 重试上限后放弃（该键仍由日志重算兜底——remove 未落 canceled 时它回到
   * pendingReports，与 claim 窗口同一恢复路径）。
   * @param {string} mainId @param {number} [attempt]
   */
  withdrawWithRetry(mainId, attempt = 0) {
    try {
      this.withdrawPendingReports(mainId)
    } catch (error) {
      if (attempt >= 50) {
        warn(`withdraw kept failing for ${mainId}: ${String(error instanceof Error ? error.message : error)}`)
        return
      }
      setTimeout(() => this.withdrawWithRetry(mainId, attempt + 1), 50)
    }
  }

  /**
   * 决策 27⑤：把主 bot inbox 中待处理的 `pbots-report:*` 逐条撤回
   * （inbox.remove 落 `outcome:'canceled'` splice → 键回未投），用户停止后
   * 下一条用户消息的回合不会与回报混合，回合结束后补投恰一次。
   * @param {string} mainId
   */
  withdrawPendingReports(mainId) {
    const agent = this.ctx.agents.get(mainId)
    if (agent === undefined) return // 冷主 bot无 live inbox；claim 窗口的键由日志重算覆盖
    let withdrawn = 0
    for (const message of [...agent.inbox.nextTurn, ...agent.inbox.nextStep]) {
      if (String(message?.id ?? '').startsWith(REPORT_PREFIX)) {
        agent.inbox.remove(message.id)
        withdrawn += 1
      }
    }
    if (withdrawn > 0) warn(`withdrew ${withdrawn} pending report message(s) after an aborted main-bot turn`)
  }
}
