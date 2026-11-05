import { defineConfig } from 'vitest/config'
export default defineConfig({
  root: '/tmp/bot-p625f1-vfy/e2e',
  server: { fs: { allow: ['/tmp/bot-p625f1-vfy', '/tmp/bot-wt/P6-25f1/app/sdk'] } },
  test: {
    include: ['*.test.ts'],
    setupFiles: ['/tmp/bot-wt/P6-25f1/app/sdk/tests/support/tmp-sweep.setup.ts'],
    testTimeout: 300_000, hookTimeout: 120_000, fileParallelism: false,
  },
})
