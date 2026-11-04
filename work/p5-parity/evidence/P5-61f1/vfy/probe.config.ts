import { defineConfig } from '/tmp/bot-wt/P5-61f1/app/ui/node_modules/playwright/test'
export default defineConfig({testDir: '.', testMatch: /(?:repeated|extra|initial)\.spec\.ts/, workers:1, timeout:180000, outputDir:'/tmp/bot-p561f1-vfy-results', reporter:'list', use:{trace:'off'}})
