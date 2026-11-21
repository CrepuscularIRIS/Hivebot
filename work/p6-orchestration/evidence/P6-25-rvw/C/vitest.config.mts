import { defineConfig } from 'vitest/config'

// P6-25 review C 探针：根在 /tmp/vfy-r-p625-c，node_modules 软链到 app/sdk（只读复用）。
export default defineConfig({
  root: '/tmp/vfy-r-p625-c',
  server: { fs: { allow: ['/tmp/vfy-r-p625-c', '/home/lingxufeng/bot/app/sdk'] } },
  test: {
    include: ['*.test.ts'],
    setupFiles: ['/home/lingxufeng/bot/app/sdk/tests/support/tmp-sweep.setup.ts'],
    testTimeout: 300_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
})
