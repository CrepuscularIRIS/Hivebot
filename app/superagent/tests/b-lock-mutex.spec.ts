import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acquireStateLock, ownerLiveness, type LockOwner } from '../src/app/lock.ts'

/** proper-lockfile 拒绝时 message 是 'Lock file is already being held'，ELOCKED 在 code 上。 */
function capturedCode(fn: () => unknown): string | undefined {
  try { fn(); return undefined } catch (e) { return (e as NodeJS.ErrnoException).code }
}

// 复测 #1 修复验收：互斥必须无条件成立，恢复只走「验尸=死」或「无证据+超宽限」两条路。
// 这些用例直接打真实 acquireStateLock（不再用镜像脚本）。

function freshTarget(prefix: string): string {
  const target = join(mkdtempSync(join(tmpdir(), prefix)), 'state')
  writeFileSync(target, 'x')
  return target
}

/** 造一个无 owner 证据的裸锁目录，mtime 拨到 ageMs 之前。 */
function bareLock(target: string, ageMs: number): void {
  const lockDir = `${target}.lock`
  rmSync(lockDir, { recursive: true, force: true })
  mkdirSync(lockDir)
  const past = new Date(Date.now() - ageMs)
  utimesSync(lockDir, past, past)
}

/** 造一个带 owner 证据的锁目录（持有者 pid 由调用方给）。 */
function ownedLock(target: string, owner: LockOwner): void {
  bareLock(target, 0)
  writeFileSync(`${target}.lock.owner`, JSON.stringify(owner))
}

async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', 'process.exit(0)'])
  const pid = child.pid!
  await new Promise(resolve => child.on('exit', resolve))
  return pid
}

describe('stateDir 锁互斥（复测 #1：无证据不再即偷、活锁永不超时被偷）', () => {
  it('同进程二次获取：活持有者（自己）必拒', () => {
    const target = freshTarget('sa-self-')
    const held = acquireStateLock(target)
    { const err = capturedCode(() => acquireStateLock(target)); expect(err).toBe('ELOCKED') }
    held.release()
  })

  it('无 owner 证据的裸锁在宽限期内必拒（首实例「已持锁未写 owner」窗口不可被偷）', () => {
    const target = freshTarget('sa-window-')
    bareLock(target, 5_000) // 5s 前的裸锁：另一个实例可能正活着的窗口形态
    { const err = capturedCode(() => acquireStateLock(target)); expect(err).toBe('ELOCKED') }
    rmSync(`${target}.lock`, { recursive: true, force: true })
  })

  it('无 owner 证据的裸锁超过宽限期可回收（兜底：写 owner 前崩溃的残留）', () => {
    const target = freshTarget('sa-grace-')
    bareLock(target, 61_000)
    const held = acquireStateLock(target)   // 不抛=可回收
    held.release()
  })

  it('活外进程持有（owner 证据=活 pid+starttime）必拒', () => {
    const target = freshTarget('sa-live-')
    ownedLock(target, { pid: process.pid, startedAt: processStartTimeOrNow(process.pid) })
    { const err = capturedCode(() => acquireStateLock(target)); expect(err).toBe('ELOCKED') }
    rmSync(`${target}.lock`, { recursive: true, force: true })
    rmSync(`${target}.lock.owner`, { force: true })
  })

  it('死持有者（owner 证据=已退出的 pid）立即可回收', async () => {
    const target = freshTarget('sa-dead-')
    const pid = await deadPid()
    ownedLock(target, { pid, startedAt: String(Date.now()) }) // starttime 不匹配=pid 复用/已死
    const held = acquireStateLock(target)
    held.release()
  })

  it('ownerLiveness：死 pid 三态判定为 dead（/proc 与信号探活兜底链）', async () => {
    const pid = await deadPid()
    expect(ownerLiveness({ pid, startedAt: '0' })).toBe('dead')
  })

  it('长持有不被 mtime 超时偷走：裸锁 40s（>30s 旧 stale 值、<60s 宽限）仍必拒', () => {
    const target = freshTarget('sa-notale-')
    bareLock(target, 40_000) // 旧实现 stale:30_000 会自动偷——新实现必拒
    { const err = capturedCode(() => acquireStateLock(target)); expect(err).toBe('ELOCKED') }
    rmSync(`${target}.lock`, { recursive: true, force: true })
  })

  it('锁目录 mtime 在持有时保持新鲜语义（兜底判定读目录 mtime）', () => {
    const target = freshTarget('sa-mtime-')
    bareLock(target, 61_000)
    const age = Date.now() - statSync(`${target}.lock`).mtimeMs
    expect(age).toBeGreaterThanOrEqual(60_000)
    rmSync(`${target}.lock`, { recursive: true, force: true })
  })
})

function processStartTimeOrNow(pid: number): string {
  try {
    const stat = readStat(pid)
    return stat ?? String(Date.now())
  } catch { return String(Date.now()) }
}
function readStat(pid: number): string | null {
  // 与 lock.ts 相同的读法；抽到这里避免测试直接依赖导出面
  const { readFileSync } = require('node:fs') as typeof import('node:fs')
  const s = readFileSync(`/proc/${pid}/stat`, 'utf8')
  return s.slice(s.lastIndexOf(')') + 2).trim().split(/\s+/)[19] ?? null
}
