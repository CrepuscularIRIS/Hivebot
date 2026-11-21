// P5-H2 复现脚本：证明 handoffSiblings() 的 statSync TOCTOU。
// 场景模拟全量并发：e2e fork 的 afterAll 在 /tmp 删 p2sdk-handoff-*（rmSync），
// 同时本进程（unit worker）反复调 computeRoots——它 readdir /tmp 后对每个
// p2sdk-handoff-* 做无守卫 statSync(p).mtimeMs。目录在 isDir 与 statSync 之间
// 被删 → ENOENT 抛出 → computeRoots 整个失败 → 调用它的测试红。
// 用法：node stress-race.mjs [seconds]；退出码 0=未复现，1=复现（打印首个错误）
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'

const root = process.argv[2] ? parseInt(process.argv[2], 10) : 20
const sdkSrc = process.argv[3] ?? '/tmp/bot-wt/P5-H2/app/sdk'
const { computeRoots } = await import(join(sdkSrc, 'src/policy/never-roots.mjs'))

const home = mkdtempSync(join(tmpdir(), 'p5-h2-stress-home-'))
for (const d of ['.ssh', '.config/gh', '.claude', '.dsh-x', 'pkg', 'd', 'repo/.claude', 'repo/gitdir-real']) {
  mkdirSync(join(home, d), { recursive: true })
}
const { writeFileSync } = await import('node:fs')
writeFileSync(join(home, 'repo/.git'), `gitdir: ${join(home, 'repo/gitdir-real')}\n`)
const cfg = {
  envHome: home, passwdHome: home, home: join(home, '.dsh-x'), handoff: join(home, 'ho'),
  dataDirs: [join(home, 'd')], pkgRoot: join(home, 'pkg'), repoRoot: join(home, 'repo'),
}

// 竞争者：独立子进程（真实场景 = 另一个 vitest fork 的 e2e teardown），
// 不断创建并删除 /tmp/p2sdk-handoff-*（runtime.ts:64 创建 +
// guard-fs/sandbox-hardened afterAll rmSync 删除）。同线程的 rmSync 无法
// 打断本线程的同步 statSync 循环，必须跨进程才有 TOCTOU 窗口。
const stopAt = Date.now() + root * 1000
const { spawn } = await import('node:child_process')
const racerSrc = `
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const stopAt = Date.now() + ${root * 1000}
// 长寿命目录 + 零散死亡：模拟真实 e2e——launch 时 mkdtemp、整个用例期间存活、
// afterAll teardown 时才 rmSync。瞬时生死的目录进不了对方的 readdir 快照。
const live = []
for (let i = 0; i < 24; i++) live.push(mkdtempSync(join(tmpdir(), 'p2sdk-handoff-')))
while (Date.now() < stopAt) {
  const d = live.shift()
  try { rmSync(d, { recursive: true, force: true }) } catch {}
  live.push(mkdtempSync(join(tmpdir(), 'p2sdk-handoff-')))
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.floor(Math.random() * 3))
}
`
const racer = spawn(process.execPath, ['-e', racerSrc], { stdio: 'ignore' })

// 主循环：模拟 unit worker 反复调 computeRoots（policyRoots 等用例）
let calls = 0
let firstError = null
while (Date.now() < stopAt) {
  try {
    computeRoots(cfg)
    calls++
  } catch (e) {
    firstError = e
    break
  }
}

racer.kill('SIGKILL')
await new Promise((r) => racer.on('exit', r))
rmSync(home, { recursive: true, force: true })
console.log(`computeRoots calls survived: ${calls}`)
if (firstError) {
  console.error('REPRODUCED:', firstError.code ?? '', firstError.message.split('\n')[0])
  process.exit(1)
}
console.log('not reproduced')
process.exit(0)
