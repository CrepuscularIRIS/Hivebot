export default {
  root: '/home/lingxufeng/bot/app/ui',
  cacheDir: '/tmp/bot-rev-p528c/cache',
  resolve: { alias: { vitest: '/home/lingxufeng/bot/app/ui/node_modules/vitest/dist/index.js', electron: '/home/lingxufeng/bot/app/ui/node_modules/electron/index.js' } },
  test: {
    include: ['/tmp/bot-rev-p528c/probe.test.ts', 'tests/unit/m1/api.test.ts', 'tests/unit/shell/ledger.test.ts'],
    environment: 'node', maxWorkers: 1, fileParallelism: false,
  },
}
