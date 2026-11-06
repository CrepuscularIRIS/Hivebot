// P5-H7 外部 worker 采样器（基线轮 harness 采样器首发版有 bug，旁路补测）：
// 每 10s 统计给定 vitest 进程的 forks.js worker 直接子进程数，直至进程退出。
// 用法: node wsamp.mjs <label> <pidA> <pidB>
import { readFileSync, appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const [label, ...pids] = process.argv.slice(2)
const OUT = '/tmp/bot-h7'
const alive = (p) => { try { process.kill(p, 0); return true } catch { return false } }
const children = (p) => {
  try {
    return execFileSync('pgrep', ['-P', String(p)], { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean).map(Number)
  } catch { return [] }
}
const wc = (p) => children(p).filter((c) => {
  try { return readFileSync(`/proc/${c}/cmdline`, 'utf8').includes('workers/forks.js') }
  catch { return false }
}).length

const t0 = Date.now()
appendFileSync(`${OUT}/wsamp-${label}.log`, `# start ${new Date().toISOString()} pids=${pids.join(',')}\n`)
while (pids.some(alive)) {
  const la = execFileSync('uptime', { encoding: 'utf8' }).match(/load average: ([\d.]+)/)[1]
  const line = `+${Math.round((Date.now() - t0) / 1000)}s ${pids.map((p, i) => `${i}:${alive(p) ? wc(p) : 'x'}`).join(' ')} load=${la}`
  appendFileSync(`${OUT}/wsamp-${label}.log`, line + '\n')
  await new Promise(r => setTimeout(r, 10000))
}
appendFileSync(`${OUT}/wsamp-${label}.log`, `# end ${new Date().toISOString()}\n`)
