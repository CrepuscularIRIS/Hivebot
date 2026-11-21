// P5-51.f2 取证脚本：启动真实 SDK runtime（与 e2e launchSdkRuntime 同 env 形状），
// 读 home/runtime-patch.yml 里 sandbox 行的真实 runnerCommand argv，
// 再以 dry-run 跑 wrapper（拼上 dsh-sandbox-local bwrapProfileArgs 的真实形状），
// 打印最终 bwrap argv 顺序。
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SDK = '/tmp/bot-wt/P5-51f2/app/sdk'
const ws = mkdtempSync(join(tmpdir(), 'bot-p551-ws-'))
const home = mkdtempSync(join(tmpdir(), 'bot-p551f2-home-'))
const handoff = mkdtempSync(join(tmpdir(), 'p2sdk-handoff-'))
mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })

const child = spawn(process.execPath, [join(SDK, 'scripts', 'start.mjs')], {
  cwd: ws,
  env: { ...process.env, P2SDK_PROVIDER: 'mock', P2SDK_HOME: home, P2SDK_HANDOFF: handoff, P2SDK_PORT: '0', P2SDK_READY_TIMEOUT_MS: '60000' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let out = ''
child.stdout.on('data', (c) => { out += c })
child.stderr.on('data', (c) => { out += c })
let patchText = null
const deadline = Date.now() + 60000
while (!/\[p2sdk\] ready http/.test(out)) {
  if (child.exitCode !== null) throw new Error(`runtime exited: ${out}`)
  if (Date.now() > deadline) throw new Error(`timeout: ${out}`)
  // patch 在 ready 时会被删（T-01.f3 R1）：出现即读
  if (patchText === null) { try { patchText = readFileSync(join(home, 'runtime-patch.yml'), 'utf8') } catch { /* not yet */ } }
  await new Promise((r) => setTimeout(r, 100))
}
console.log('== runtime ready. ws(runtime cwd) =', ws)
console.log('== PBOTS_DATA_DIR: unset (与 grok-shim e2e 相同)')

const patch = patchText
const m = patch.match(/runnerCommand: \[(.+?)\]\n/s)
if (!m) throw new Error('no runnerCommand found:\n' + patch)
// yaml 单引号标量 → argv
const argv = m[1].split(', ').map((s) => s.slice(1, -1).replaceAll("''", "'"))
console.log('== sandboxRow runnerCommand argv (launcher 真实产物):')
console.log(argv.join('\n'))
writeFileSync('/tmp/bot-P5-51f2/runner-argv.json', JSON.stringify({ argv, ws, home, handoff }, null, 2))
child.kill('SIGTERM')
process.exit(0)
