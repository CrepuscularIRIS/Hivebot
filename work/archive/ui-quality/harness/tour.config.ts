// 经理取证巡检（T74 立项）：跑真实 Electron（Xvfb，DPR2），逐面截图 + 字阶/居中/交互态探针。
// 跑法：cd app/ui && NODE_PATH=$PWD/node_modules sh scripts/run-e2e.sh -c ../../work/ui-quality/harness/tour.config.ts
import { defineConfig } from 'playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: process.env.TOUR_SPEC ?? 'tour.spec.ts',
  timeout: 600_000,
  workers: 1,
  use: { trace: 'off' },
})
