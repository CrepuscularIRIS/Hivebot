// P7-F2 回合来源三分（BRIEF v2.3 §6.1.0 / §6.1.1 H3；p7-admin PLAN §3.2）：
// user（人类回合，唯一自主来源）/ delegated（goal·schedule 等委托——内部与
// 未知 kind 同归此类：不污染【R2-1 不变】但无自主权）/ tainted（认领过
// pbots-worker，仍走 P6-12 旧 guard 全拒）。沿用 P6 TurnOrigin 实例模式
//（orchestration/turn-origin.mjs 的 per-agent claim ledger）。
//
// D-1 定案后的接线位：跨回合正文隔离（H2/H4）——worker 回报、事件正文、
// 工具结果永远不是授权证据；authority.mjs 只接收宿主传入的
// humanUtteranceOfGrant（人类来源原文），本模块只产出分类。正文过滤的采集
// 接线（哪些原文可以喂给 authority）等 D-1 子题①/② 定案后在此挂接，当前
// 刻意不实现。
import { TurnOrigin, TAINT_KIND } from '../orchestration/turn-origin.mjs'

export { TAINT_KIND }
/** D-1 子题① 定案前唯一人类来源 kind（H3：别名 user-approval 等不算）。 */
export const HUMAN_KIND = 'user'
/** 委托来源（goal / schedule）；其余内部与未知 kind 同样落在 delegated（无自主权）。 */
export const DELEGATED_KINDS = ['goal', 'schedule']

/**
 * 三分分类一组已认领的 source kinds。
 * @param {string[]} kinds
 * @returns {{ originClass: 'user' | 'delegated' | 'tainted', auditKinds: string[] }}
 *   auditKinds 仅审计；delegated 不等于 tainted——普通未知 kind 的普通工具
 *   不被连坐全拒（R2-1），只是没有自主授权能力（H3）。
 */
export function classifyOrigin(kinds) {
  const list = [...kinds]
  const auditKinds = [...new Set(list)]
  if (list.includes('pbots-worker')) return { originClass: 'tainted', auditKinds }
  if (list.includes(HUMAN_KIND)) return { originClass: 'user', auditKinds }
  return { originClass: 'delegated', auditKinds }
}

/**
 * 管理轴的 per-agent 回合 claim 账本（沿用 P6 TurnOrigin 实例模式）。
 * 无 claim 的回合分类为 delegated：污染轴上 P6 仍按 user 处理（没有可拒的
 * 东西），但自主权轴 fail-closed——没有人类来源就没有授权能力。
 */
export class AdminTurnOrigin extends TurnOrigin {
  /**
   * @param {string} agentId @param {number} [turn] 缺省取该 agent 最新回合。
   * @returns {{ originClass: 'user' | 'delegated' | 'tainted', auditKinds: string[] }}
   */
  classify(agentId, turn = this.lastTurn(agentId)) {
    if (turn === undefined || turn === null) return classifyOrigin([])
    return classifyOrigin(this.claims(agentId, turn))
  }
}
