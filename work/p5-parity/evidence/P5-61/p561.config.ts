import { defineConfig } from '/home/lingxufeng/bot/app/ui/node_modules/playwright/test'
export default defineConfig({ testDir: __dirname, testMatch: 'p561.spec.ts', workers: 1, timeout: 900000, outputDir: '/tmp/bot-p561-runner/results', reporter: [['line']], use: { trace: 'off' } })
