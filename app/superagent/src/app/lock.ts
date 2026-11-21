import { readFileSync, writeFileSync, unlinkSync, utimesSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
// proper-lockfile 是 CJS 且 module.exports=lock（promise 版）——default import 在 tsx/ESM 下
// 解析成 promise 版 lock()，返回 Promise 而非 release 函数。createRequire 点名 lockSync。
const require_ = createRequire(import.meta.url)
const lockSync = require_('proper-lockfile').lockSync as (target: string, opts?: { stale?: number }) => () => void

// 纠错轮二（Codex 复测 #1）：utimesSync 强制过期会偷活实例的锁（mtime 机制分不清持有者死活）。
// 语义先行：①活实例持有时第二获取必拒 ②SIGKILL 后立即可回收 ③持有者证据可读（pid+starttime）。
// 实现：锁目录旁写 owner 文件（pid+starttime）；ELOCKED 时验活——死了才强制过期重取。
// owner 文件在 release 时删除；SIGKILL 残留无害（只在 ELOCKED 路径读取）。

export interface LockOwner { pid: number; startedAt: string }

function ownerPath(target: string): string {
  return `${target}.lock.owner`
}

/** Linux /proc/<pid>/stat 的 starttime（field 22）——防 pid 复用误判。非 Linux/读不到=null。 */
function processStartTime(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    // comm 字段可能含空格括号——从最后一个 ')' 后切
    const after = stat.slice(stat.lastIndexOf(')') + 2)
    return after.trim().split(/\s+/)[19] ?? null   // field 22 overall = index 19 after state
  } catch { return null }
}

/** 持有者是否活着（pid 存在且 starttime 匹配——不匹配=pid 被复用，视为已死）。 */
export function ownerAlive(owner: LockOwner): boolean {
  const startedAt = processStartTime(owner.pid)
  if (startedAt === null) return false          // /proc 无此进程=死
  return startedAt === owner.startedAt           // pid 复用防护
}

function readOwner(target: string): LockOwner | null {
  try {
    const raw = readFileSync(ownerPath(target), 'utf8')
    const parsed = JSON.parse(raw) as LockOwner
    return typeof parsed.pid === 'number' && typeof parsed.startedAt === 'string' ? parsed : null
  } catch { return null }
}

export interface StateLock {
  release: () => void
}

/**
 * stateDir 互斥锁（跨进程语义正确版）。
 * - 正常获取：写 owner 证据 → 返回
 * - ELOCKED + owner 活着 → 抛 ELOCKED（互斥）
 * - ELOCKED + owner 死了/无证据 → utimesSync 强制过期（SIGKILL 恢复）→ 重取
 */
export function acquireStateLock(target: string, log?: { warn: (f: string, ...a: unknown[]) => void }): StateLock {
  const myStart = processStartTime(process.pid) ?? String(Date.now())
  let release: ReturnType<typeof lockSync>
  try {
    release = lockSync(target, { stale: 30_000 }) as unknown as ReturnType<typeof lockSync>
  } catch (first) {
    if ((first as NodeJS.ErrnoException).code !== 'ELOCKED') throw first
    const owner = readOwner(target)
    if (owner && ownerAlive(owner)) throw first    // 活持有者：互斥必须成立
    log?.warn?.('dsh-superagent: stateDir lock held by dead holder (pid %s); recovering', String(owner?.pid ?? '?'))
    if (!owner) {
      // 无 owner 证据的锁（旧版本写的/异常路径）——保守起见仍恢复：SuperAgent 的锁
      // 只由本产品持有，dsh 引擎单实例前提下无第二持有者。
      log?.warn?.('dsh-superagent: stateDir lock has no owner evidence; recovering (single-writer assumption)')
    }
    const lockDir = `${target}.lock`
    const past = new Date(Date.now() - 40_000)
    try { utimesSync(lockDir, past, past) } catch { /* 竞态：目录不在则直接重取 */ }
    release = lockSync(target, { stale: 30_000 }) as unknown as ReturnType<typeof lockSync>
  }
  // 获取成功：写 owner 证据（release 时删；SIGKILL 残留由下个获取者验尸）
  const op = ownerPath(target)
  if (existsSync(op)) { try { unlinkSync(op) } catch { /* 旧残留 */ } }
  writeFileSync(op, JSON.stringify({ pid: process.pid, startedAt: myStart } satisfies LockOwner))
  return {
    release: () => {
      try { unlinkSync(op) } catch { /* 已被清理 */ }
      release()
    },
  }
}
