export default {
  root: '/home/lingxufeng/bot/work/p7-admin/evidence/P7-F3/f1-verify-source/app/sdk',
  cacheDir: '/home/lingxufeng/bot/work/p7-admin/evidence/P7-F3/f1-verify-cache-sdk',
  test: {
    cache: false,
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['/home/lingxufeng/bot/work/p7-admin/evidence/P7-F3/f1-verify-source/app/sdk/tests/support/tmp-sweep.setup.ts'],
    testTimeout: 120000, hookTimeout: 120000, maxWorkers: 1, fileParallelism: false,
    coverage: {
      enabled: true, provider: 'v8', autoAttachSubprocess: true,
      include: ['src/admin/host.mjs', 'src/orchestration/main-channel.mjs', 'src/orchestration/report.mjs', 'src/orchestration/delivery.mjs', 'src/start.ts'],
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: '/home/lingxufeng/bot/work/p7-admin/evidence/P7-F3/f1-verify-coverage-sdk',
      thresholds: { statements: 80, lines: 80, functions: 80, branches: 80 },
    },
  },
}
