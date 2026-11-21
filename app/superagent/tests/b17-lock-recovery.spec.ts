import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lockSync, unlockSync } from 'proper-lockfile'

// 纠错轮：R17 崩溃自愈的锁语义验收（Codex 审查 #2）。
// proper-lockfile 4.1.2 真机制（实测锚定）：
//   锁 = <target>.lock 空目录（父目录 mkdir 原子创建）；stale 判定 = 目录 mtime 距今超 stale ms。
//   A 活锁 → 第二获取 ELOCKED（互斥正确）
//   B SIGKILL 刚死（mtime 新鲜）→ ELOCKED——30s stale 窗口内 unlockSync(ENOTACQUIRED) 重试救不了（Codex 复现）
//   C mtime 超 stale → 可直接重取（stale 机制自愈）
// 修复（runtime.ts）：B 场景强制把 .lock mtime 拨回 stale 之前再重取——引擎单实例前提
// （dsh 进程锁先挡并行）下安全；本文件固定三语义+修复行为，防回归。

const STALE = 30_000

function acquireWithCrashRecovery(target: string): () => void {
  // runtime.ts 修复后的取锁逻辑（与实现保持同步）：
  try {
    return lockSync(target, { stale: STALE }) as unknown as () => void
  } catch (first) {
    if ((first as NodeJS.ErrnoException).code !== 'ELOCKED') throw first
    // ELOCKED：可能是 stale 残留（SIGKILL 后 mtime 停在死亡时刻）。
    // 解法：unlockSync 尝试（本进程持有者的另一形态）→ 仍 ELOCKED 则强制过期 mtime 再取。
    try { unlockSync(target) } catch { /* ENOTACQUIRED：不是本进程的锁 */ }
    try {
      return lockSync(target, { stale: STALE }) as unknown as () => void
    } catch (second) {
      if ((second as NodeJS.ErrnoException).code !== 'ELOCKED') throw second
      // stale 窗口内残留：把 .lock 目录 mtime 拨到 stale 之前，让 stale 机制接管。
      const lockDir = `${target}.lock`
      const past = new Date(Date.now() - STALE - 10_000)
      utimesSync(lockDir, past, past)
      return lockSync(target, { stale: STALE }) as unknown as () => void
    }
  }
}

function makeOrphanLock(target: string, ageMs: number) {
  const lockDir = `${target}.lock`
  rmSync(lockDir, { recursive: true, force: true })
  mkdirSync(lockDir)
  if (ageMs > 0) { const past = new Date(Date.now() - ageMs); utimesSync(lockDir, past, past) }
}

describe('R17 崩溃自愈锁语义（Codex 审查 #2）', () => {
  it('A 活锁互斥：真锁持有时第二获取必拒', () => {
    const target = join(mkdtempSync(join(tmpdir(), 'sa-mutex-')), 't')
    writeFileSync(target, 'x')
    const release = lockSync(target, { stale: STALE })
    let rejected = false
    try { lockSync(target, { stale: STALE }) } catch { rejected = true }
    release()
    expect(rejected).toBe(true)
  })

  it('B 立即恢复（Codex 阻塞场景）：SIGKILL 刚死（mtime 新鲜）acquireWithCrashRecovery 直接成功', () => {
    const target = join(mkdtempSync(join(tmpdir(), 'sa-crash-')), 't')
    writeFileSync(target, 'x')
    makeOrphanLock(target, 0) // 新鲜孤儿锁=刚被 SIGKILL 的形态
    const release = acquireWithCrashRecovery(target) // 修复前：ELOCKED 三连挂死
    expect(typeof release).toBe('function')
    release()
  })

  it('C stale 自愈：mtime 超 stale 窗后直接可取（机制本身）', () => {
    const target = join(mkdtempSync(join(tmpdir(), 'sa-stale-')), 't')
    writeFileSync(target, 'x')
    makeOrphanLock(target, STALE + 10_000)
    const release = lockSync(target, { stale: STALE })
    expect(typeof release).toBe('function')
    release()
  })

  it('B 变体：锁目录不存在（正常首启）直接获取', () => {
    const target = join(mkdtempSync(join(tmpdir(), 'sa-clean-')), 't')
    writeFileSync(target, 'x')
    const release = acquireWithCrashRecovery(target)
    expect(typeof release).toBe('function')
    release()
  })
})
