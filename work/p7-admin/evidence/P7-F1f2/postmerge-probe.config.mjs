// Reuse the original independent probes unchanged; redirect their exact source import to the merged tree.
export default {
  root: '/tmp/bot-wt/P7-F1f2-postmerge/app/ui',
  resolve: { alias: [{ find: '/tmp/bot-wt/P7-F1f2-verify/app/ui/main/admin/operations.ts', replacement: '/tmp/bot-wt/P7-F1f2-postmerge/app/ui/main/admin/operations.ts' }] },
  test: { globals: true, include: ['/home/lingxufeng/bot/work/p7-admin/evidence/P7-F1f2/verify-probe.test.ts', '/home/lingxufeng/bot/work/p7-admin/evidence/P7-F1f2/verify-extra.test.ts'], maxWorkers: 1, fileParallelism: false, testTimeout: 10000 }
}
