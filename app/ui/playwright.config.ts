import { defineConfig } from 'playwright/test'

// E2E 一律跑生产 build（work/p4-ui/PLAN.md §2）。
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  use: { trace: 'off' },
})
