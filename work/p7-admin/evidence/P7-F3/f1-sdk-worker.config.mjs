import config from './f1-sdk.config.mjs'
export default {
  ...config,
  test: { ...config.test, coverage: {
    ...config.test.coverage,
    autoAttachSubprocess: false,
    reportsDirectory: '/home/lingxufeng/bot/work/p7-admin/evidence/P7-F3/f1-coverage-sdk-worker',
  } },
}
