// T51 探针配置（worktree 内自跑）
import { defineConfig } from 'playwright/test'

export default defineConfig({
  testDir: __dirname,
  timeout: 180_000,
  workers: 1,
  use: { trace: 'off' },
})
