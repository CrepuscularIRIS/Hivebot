import { defineConfig } from 'playwright/test'
export default defineConfig({ testDir: __dirname, timeout: 180_000, workers: 1, reporter: [['list']] })
