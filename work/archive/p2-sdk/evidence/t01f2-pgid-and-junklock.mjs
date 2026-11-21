// T-01.f2 verifier: two direct checks on the REAL chain (scripts/start.mjs).
// 1) PGID separation: while ready, dsh's pgid != launcher's pgid (R5 premise).
// 2) Junk lock content (not a pid): treated as stale, instance takes over.
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const SDK = '/tmp/bot-wt/T-01.f2/app/sdk'
const home = mkdtempSync(join(tmpdir(), 'p2sdk-f2-'))
const child = spawn(process.execPath, [join(SDK, 'scripts', 'start.mjs')], {
  env: { ...process.env, P2SDK_PROVIDER: 'mock', P2SDK_HOME: home, P2SDK_PORT: '0', P2SDK_READY_TIMEOUT_MS: '60000' },
  stdio: ["ignore", "pipe", "pipe"],
})
let out = ''
child.stdout.setEncoding('utf8')
child.stdout.on("data", c => { out += c }); child.stderr.setEncoding("utf8"); child.stderr.on("data", c => { out += c; process.stderr.write(c) })

const fails = []
const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails.push(m) }

try {
  const dshPid = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('no ready')), 90000)
    const iv = setInterval(() => {
      const m = out.match(/p2sdk: dsh pid (\d+)/)
      if (m && /\[p2sdk\] ready http/.test(out)) { clearTimeout(t); clearInterval(iv); res(Number(m[1])) }
      if (child.exitCode !== null) { clearTimeout(t); clearInterval(iv); rej(new Error('early exit ' + child.exitCode)) }
    }, 100)
  })
  const pg = (p) => execFileSync('ps', ['-o', 'pgid=', '-p', String(p)], { encoding: 'utf8' }).trim()
  const dshPgid = pg(dshPid), myPgid = pg(process.pid)
  check(dshPgid !== myPgid, `dsh pgid ${dshPgid} != launcher pgid ${myPgid} (detached real-chain)`)
} catch (e) {
  check(false, `pgid check setup: ${e.message}`)
} finally {
  if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise(r => child.on('exit', r)) }
}

// junk lock content -> stale -> takeover succeeds
writeFileSync(join(home, 'launcher.lock'), 'not-a-pid\n')
const second = spawn(process.execPath, [join(SDK, 'scripts', 'start.mjs')], {
  env: { ...process.env, P2SDK_PROVIDER: 'mock', P2SDK_HOME: home, P2SDK_PORT: '0', P2SDK_READY_TIMEOUT_MS: '60000' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let sOut = '', sErr = ''
second.stdout.setEncoding('utf8'); second.stderr.setEncoding('utf8')
second.stdout.on('data', c => { sOut += c }); second.stderr.on('data', c => { sErr += c })
try {
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('no ready after junk lock')), 90000)
    const iv = setInterval(() => {
      if (/\[p2sdk\] ready http/.test(sOut)) { clearTimeout(t); clearInterval(iv); res() }
      if (second.exitCode !== null) { clearTimeout(t); clearInterval(iv); rej(new Error('exit ' + second.exitCode + ' err=' + sErr.slice(0, 200))) }
    }, 100)
  })
  check(true, 'junk lock content treated as stale, instance boots')
} catch (e) {
  check(false, `junk lock takeover: ${e.message}`)
} finally {
  if (second.exitCode === null) { second.kill('SIGTERM'); await new Promise(r => second.on('exit', r)) }
}
console.log(fails.length ? `RESULT: ${fails.length} FAIL` : 'RESULT: ALL GREEN')
process.exit(fails.length ? 1 : 0)
