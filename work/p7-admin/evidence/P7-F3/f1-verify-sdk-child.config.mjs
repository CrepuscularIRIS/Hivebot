import config from './f1-verify-sdk.config.mjs'
export default {
  ...config,
  cacheDir: '/home/lingxufeng/bot/work/p7-admin/evidence/P7-F3/f1-verify-cache-sdk-child',
  test: { ...config.test, coverage: {
    ...config.test.coverage,
    // Separate raw Loader coordinates from worker-transformed main-channel imports.
    // Combined mapping retains all five changed SDK production files.
    reportsDirectory: '/home/lingxufeng/bot/work/p7-admin/evidence/P7-F3/f1-verify-coverage-sdk-child',
  } },
}
