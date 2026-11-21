export default {
  root: '/tmp/bot-wt/P7-F3/app/sdk',
  cacheDir: '/home/lingxufeng/bot/work/p7-admin/evidence/P7-F3/f1-cache-sdk',
  test: {
    cache: false,
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['/tmp/bot-wt/P7-F3/app/sdk/tests/support/tmp-sweep.setup.ts'],
    testTimeout: 120000, hookTimeout: 120000, maxWorkers: 1, fileParallelism: false,
    coverage: {
      enabled: true, provider: 'v8', autoAttachSubprocess: true,
      include: ['src/admin/host.mjs', 'src/orchestration/main-channel.mjs', 'src/orchestration/report.mjs', 'src/orchestration/delivery.mjs', 'src/start.ts'],
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: '/home/lingxufeng/bot/work/p7-admin/evidence/P7-F3/f1-coverage-sdk',
      thresholds: { statements: 80, lines: 80, functions: 80, branches: 80 },
    },
  },
}
