// T-01.f2 acceptance ② NEGATIVE CONTROL (verifier): same harness as
// /tmp/T-01.f2-tests/exp-r5.mjs but spawn options forced detached:false —
// the shipped pre-fix behavior. Under a PTY one Ctrl-C must reach the child
// twice (TTY foreground group + launcher forward), so dispose-done must be
// MISSING. If dispose-done still appears here, the green-path harness is
// insensitive and proves nothing.
import { spawn } from 'node:child_process'

const child = spawn(process.execPath, ['/tmp/T-01.f2-tests/fake-dsh.mjs'], {
  env: process.env,
  stdio: ['ignore', 'pipe', 'inherit'],
  detached: false, // pre-fix: same process group as the launcher
})
console.log('spawnOptions={"detached":false}')
let out = ''
child.stdout.setEncoding('utf8')
child.stdout.on('data', c => { out += c; process.stdout.write(c) })

const forward = (signal) => {
  if (child.exitCode !== null) return
  process.stderr.write(`p2sdk: forwarding ${signal} to dsh\n`)
  child.kill(signal)
}
process.on('SIGINT', () => forward('SIGINT'))
process.on('SIGTERM', () => forward('SIGTERM'))

const code = await new Promise((r) => child.on('exit', (c) => r(c ?? 1)))
console.log(`fake-dsh exited ${code}`)
const sigints = (out.match(/sigint=\d/g) || []).length
const disposed = out.includes('dispose-done')
console.log(`sigint-count=${sigints} dispose-done=${disposed}`)
// Expected RED: two deliveries, dispose truncated.
process.exit(sigints >= 2 && !disposed ? 0 : 99)
