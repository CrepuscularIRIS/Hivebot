// P5-H3 并行自证：两个并发进程（不同 TMPDIR）同时建 TEST_HOME。
//   修复后场景：node parallel-probe.mjs            → 两路径不同、互不踩（exit 0）
//   修复前对照：node parallel-probe.mjs --legacy   → 同一旧固定路径，run-b 抹掉
//               run-a 哨兵（run-a 退出码 3）——REPORT-P5-H1 发现 3 的双进程复现
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const worker = join(here, 'parallel-probe-worker.mjs')
const node = '/tmp/bot-wt/P5-H3/app/sdk/node_modules/node/bin/node'
const outB = '/tmp/bot-h3-tmp-b/worker-b.out'
const argv = ['--disable-warning=ExperimentalWarning', worker]
const legacy = process.argv.includes('--legacy') ? ['/home/lingxufeng/bot/.test-homes/p5-h3-legacy'] : []

function once(label) {
  for (const t of ['run-a', 'run-b']) rmSync(join(here, 'probe.' + t), { force: true })
  rmSync(outB, { force: true })
  const bgCmd = "TMPDIR=/tmp/bot-h3-tmp-b '" + node + "' " + argv.join(' ') + ' run-b ' + legacy.join(' ') + ' > ' + outB + ' 2>&1 &'
  spawnSync('sh', ['-c', bgCmd], { stdio: 'ignore' })
  const a = spawnSync(node, [...argv, 'run-a', ...legacy], { env: { ...process.env, TMPDIR: '/tmp/bot-h3-tmp' }, encoding: 'utf8' })
  // 等 run-b 出终态行（OK/COLLISION/TIMEOUT），不是等文件出现（> 会立刻建空文件）
  const deadline = Date.now() + 60_000
  let bOut = ''
  while (Date.now() < deadline) {
    try { bOut = readFileSync(outB, 'utf8').trim() } catch { bOut = '' }
    if (/^(OK|COLLISION|TIMEOUT)/m.test(bOut)) break
    spawnSync('sleep', ['0.2'])
  }
  console.log('[' + label + '] run-a exit=' + a.status + ' ' + a.stdout.trim() + a.stderr.trim())
  console.log('[' + label + '] run-b ' + bOut)
  for (const t of ['run-a', 'run-b']) rmSync(join(here, 'probe.' + t), { force: true })
  return a.status
}

if (legacy.length) {
  const code = once('legacy')
  console.log(code === 3 ? 'LEGACY: COLLISION reproduced（双进程同固定路径互踩，run-a 退出码 3）' : 'LEGACY: UNEXPECTED exit=' + code)
  process.exit(code === 3 ? 0 : 1)
}

const code = once('fixed')
console.log(code === 0 ? 'FIXED: DISTINCT ok（并行双进程互不踩）' : 'FIXED: UNEXPECTED exit=' + code)
process.exit(code === 0 ? 0 : 1)
