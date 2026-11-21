// P5-52 验收探针配置（verifier 自跑，不入仓）。NODE_PATH 指向 worktree 的 node_modules。
import { defineConfig } from 'playwright/test'

export default defineConfig({
  testDir: __dirname,
  timeout: 180_000,
  workers: 1,
  use: { trace: 'off' },
})
