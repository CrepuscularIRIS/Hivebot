import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // P5-H1: 每个测试文件结束清扫其登记的 /tmp 目录（worker 不跑 exit 钩子，实测）
    setupFiles: ['tests/support/tmp-sweep.setup.ts'],
    testTimeout: 20_000,
  },
})
