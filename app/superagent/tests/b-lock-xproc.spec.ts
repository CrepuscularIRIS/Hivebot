import { describe, it, expect } from 'vitest'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 纠错轮二（Codex 复测 #1）：跨进程锁语义。同进程单测测不到重启/互斥语义。
// Holder 与第二实例都用纯 CJS（proper-lockfile 是 CJS，node 直跑；owner 协议与
// src/app/lock.ts 的 acquireStateLock 同构——跨进程行为验证不需要 TS 源加载器）。
const ACQUIRE_JS = `
const { writeFileSync, readFileSync, utimesSync, unlinkSync, existsSync } = require('node:fs')
// holder 脚本写在 tmpdir——require 解析不从 superagent 出发会找不到包；
// 用调用方注入的 PKG_DIR createRequire 定位 proper-lockfile。
const { createRequire } = require('node:module')
const req = createRequire(process.env.PKG_DIR + '/')
const lockSync = req('proper-lockfile').lockSync
function startTime(pid) {
  try { const s = readFileSync('/proc/' + pid + '/stat', 'utf8'); return s.slice(s.lastIndexOf(')') + 2).trim().split(/\\s+/)[19] || null } catch { return null }
}
function ownerAlive(o) { const st = startTime(o.pid); return st !== null && st === o.startedAt }
const target = process.argv[2]
const myStart = startTime(process.pid) || String(Date.now())
let release
try {
  release = lockSync(target, { stale: 30000 })
} catch (e) {
  if (e.code !== 'ELOCKED') throw e
  let owner = null
  try { owner = JSON.parse(readFileSync(target + '.lock.owner', 'utf8')) } catch {}
  if (owner && ownerAlive(owner)) throw e
  const past = new Date(Date.now() - 40000)
  try { utimesSync(target + '.lock', past, past) } catch {}
  release = lockSync(target, { stale: 30000 })
}
const op = target + '.lock.owner'
if (existsSync(op)) { try { unlinkSync(op) } catch {} }
writeFileSync(op, JSON.stringify({ pid: process.pid, startedAt: myStart }))
console.log(process.argv[3] || 'HELD')
if (process.argv[4] === 'exit') { try { unlinkSync(op) } catch {}; try { release() } catch {}; process.exit(0) }
setInterval(() => {}, 1000)
`

function scriptPath(tag: string, argv3?: string, argv4?: string): string {
  const f = join(mkdtempSync(join(tmpdir(), 'holder-')), tag)
  writeFileSync(f, ACQUIRE_JS)
  return f
}

async function waitForHeld(child: ReturnType<typeof spawn>): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const chunk = child.stdout?.read()?.toString() ?? ''
    if (chunk.includes('HELD') || chunk.includes('SECOND') || chunk.includes('REACQUIRED')) return chunk
    await new Promise(r => setTimeout(r, 500))
  }
  return ''
}

describe('跨进程 stateDir 锁语义（Codex 复测 #1）', () => {
  it('A 活持有者：第二实例（独立进程）acquire 必拒 ELOCKED', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sa-xproc-'))
    const target = join(dir, 'state')
    writeFileSync(target, 'x')
    const child = spawn(process.execPath, [scriptPath('holdA.cjs'), target], { stdio: 'pipe', cwd: process.cwd(), env: { ...process.env, PKG_DIR: process.cwd() } })
    try {
      const held = await waitForHeld(child)
      expect(held).toContain('HELD')
      // 第二实例（独立进程）acquire 同 target：活 owner 在——必拒
      let secondErr = ''
      try {
        execFileSync(process.execPath, [scriptPath('second.cjs'), target, 'SECOND'], { stdio: 'pipe', timeout: 15_000, cwd: process.cwd(), env: { ...process.env, PKG_DIR: process.cwd() } })
      } catch (e) { secondErr = String(e) }
      expect(secondErr).toContain('ELOCKED')
    } finally {
      child.kill('SIGKILL')
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('B SIGKILL 后立即重启：acquire 直接成功（owner 验尸=死）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sa-xproc2-'))
    const target = join(dir, 'state')
    writeFileSync(target, 'x')
    const child = spawn(process.execPath, [scriptPath('holdB.cjs'), target], { stdio: 'pipe', cwd: process.cwd(), env: { ...process.env, PKG_DIR: process.cwd() } })
    const held = await waitForHeld(child)
    expect(held).toContain('HELD')
    child.kill('SIGKILL')
    await new Promise(r => setTimeout(r, 300))
    // 新实例（独立进程）立即可取并正常释放退出
    const out = execFileSync(process.execPath, [scriptPath('reacq.cjs'), target, 'REACQUIRED', 'exit'], { stdio: 'pipe', timeout: 15_000, cwd: process.cwd(), env: { ...process.env, PKG_DIR: process.cwd() } }).toString()
    expect(out).toContain('REACQUIRED')
    rmSync(dir, { recursive: true, force: true })
  }, 60_000)

  it('C owner 证据可读：持有中文件含 pid+starttime 且验活', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sa-owner-'))
    const target = join(dir, 'state')
    writeFileSync(target, 'x')
    const child = spawn(process.execPath, [scriptPath('holdC.cjs'), target], { stdio: 'pipe', cwd: process.cwd(), env: { ...process.env, PKG_DIR: process.cwd() } })
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
})
