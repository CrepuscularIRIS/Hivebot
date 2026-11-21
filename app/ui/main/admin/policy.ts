// P7-F2 main 侧权限边界（p7-admin PLAN §3.2「权限边界」行）：SDK 从宿主
// turn/source/message 原文取证（sdk/src/admin/origin.mjs + authority.mjs），
// main 按权威身份、generation、记录重验——originRef 是宿主生成且可重验的
// 引用，不是模型声明；伪 source / 旧代 / 记录不存在一律拒。
// 语义级 H1 判定（动作/目标/参数三元组）在 SDK 侧 authority；本文件只做
// 身份与代际核验，defense-in-depth，不重复实现词表。
import { randomUUID } from 'node:crypto'

/** originRef 记录（宿主为某个 (session, turn) 签发；F3 接生命周期后由宿主侧生成）。 */
export interface AdminOriginRefRecord {
  originRef: string
  sessionId: string
  turnId: string
  generation: number
  originClass: 'user' | 'delegated' | 'tainted'
}

export type AdminReverifyResult = { ok: true } | { ok: false, code: string, message: string }

/** 铸一个新的 originRef（不可推导：uuid v4）。 */
export function mintOriginRef(): string {
  return `admin-origin:${randomUUID()}`
}

function validRecordShape(record: AdminOriginRefRecord): boolean {
  return typeof record.originRef === 'string' && record.originRef !== ''
    && typeof record.sessionId === 'string' && record.sessionId !== ''
    && typeof record.turnId === 'string' && record.turnId !== ''
    && Number.isInteger(record.generation) && record.generation >= 0
    && (record.originClass === 'user' || record.originClass === 'delegated' || record.originClass === 'tainted')
}

/**
 * main 侧 originRef 台账：签发与查询。originRef 不可重复签发（一个引用一
 * 个回合一代）；重复 / 形状坏 → 抛错（程序错误，不是用户输入）。
 */
export class AdminOriginRefLedger {
  #records = new Map<string, AdminOriginRefRecord>()

  issue(record: AdminOriginRefRecord): AdminOriginRefRecord {
    if (!validRecordShape(record)) throw new Error('invalid origin-ref record: {originRef, sessionId, turnId, generation, originClass} required')
    if (this.#records.has(record.originRef)) throw new Error(`duplicate origin-ref: ${record.originRef}`)
    this.#records.set(record.originRef, { ...record })
    return { ...record }
  }

  lookup(originRef: string): AdminOriginRefRecord | undefined {
    const hit = this.#records.get(originRef)
    return hit === undefined ? undefined : { ...hit }
  }
}

/** wire 请求的最小面（重验只看身份四元组，动作语义在 SDK 侧）。 */
export interface AdminRequestIdentity {
  requestId: string
  generation: number
  sessionId: string
  turnId: string
  originRef: string
}

function isIdentity(value: unknown): value is AdminRequestIdentity {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.requestId === 'string' && v.requestId !== ''
    && Number.isInteger(v.generation)
    && typeof v.sessionId === 'string' && v.sessionId !== ''
    && typeof v.turnId === 'string' && v.turnId !== ''
    && typeof v.originRef === 'string' && v.originRef !== ''
}

const reject = (code: string, message: string): { ok: false, code: string, message: string } => ({ ok: false, code, message })

/**
 * 权威重验：请求身份与台账记录、当前连接代逐项对上。
 * 拒绝码：pbots/invalid-args（形状）/ unknown-origin-ref（伪 source、模型
 * 自报）/ stale-generation（旧代）/ origin-ref-mismatch（引用不属于该回合）/
 * tainted-turn（污染来源）。
 */
export function reverifyAdminRequest(request: unknown, record: AdminOriginRefRecord | undefined, currentGeneration: number): AdminReverifyResult {
  if (!isIdentity(request)) return reject('pbots/invalid-args', 'admin request lacks {requestId, generation, sessionId, turnId, originRef}')
  if (record === undefined || record.originRef !== request.originRef) {
    return reject('unknown-origin-ref', 'originRef is not host-issued; model-declared refs are rejected')
  }
  if (request.generation !== currentGeneration) {
    return reject('stale-generation', `request generation ${request.generation} is not the current generation ${currentGeneration}`)
  }
  if (record.generation !== currentGeneration) {
    return reject('stale-generation', `origin-ref record generation ${record.generation} is not the current generation ${currentGeneration}`)
  }
  if (record.sessionId !== request.sessionId || record.turnId !== request.turnId) {
    return reject('origin-ref-mismatch', 'originRef belongs to a different session/turn')
  }
  if (record.originClass === 'tainted') {
    return reject('tainted-turn', 'turn claimed pbots-worker; reject all admin requests from it')
  }
  return { ok: true }
}
