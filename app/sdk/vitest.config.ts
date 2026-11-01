import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/e2e/**/*.test.ts', 'tests/market/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      // T-11① 子进程覆盖收集与合并机制（复现：`pnpm test:coverage`）：
      // vitest autoAttachSubprocess 在 worker 设 NODE_V8_COVERAGE=<临时目录>，
      // 测试树里的 node 子进程退出时把 V8 覆盖 JSON 写进该目录，vitest
      // takeCoverage 读取后与主进程报告合并（只统计 src/**）。约束：v8 会按
      // URL 合并同文件覆盖，同一文件不能同时以 vite 变换坐标（worker 内）和
      // 原始坐标（子进程）计入，否则丢区间——因此 src/start.ts 只留在 worker
      // 计量（tests/support/runtime.ts launcherSpawnEnv 用空串关掉 launcher 的
      // 下传；node 对 NODE_V8_COVERAGE 强制继承，显式 env 也拦不住，空串是唯一
      // 豁免），src/p2temp 全走子进程原始坐标（dsh 子进程经 start.ts childEnv 的
      // P2SDK_TEST_V8_COVERAGE 旁路拿到真目录；unit 断言在
      // tests/unit/p2temp.proc.mjs 的裸 node 子进程里跑）。生产 start 不设该
      // 变量，不注入任何额外 env。
      autoAttachSubprocess: true,
      include: ['src/**'],
      thresholds: {
        lines: 80, functions: 80, branches: 80, statements: 80,
        // T-11②: p2temp 单文件硬门槛（验收 ≥85%）
        'src/p2temp/**': { lines: 85, functions: 85, branches: 85, statements: 85 },
      },
    },
  },
})
