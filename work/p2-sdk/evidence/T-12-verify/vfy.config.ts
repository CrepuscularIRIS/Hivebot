import { defineConfig } from 'vitest/config'

// T-12 验收专用 vitest config（evidence 目录，不进产品）。
// 单文件串行，forks pool，超时放宽到 e2e 量级。
export default defineConfig({
  test: {
    include: ['verify-default-ask.test.ts'],
    testTimeout: 240_000,
    hookTimeout: 120_000,
    pool: 'forks',
    fileParallelism: false,
    reporters: ['default'],
  },
})
