// T2c 验收 4 驱动：spawn interrupt-driver.mjs → 按模式中断（exit / SIGTERM / SIGKILL）
// → 死后 10s 内轮询：端口拒连、无 mark/dir 进程、无新增 /tmp/dsh-ssh-*、目录状态。
// 用法：node run-interrupt.mjs <exit|term|kill>  （驱动与环境目录都由本脚本自建自清）
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'

const mode = process.argv[2]
const driverPath = new URL('./interrupt-driver.mjs', import.meta.url).pathname
const T = mkdtempSync('/tmp/bot-T2c-')
for (const d of ['tmp', 'home']) mkdirSync(join(T, d), { recursive: true })

const before = readdirSync('/tmp').filter((n) => n.startsWith('dsh-ssh-')).sort()
const child = spawn('node', [driverPath, mode === 'exit' ? 'exit' : 'hang'], {
  env: { ...process.env, HOME: join(T, 'home'), TMPDIR: join(T, 'tmp'), DBUS_SESSION_BUS_ADDRESS: `unix:path=${T}/no-dbus` },
  stdio: ['ignore', 'pipe', 'inherit'],
})
let ready = ''
let buf = ''
child.stdout.setEncoding('utf8')
child.stdout.on('data', (c) => { buf += c })
for (let i = 0; i < 150 && ready === ''; i++) {
  await new Promise((r) => setTimeout(r, 100))
  const m = buf.match(/READY (.*)/)
  if (m) ready = m[1]
}
if (ready === '') { console.log('FAIL: driver never became READY'); process.exit(1) }
const { runner, dir, port, mark } = JSON.parse(ready)
console.log(`mode=${mode} runner=${runner} port=${port}`)

if (mode === 'term' || mode === 'kill') {
  process.kill(runner, mode === 'term' ? 'SIGTERM' : 'SIGKILL')
}
await new Promise((resolve) => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); setTimeout(resolve, 5000) })

const canConnect = (p) => new Promise((resolve) => {
  const sock = connect(p, '127.0.0.1')
  const done = (ok) => { sock.destroy(); resolve(ok) }
  sock.setTimeout(800, () => done(false))
  sock.on('connect', () => done(true))
  sock.on('error', () => done(false))
})
const procHits = () => {
  const hits = { mark: 0, dir: 0 }
  for (const pid of readdirSync('/proc')) {
    if (!/^\d+$/.test(pid)) continue
    try { if (readFileSync(`/proc/${pid}/environ`, 'utf8').includes(`PBOTS_SSH_MARK=${mark}`)) hits.mark++ } catch { /* 不可读 */ }
    try { if (readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(dir)) hits.dir++ } catch { /* 同上 */ }
  }
  return hits
}

let clean = false
for (let i = 0; i < 100 && !clean; i++) {
  const portOpen = await canConnect(port)
  const hits = procHits()
  if (!portOpen && hits.mark === 0 && hits.dir === 0) { clean = true; console.log(`clean=YES at ${(i + 1) * 0.1}s`); break }
  await new Promise((r) => setTimeout(r, 100))
}
const newSsh = readdirSync('/tmp').filter((n) => n.startsWith('dsh-ssh-')).sort().filter((n) => !before.includes(n))
console.log(`clean=${clean} dsh-ssh-new=${newSsh.length} dir=${existsSync(dir) ? 'present' : 'absent'}(mode=${mode === 'exit' ? '应absent' : '允许present'})`)
rmSync(T, { recursive: true, force: true })
process.exit(clean && newSsh.length === 0 && (mode === 'exit' ? !existsSync(dir) : true) ? 0 : 2)
