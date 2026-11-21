export default {
  root: '/tmp/bot-wt/P5-28f1-verify/app/ui',
  cacheDir: '/tmp/bot-p528f1-vfy/probe-cache2',
  test: {
    include: ['/home/lingxufeng/bot/work/p5-parity/evidence/P5-28f1/probe-review-adapted.test.ts'],
    environment: 'node', maxWorkers: 1, fileParallelism: false,
  },
}
