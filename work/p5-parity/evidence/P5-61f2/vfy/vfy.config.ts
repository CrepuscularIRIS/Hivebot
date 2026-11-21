import { defineConfig } from '/tmp/bot-wt/P5-61f1/app/ui/node_modules/playwright/test'
export default defineConfig({testDir:'cases',testMatch:/(initial|theme-flash|theme-dual)\.spec\.ts$/,workers:1,timeout:180000,outputDir:'/home/lingxufeng/bot/work/p5-parity/evidence/P5-61f2/vfy/results',reporter:'list',use:{trace:'off'}})
