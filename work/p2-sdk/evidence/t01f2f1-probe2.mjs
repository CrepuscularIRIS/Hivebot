// T-01.f2.f1 探针第二轮：用真实「已退出的子进程持有者」验证间隙残留陈锁的自愈（⑤ 断言修正语义）。
import { spawn } from 'node:child_process'
import { mkdtempSync, renameSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const START = '/tmp/bot-wt/T-01.f2.f1/app/sdk/src/start.ts'
const { acquireHomeLock } = await import(START)

const h = mkdtempSync(join(tmpdir(), 'probe2-'))
const ctl = mkdtempSync(join(tmpdir(), 'probe2ctl-'))
const childScript = `
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
const { acquireHomeLock } = await import(${JSON.stringify(START)})
const { H, CTL } = process.env
const r = acquireHomeLock(H)
if (typeof r !== 'function') { console.log('CHILD_ACQUIRE_REFUSED'); process.exit(7) }
writeFileSync(join(CTL, 'held'), readFileSync(join(H, 'launcher.lock'), 'utf8'))
while (!existsSync(join(CTL, 'go'))) {}
r()          // 捕获间隙释放：lockPath 不存在 → 跳过 unlink
process.exit(0) // 持有者退出，pid 变死
`
const child = spawn(process.execPath, ['--input-type=module', '-e', childScript], { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, H: h, CTL: ctl } })
const closed = new Promise((res) => child.on('close', res))
while (!existsSync(join(ctl, 'held'))) {}
const aside = join(h, '.launcher-lock.captured.997.probe')
renameSync(join(h, 'launcher.lock'), aside)      // 模拟 robber 捕获
writeFileSync(join(ctl, 'go'), '')               // 让持有者在间隙释放并退出
await closed
renameSync(aside, join(h, 'launcher.lock'))      // robber 原样放回：留下「死 pid 陈锁」
const out = []
const ok = (n, c, d = '') => out.push(`${c ? 'PASS' : 'FAIL'} ${n}${d ? ' | ' + d : ''}`)

const pidInLock = Number(readFileSync(join(h, 'launcher.lock'), 'utf8').trim())
ok('1 间隙释放后残留锁 pid 已死（持有者子进程退出）', pidInLock === child.pid, `lockPid=${pidInLock} childPid=${child.pid}`)
const r = acquireHomeLock(h)
ok('2 死 pid 陈锁自愈：home 可重新获取', typeof r === 'function', typeof r === 'string' ? r : '')
if (typeof r === 'function') {
  ok('3 新持有者 pid 入锁', readFileSync(join(h, 'launcher.lock'), 'utf8').trim() === String(process.pid))
  r()
  ok('4 释放后锁文件不存在', !existsSync(join(h, 'launcher.lock')))
}
ok('5 无 leftover', readdirSync(h).filter((n) => n.startsWith('.launcher-lock.')).length === 0)
rmSync(h, { recursive: true, force: true }); rmSync(ctl, { recursive: true, force: true })
console.log(out.join('\n'))
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0)
