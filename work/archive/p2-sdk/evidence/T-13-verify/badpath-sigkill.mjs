// T-13 验收坏路径 harness：SIGKILL launcher（dsh 存活）→ 真实第二实例（scripts/start.mjs 全 main() 路径）必须拒绝。
// 自管子进程：只杀本脚本 spawn 返回的 PID，全部在 finally 里；不 pgrep/pkill，不碰任何外来进程。
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SDK = '/tmp/bot-wt/T-13/app/sdk'
const homes = []
const children = new Set()
const spawnLauncher = (home, handoff, extra = {}) => {
  const child = spawn(process.execPath, [join(SDK, 'scripts', 'start.mjs')], {
    env: {
      ...process.env,
      P2SDK_PROVIDER: 'mock',
      P2SDK_HOME: home,
      P2SDK_HANDOFF: handoff,
      P2SDK_PORT: '0',
      P2SDK_READY_TIMEOUT_MS: '120000',
      ...extra,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child.pid)
  return child
}
const waitGone = async (pid, ms = 15000) => {
  const end = Date.now() + ms
  for (;;) {
    try { process.kill(pid, 0); } catch { return true }
    if (Date.now() > end) throw new Error(`pid ${pid} still alive`)
    await new Promise((r) => setTimeout(r, 100))
  }
}
const waitFor = async (pred, ms, what) => {
  const end = Date.now() + ms
  for (;;) {
    const v = pred()
    if (v) return v
    if (Date.now() > end) throw new Error(`timeout: ${what}`)
    await new Promise((r) => setTimeout(r, 100))
  }
}
const collect = (child) => {
  let out = ''
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
  child.stdout.on('data', (c) => (out += c)); child.stderr.on('data', (c) => (out += c))
  return () => out
}
const home = mkdtempSync(join(tmpdir(), 'p2sdk-home-')); homes.push(home)
const handoffDir = mkdtempSync(join(tmpdir(), 'p2sdk-handoff-')); homes.push(handoffDir)
const exitP = (child) => new Promise((res) => child.on('exit', (c) => res(c)))

let failed = 0
try {
  // A：启动到 dsh pid 行
  const a = spawnLauncher(home, join(handoffDir, 'a'))
  const aOut = collect(a)
  const dshPid = await waitFor(() => /p2sdk: dsh pid (\d+)/.exec(aOut())?.[1], 30000, 'A dsh pid line')
    .then((m) => Number(m))
  children.add(dshPid)
  const lockA = readFileSync(join(home, 'launcher.lock'), 'utf8')
  console.log(`A: launcher=${a.pid} dsh=${dshPid} lock=${JSON.stringify(lockA)}`)
  if (lockA !== `${a.pid}\n${dshPid}\n`) { console.log('FAIL: lock content not dual-pid'); failed++ }

  // SIGKILL launcher A（不可捕获）；dsh detached 存活
  a.kill('SIGKILL')
  await waitGone(a.pid)
  try { process.kill(dshPid, 0); console.log('dsh alive after launcher SIGKILL: yes') }
  catch { console.log('FAIL: dsh died with launcher'); failed++ }

  // B：完整第二实例，走 main() 锁拒绝路径
  const b = spawnLauncher(home, join(handoffDir, 'b'))
  const bOut = collect(b)
  const bCode = await exitP(b)
  const bText = bOut()
  console.log(`B: exit=${bCode} out=${JSON.stringify(bText.trim())}`)
  if (bCode !== 1 || !bText.includes(`runtime pid ${dshPid}`)) { console.log('FAIL: second instance not refused'); failed++ }
  try { readFileSync(join(home, 'launcher.lock')); console.log('lock still present: yes') }
  catch { console.log('FAIL: lock vanished'); failed++ }

  // dsh 死后双 pid 皆死 → C 回收陈锁正常启动
  process.kill(dshPid, 'SIGKILL')
  await waitGone(dshPid)
  const c = spawnLauncher(home, join(handoffDir, 'c'))
  const cOut = collect(c)
  const cDsh = await waitFor(() => /p2sdk: dsh pid (\d+)/.exec(cOut())?.[1], 30000, 'C dsh pid line').then((m) => Number(m))
  children.add(cDsh)
  const lockC = readFileSync(join(home, 'launcher.lock'), 'utf8')
  console.log(`C: reclaimed stale lock, launcher=${c.pid} dsh=${cDsh} lock=${JSON.stringify(lockC)}`)
  if (lockC !== `${c.pid}\n${cDsh}\n`) { console.log('FAIL: reclaimed lock content wrong'); failed++ }
  c.kill('SIGINT')
  await waitFor(() => c.exitCode !== null, 20000, 'C exit')
  console.log(failed ? `FAIL (${failed})` : 'PASS: B refused naming runtime pid; stale lock reclaimable after both dead; C relocks')
} finally {
  for (const pid of children) { try { process.kill(pid, 'SIGKILL') } catch { /* gone */ } }
  for (const h of homes) rmSync(h, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
