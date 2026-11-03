// P5-54 · 对照台第三列的 Playwright 配置（跑真实 Electron，复用 app/ui 的 e2e 支撑）。
// pnpm -C app/ui test:compare-app → scripts/run-e2e.sh -c <本文件>（Xvfb）。
import { defineConfig } from 'playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'app-column.spec.ts',
  timeout: 300_000,
  workers: 1,
  use: { trace: 'off' },
})
