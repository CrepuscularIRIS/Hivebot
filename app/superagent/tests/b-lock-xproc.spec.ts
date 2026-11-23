import { describe, it, expect } from 'vitest'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 纠错轮二（Codex 复测 #1）：跨进程锁语义。同进程单测测不到重启/互斥语义。
// Holder 与第二实例都用纯 CJS（proper-lockfile 是 CJS，node 直跑；owner 协议与
// src/app/lock.ts 的 acquireStateLock 同构——跨进程行为验证不需要 TS 源加载器）。
const ACQUIRE_JS = `
const { writeFileSync, readFileSync, utimesSync, unlinkSync, existsSync, statSync, rmSync, renameSync } = require('node:fs')
// holder 脚本写在 tmpdir——require 解析不从 superagent 出发会找不到包；
// 用调用方注入的 PKG_DIR createRequire 定位 proper-lockfile。
const { createRequire } = require('node:module')
const req = createRequire(process.env.PKG_DIR + '/')
const lockSync = req('proper-lockfile').lockSync
const NEVER_STALE_MS = 4000000000
function startTime(pid) {
  try { const s = readFileSync('/proc/' + pid + '/stat', 'utf8'); return s.slice(s.lastIndexOf(')') + 2).trim().split(/\\s+/)[19] || null } catch { return null }
}
// 三态：/proc 可读按 pid+starttime；否则信号探活（ESRCH=dead，0/EPERM=alive，其它=unknown 不偷）
function liveness(o) {
  const st = startTime(o.pid)
  if (st !== null) return st === o.startedAt ? 'alive' : 'dead'
  try { process.kill(o.pid, 0); return 'alive' } catch (e) { return e.code === 'ESRCH' ? 'dead' : 'unknown' }
}
const target = process.argv[2]
const myStart = startTime(process.pid) || String(Date.now())
function acquire() {
  try {
    return lockSync(target, { stale: NEVER_STALE_MS, update: 2000 })
  } catch (first) {
    if (first.code !== 'ELOCKED') throw first
    let owner = null
    try { owner = JSON.parse(readFileSync(target + '.lock.owner', 'utf8')) } catch {}
    if (owner) {
      if (liveness(owner) !== 'dead') throw first   // 活/unknown：fail-closed 互斥
    } else {
      // 无 owner 证据：mtime 新鲜=首实例窗口期（拒）；超 60s 宽限=崩溃残留（回收）
      let ageMs = Infinity
      try { ageMs = Date.now() - statSync(target + '.lock').mtimeMs } catch {}
      if (ageMs < 60000) throw first
    }
    // 原子收敛回收（与 src/app/lock.ts 同构，审查 F0）：rename 赢家独占重取权；输家按互斥抛出
    const lockDir = target + '.lock'
    const tomb = lockDir + '.recovering-' + process.pid + '-' + Date.now()
    try { renameSync(lockDir, tomb) } catch { throw first }
    try { rmSync(tomb, { recursive: true, force: true }) } catch {}
    return lockSync(target, { stale: NEVER_STALE_MS, update: 2000 })
  }
}
const release = acquire()
const op = target + '.lock.owner'
if (process.argv[5] !== 'skip-owner') {
  if (existsSync(op)) { try { unlinkSync(op) } catch {} }
  writeFileSync(op, JSON.stringify({ pid: process.pid, startedAt: myStart }))
}
console.log(process.argv[3] || 'HELD')
if (process.argv[4] === 'exit') { try { unlinkSync(op) } catch {}; try { release() } catch {}; process.exit(0) }
setInterval(() => {}, 1000)
`

function scriptPath(tag: string): string {
  const f = join(mkdtempSync(join(tmpdir(), 'holder-')), tag)
  writeFileSync(f, ACQUIRE_JS)
  return f
}

function runHolder(args: { target: string; tag: string; label?: string; mode?: string }) {
  const argv = [scriptPath(args.tag), args.target, args.label ?? 'HELD']
  argv.push(args.mode === 'exit' ? 'exit' : '-')
  if (args.mode === 'skip-owner') argv.push('skip-owner')
  return spawn(process.execPath, argv, { stdio: 'pipe', cwd: process.cwd(), env: { ...process.env, PKG_DIR: process.cwd() } })
}

async function waitForHeld(child: ReturnType<typeof spawn>): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const chunk = child.stdout?.read()?.toString() ?? ''
    if (chunk.includes('HELD') || chunk.includes('SECOND') || chunk.includes('REACQUIRED')) return chunk
    await new Promise(r => setTimeout(r, 500))
  }
  return ''
}

function secondResult(target: string, label: string): { out: string; err: string } {
  try {
    const out = execFileSync(process.execPath, [scriptPath('second.cjs'), target, label, '-'], { stdio: 'pipe', timeout: 15_000, cwd: process.cwd(), env: { ...process.env, PKG_DIR: process.cwd() } }).toString()
    return { out, err: '' }
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer; message: string }
    return { out: (err.stdout ?? Buffer.from('')).toString(), err: (err.stderr ?? Buffer.from('')).toString() + err.message }
  }
}

describe('跨进程 stateDir 锁语义（Codex 复测 #1）', () => {
  it('A 活持有者：第二实例（独立进程）acquire 必拒 ELOCKED', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sa-xproc-'))
    const target = join(dir, 'state')
    writeFileSync(target, 'x')
    const child = runHolder({ target, tag: 'holdA.cjs' })
    try {
      const held = await waitForHeld(child)
      expect(held).toContain('HELD')
      const { out, err } = secondResult(target, 'SECOND')
      expect(out).not.toContain('SECOND')
      expect(err).toContain('ELOCKED')
    } finally {
      child.kill('SIGKILL')
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('B SIGKILL 后立即重启：acquire 直接成功（owner 验尸=死）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sa-xproc2-'))
    const target = join(dir, 'state')
    writeFileSync(target, 'x')
    const child = runHolder({ target, tag: 'holdB.cjs' })
    const held = await waitForHeld(child)
    expect(held).toContain('HELD')
    child.kill('SIGKILL')
    await new Promise(r => setTimeout(r, 300))
    const out = execFileSync(process.execPath, [scriptPath('reacq.cjs'), target, 'REACQUIRED', 'exit'], { stdio: 'pipe', timeout: 15_000, cwd: process.cwd(), env: { ...process.env, PKG_DIR: process.cwd() } }).toString()
    expect(out).toContain('REACQUIRED')
    rmSync(dir, { recursive: true, force: true })
  }, 60_000)

  it('C owner 证据可读：持有中文件含 pid+starttime 且验活', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sa-owner-'))
    const target = join(dir, 'state')
    writeFileSync(target, 'x')
    const child = runHolder({ target, tag: 'holdC.cjs' })
    const held = await waitForHeld(child)
    expect(held).toContain('HELD')
    const raw = readFileSync(`${target}.lock.owner`, 'utf8')
    const owner = JSON.parse(raw)
    expect(owner.pid).toBe(child.pid)   // 纯 node 直跑：child 即真持有者
    expect(typeof owner.startedAt).toBe('string')
    expect(existsSync(`/proc/${owner.pid}`)).toBe(true)   // 持有中=活
    child.kill('SIGKILL')
    rmSync(dir, { recursive: true, force: true })
  }, 60_000)

  it('D 首实例「已持锁未写 owner」窗口：第二实例必拒，不得偷锁（复测 #1 的互斥破坏点）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sa-xproc3-'))
    const target = join(dir, 'state')
    writeFileSync(target, 'x')
    // skip-owner：持锁成功但故意不写 owner 证据，把窗口期拉长成常态
    const child = runHolder({ target, tag: 'holdD.cjs', mode: 'skip-owner' })
    try {
      const held = await waitForHeld(child)
      expect(held).toContain('HELD')
      expect(existsSync(`${target}.lock.owner`)).toBe(false)
      // 窗口期内第二实例必拒：无证据≠可偷（旧实现这里会立即偷，破坏互斥）
      const { out, err } = secondResult(target, 'SECOND')
      expect(out).not.toContain('SECOND')
      expect(err).toContain('ELOCKED')
    } finally {
      child.kill('SIGKILL')
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('E 双实例并发竞争死 owner 锁：恰好一个接管（tombstone 原子收敛，审查 F0）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sa-xproc4-'))
    const target = join(dir, 'state')
    writeFileSync(target, 'x')
    const child = runHolder({ target, tag: 'holdE.cjs' })
    const held = await waitForHeld(child)
    expect(held).toContain('HELD')
    child.kill('SIGKILL')          // owner 文件残留、pid 已死：两个竞争者都会走回收路径
    await new Promise(r => setTimeout(r, 300))
    const raceOutcome = (c: ReturnType<typeof spawn>): Promise<'won' | 'lost'> => new Promise(resolve => {
      let buf = ''
      let done = false
      const finish = (r: 'won' | 'lost') => { if (!done) { done = true; resolve(r) } }
      c.stdout!.on('data', d => { buf += d.toString(); if (buf.includes('SECOND')) finish('won') })
      c.on('close', code => finish(code === 0 && buf.includes('SECOND') ? 'won' : 'lost'))
      setTimeout(() => finish(buf.includes('SECOND') ? 'won' : 'lost'), 9000)
    })
    const racers = [runHolder({ target, tag: 'race1.cjs', label: 'SECOND' }), runHolder({ target, tag: 'race2.cjs', label: 'SECOND' })]
    try {
      const results = await Promise.all(racers.map(raceOutcome))
      const wins = results.filter(r => r === 'won').length
      // 旧 rmSync 实现：后删者可删掉先接管者的新锁 → 双持锁；tombstone 后必为 1
      expect(wins).toBe(1)
      // 接管者的 owner 证据落在锁上（pid = 赢家之一）
      const owner = JSON.parse(readFileSync(`${target}.lock.owner`, 'utf8'))
      expect(racers.some(c => c.pid === owner.pid)).toBe(true)
    } finally {
      racers.forEach(c => c.kill('SIGKILL'))
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
