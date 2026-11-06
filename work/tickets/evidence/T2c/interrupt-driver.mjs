// T2c 中断验收驱动：起夹具 → 把 {runner,dir,port,mark} 写进 $HOME/state.json 并打印
// READY 行 → 按模式动作：exit=直接 process.exit(17)；hang=挂起等信号。
// 用法：env HOME=<隔离> TMPDIR=<隔离> DBUS… node interrupt-driver.mjs <exit|hang>
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const mode = process.argv[2] ?? 'hang'
const { startSshHost } = await import('/dev/shm/bot-T2/app/sdk/tests/support/ssh-host.ts')
const host = await startSshHost()
const state = { runner: process.pid, dir: host.dir, port: host.port, mark: host.mark }
writeFileSync(join(process.env.HOME, 'state.json'), JSON.stringify(state))
console.log(`READY ${JSON.stringify(state)}`)
if (mode === 'exit') process.exit(17)
setInterval(() => {}, 1 << 30) // 挂起等信号；不做任何信号处理（验证 pdeathsig 内核兜底）
