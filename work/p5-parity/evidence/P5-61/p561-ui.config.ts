import { defineConfig } from '/home/lingxufeng/bot/app/ui/node_modules/playwright/test'
export default defineConfig({testDir:__dirname,testMatch:'p561-ui.spec.ts',workers:1,timeout:180000,outputDir:'/tmp/bot-p561-ui-results',reporter:[['line']],use:{trace:'off'}})
