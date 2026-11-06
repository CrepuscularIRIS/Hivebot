// P5-H7 config 机制探针（不进仓，node 24 原生 TS type-stripping 直接 import config）：
// 验证 PBOTS_TEST_WORKERS 各取值下 test.maxWorkers 的解析结果。
// 用法: node config-probe.mjs   （在 app/sdk 外任意目录可跑）
import { pathToFileURL } from 'node:url'
import { availableParallelism } from 'node:os'

const CFG = '/tmp/bot-wt/P5-H7/app/sdk/vitest.config.ts'
const cases = [
  { name: 'unset', env: {} },
  { name: '8', env: { PBOTS_TEST_WORKERS: '8' } },
  { name: '50(>default)', env: { PBOTS_TEST_WORKERS: '50' } },
  { name: '1', env: { PBOTS_TEST_WORKERS: '1' } },
  { name: 'garbage', env: { PBOTS_TEST_WORKERS: 'abc' } },
  { name: '0', env: { PBOTS_TEST_WORKERS: '0' } },
]

console.log(`availableParallelism=${availableParallelism()} → vitest 5 run 模式默认 maxWorkers=${Math.max(availableParallelism() - 1, 1)}`)
for (const c of cases) {
  process.env.PBOTS_TEST_WORKERS = c.env.PBOTS_TEST_WORKERS ?? ''
  if (c.env.PBOTS_TEST_WORKERS === undefined) delete process.env.PBOTS_TEST_WORKERS
  const mod = await import(pathToFileURL(CFG).href + `?case=${c.name}`)
  console.log(`PBOTS_TEST_WORKERS=${c.name.padEnd(12)} → test.maxWorkers=${mod.default.test.maxWorkers}`)
}
