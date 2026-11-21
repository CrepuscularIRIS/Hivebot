// P5-H3 并行自证 worker：建 TEST_HOME、写哨兵、验证自己哨兵未被并行进程抹掉。
// 用法：node parallel-probe-worker.mjs <run-a|run-b> [legacy-path]
//   不带 legacy-path → uniqueTestHome（修复后场景，应互不踩）
//   带 legacy-path   → 旧固定路径（修复前场景：run-a 先就位，run-b 见就位后
//                      rmSync 重建 → run-a 哨兵必变 run-b → 退出码 3）
// 顺序协调：run-b 等 probe.run-a 出现后才 occupy（固定 run-a 先），保证
// 「run-b 的 rmSync 一定发生在 run-a 哨兵落盘之后」——这正是两个并行全量
// 的真实交错（各文件 beforeAll 在对方哨兵就绪后仍会 rmSync 重建）。
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { uniqueTestHome } from '/tmp/bot-wt/P5-H3/app/sdk/tests/support/sandbox-home.ts'

const tag = process.argv[2]
const here = dirname(fileURLToPath(import.meta.url))
const mine = join(here, 'probe.' + tag)
const other = join(here, `probe.${tag === 'run-a' ? 'run-b' : 'run-a'}`)

if (tag === 'run-b') {
  const deadline = Date.now() + 30_000
  while (!existsSync(join(here, 'probe.run-a')) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50))
  }
  if (!existsSync(join(here, 'probe.run-a'))) { console.error('TIMEOUT waiting for run-a'); process.exit(4) }
}

const home = process.argv[3] ?? uniqueTestHome('p5-h3-par')
rmSync(home, { recursive: true, force: true })
mkdirSync(join(home, '.ssh'), { recursive: true })
writeFileSync(join(home, '.ssh', 'sentinel-key'), tag)
writeFileSync(mine, home)

// 等 run-b 也就位（run-a 视角）再验证
if (tag === 'run-a') {
  const deadline = Date.now() + 30_000
  while (!existsSync(join(here, 'probe.run-b')) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50))
  }
  if (!existsSync(join(here, 'probe.run-b'))) { console.error('TIMEOUT waiting for run-b'); process.exit(4) }
  await new Promise((r) => setTimeout(r, 200)) // 稳定期
}

let seen
try { seen = readFileSync(join(home, '.ssh', 'sentinel-key'), 'utf8') } catch { seen = '<erased-by-peer>' }
if (seen !== tag) {
  console.error(`COLLISION home=${home} wrote=${tag} saw=${seen}`) // 修复前场景的预期结局
  process.exit(3)
}
rmSync(home, { recursive: true, force: true })
console.log(`OK home=${home} tag=${tag}`) // 就位文件留给主脚本清（对方可能还在轮询）
process.exitCode = 0
