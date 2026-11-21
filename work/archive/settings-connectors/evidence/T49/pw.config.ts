// T48 现状探针配置（work/ 下自带 config，不入仓产品代码；NODE_PATH 指向主仓 node_modules）
import { defineConfig } from 'playwright/test'

export default defineConfig({
  testDir: __dirname,
  timeout: 180_000,
  workers: 1,
  use: { trace: 'off' },
})
