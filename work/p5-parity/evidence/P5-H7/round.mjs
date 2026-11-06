// P5-H7 双全量并行实证轮：同一 worktree 起两个 vitest run（不同 TMPDIR），
// 每 5s 采样：vitest 核心 pid、其直接子进程数（tinypool forks workers 上限观测）、系统负载。
// 用法: node round.mjs <label> <PBOTS_TEST_WORKERS|none>
import { spawn, execFileSync } from 'node:child_process'
import { openSync, readFileSync } from 'node:fs'

const label = process.argv[2] ?? 'round'
const cap = process.argv[3] ?? 'none'
const SDK = '/tmp/bot-wt/P5-H7/app/sdk'
const OUT = '/tmp/bot-h7'

const baseEnv = {
  ...process.env,
  HOME: `${OUT}/home`,
  DBUS_SESSION_BUS_ADDRESS: `unix:path=${OUT}/dead-dbus/socket`,
}
delete baseEnv.PBOTS_TEST_WORKERS
if (cap !== 'none') baseEnv.PBOTS_TEST_WORKERS = cap

function childrenOf(pid) {
  try {
    return execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean).map(Number)
  } catch { return [] } // pgrep exit 1 = 无子进程
}

// forks 池 worker（dist/workers/forks.js）是 vitest 进程的直接子进程（实测 2026-11-05）
function workerCount(pid) {
  return childrenOf(pid).filter((c) => {
    try { return readFileSync(`/proc/${c}/cmdline`, 'utf8').includes('workers/forks.js') }
    catch { return false }
  }).length
}

const procs = ['a', 'b'].map((k) => {
  const fd = openSync(`${OUT}/${label}-${k}.log`, 'w')
  const p = spawn(`${SDK}/node_modules/.bin/vitest`, ['run'], {
    cwd: SDK,
    env: { ...baseEnv, TMPDIR: `${OUT}/tmp-${k}` },
    stdio: ['ignore', fd, fd],
  })
  return { k, p, fd, maxWorkers: 0 }
})

const t0 = Date.now()
console.log(`[${new Date().toISOString()}] round=${label} cap=${cap} pids=${procs.map(x => `${x.k}:${x.p.pid}`).join(' ')}`)

function sample() {
  const line = []
  for (const x of procs) {
    if (x.p.exitCode !== null) { line.push(`${x.k}=done`); continue }
    const workers = workerCount(x.p.pid)
    x.maxWorkers = Math.max(x.maxWorkers, workers)
    line.push(`${x.k}:w=${workers}`)
  }
  const la = execFileSync('uptime', { encoding: 'utf8' }).match(/load average: ([\d.]+)/)[1]
  console.log(`+${Math.round((Date.now() - t0) / 1000)}s ${line.join(' ')} load=${la} max=${procs.map(x => `${x.k}:${x.maxWorkers}`).join('/')}`)
}

const timer = setInterval(sample, 5000)
await Promise.all(procs.map(x => new Promise(res => x.p.on('exit', res))))
clearInterval(timer)
console.log(`[${new Date().toISOString()}] round=${label} exits=${procs.map(x => `${x.k}:${x.p.exitCode}`).join(' ')} maxWorkers=${procs.map(x => `${x.k}:${x.maxWorkers}`).join(' ')}`)
