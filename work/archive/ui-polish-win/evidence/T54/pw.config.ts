// T54 取证配置（work/ 下自带）
import { defineConfig } from 'playwright/test'

export default defineConfig({
  testDir: __dirname,
  timeout: 300_000,
  workers: 1,
  use: { trace: 'off' },
})
