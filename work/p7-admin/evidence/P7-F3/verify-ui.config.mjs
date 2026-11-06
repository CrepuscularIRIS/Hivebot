export default {
  root: '/home/lingxufeng/bot/work/p7-admin/evidence/P7-F3/verify-source/app/ui',
  test: {
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['/home/lingxufeng/bot/work/p7-admin/evidence/P7-F3/verify-source/app/ui/tests/support/tmp-sweep.setup.ts'],
    testTimeout: 120000, maxWorkers: 1,
    coverage: {
      enabled: true, provider: 'custom', customProviderModule: '/home/lingxufeng/bot/work/p7-admin/evidence/P7-F3/verify-source/app/sdk/node_modules/@vitest/coverage-v8/dist/index.js',
      include: ['main/admin/recovery.ts', 'main/admin/restart.ts', 'main/index.ts', 'main/dsh/connect.ts', 'main/ready.ts'],
      reporter: ['text', 'json-summary', 'json'], reportsDirectory: '/home/lingxufeng/bot/work/p7-admin/evidence/P7-F3/verify-coverage-ui',
      thresholds: { statements: 80, lines: 80, functions: 80, branches: 80 },
    },
  },
}
