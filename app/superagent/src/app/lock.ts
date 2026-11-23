import { readFileSync, writeFileSync, unlinkSync, utimesSync, existsSync, statSync, rmSync, renameSync } from 'node:fs'
import { createRequire } from 'node:module'
// proper-lockfile 是 CJS 且 module.exports=lock（promise 版）——default import 在 tsx/ESM 下
// 解析成 promise 版 lock()，返回 Promise 而非 release 函数。createRequire 点名 lockSync。
const require_ = createRequire(import.meta.url)
const lockSync = require_('proper-lockfile').lockSync as (target: string, opts?: { stale?: number; update?: number }) => () => void

// 复测 #1（4b922fde）语义：互斥无条件成立；恢复只走两条路——owner 验尸=死，或无证据+超宽限。
// 旧实现三洞：①stale:30_000 无保活，proper-lockfile 按 mtime 自动偷活锁（长持有的编排器必被偷）
// ②ELOCKED 无 owner 证据时立即偷——首实例「已持锁未写 owner」的微秒窗口可被第二实例打破
// ③非 Linux 无 /proc 时 ownerAlive 恒 false——Windows（DS-Bot）活锁必被偷。
// 修法：stale 设为永不过期；死 owner 直接删锁目录重取；裸锁要求 mtime 超过宽限期才回收；
// 验活三态 alive/dead/unknown，unknown 不偷（fail-closed）；非 Linux 用 process.kill(pid,0) 探活。

export interface LockOwner { pid: number; startedAt: string }
export type Liveness = 'alive' | 'dead' | 'unknown'

/** 无 owner 证据的裸锁多久后才可兜底回收（覆盖「持锁后、写 owner 前」崩溃的残留）。 */
const NO_OWNER_GRACE_MS = 60_000
/**
 * proper-lockfile 的 stale：mtime 自动偷锁必须彻底关闭。
 * 不能传 0——lib/lockfile.js:219 Math.max(stale || 0, 2000) 会钳到 2000ms，事件循环阻塞 2s 即被偷。
 * 也不能传超大值——内部 update 定时器 Math.min(update, stale/2) 溢出 32 位 setTimeout。
 * 4e9ms（约 126 年）既够不到，stale/2=2e9 也恰在 32 位有符号上限内。
 * update: 2000 显式保活 mtime——持有者活着时锁目录 mtime 恒新鲜，
 * 「无 owner 裸锁宽限」判定（<60s 视为活）因此只会在持有者死亡后开始计时。
 */
const NEVER_STALE_MS = 4_000_000_000

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

/** 信号探活兜底（非 Linux 或 /proc 不可读）：ESRCH=死；0/EPERM=活；其它错误=unknown。 */
function probeLiveness(pid: number): Liveness {
  try {
    process.kill(pid, 0)
    return 'alive'
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH' ? 'dead' : 'unknown'
  }
}

/** 持有者三态验活：/proc 可读时按 pid+starttime 判（含 pid 复用防护）；否则退到信号探活。 */
export function ownerLiveness(owner: LockOwner): Liveness {
  const startedAt = processStartTime(owner.pid)
  if (startedAt !== null) return startedAt === owner.startedAt ? 'alive' : 'dead'
  return probeLiveness(owner.pid)
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
 * stateDir 互斥锁（互斥优先，恢复有证据才做）。
 * - 正常获取 → 写 owner 证据 → 返回
 * - ELOCKED + owner 验尸=dead → 删锁目录重取（SIGKILL 立即恢复）
 * - ELOCKED + owner=alive/unknown，或无 owner 且裸锁 mtime 未超宽限 → 抛 ELOCKED（互斥）
 * - ELOCKED + 无 owner + 裸锁 mtime 超宽限 → 兜底回收（写 owner 前崩溃的残留）
 */
export function acquireStateLock(target: string, log?: { warn: (f: string, ...a: unknown[]) => void }): StateLock {
  const myStart = processStartTime(process.pid) ?? String(Date.now())
  let release: ReturnType<typeof lockSync>
  try {
    release = lockSync(target, { stale: NEVER_STALE_MS, update: 2_000 }) as unknown as ReturnType<typeof lockSync>
  } catch (first) {
    if ((first as NodeJS.ErrnoException).code !== 'ELOCKED') throw first
    const owner = readOwner(target)
    if (owner) {
      const liveness = ownerLiveness(owner)
      if (liveness !== 'dead') throw first     // 活/不确定：互斥必须成立（fail-closed）
      log?.warn?.('dsh-superagent: stateDir lock held by dead holder (pid %s); recovering', String(owner.pid))
    } else {
      // 无 owner 证据：可能是首实例「已持锁未写 owner」的窗口（活），也可能 是写 owner 前崩溃的残留（死）。
      // mtime 新鲜=窗口（拒）；超宽限=残留（回收）。
      const lockDir = `${target}.lock`
      let ageMs = Number.POSITIVE_INFINITY
      try { ageMs = Date.now() - statSync(lockDir).mtimeMs } catch { /* 目录不在：直接重取 */ }
      if (ageMs < NO_OWNER_GRACE_MS) throw first
      log?.warn?.('dsh-superagent: ownerless stateDir lock is %dms old; recovering (crashed before writing owner evidence)', Math.round(ageMs))
    }
    // 原子收敛回收（审查 F0）：两个竞争者都验到死 owner 时，直接 rmSync 会让后删者删掉先接管者的新锁。
    // rename 是原子的：只有一个竞争者能把锁目录改成自己的 tombstone——赢家独占重取权，输家按互斥抛出。
    const lockDir = `${target}.lock`
    const tomb = `${lockDir}.recovering-${process.pid}-${Date.now()}`
    try {
      renameSync(lockDir, tomb)
    } catch {
      throw first   // 已被并发回收者接管（或锁目录消失）：互斥优先，不做盲重试（重试窗口可能双持锁）
    }
    try { rmSync(tomb, { recursive: true, force: true }) } catch { /* 尸体残留不影响 <target>.lock 互斥 */}
    release = lockSync(target, { stale: NEVER_STALE_MS, update: 2_000 }) as unknown as ReturnType<typeof lockSync>
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
