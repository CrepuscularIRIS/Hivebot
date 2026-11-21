import { defineConfig } from '/tmp/bot-wt/P5-61f1/app/ui/node_modules/playwright/test'
export default defineConfig({testDir:'.',testMatch:/(edge|initial17)\.probe\.ts$/,workers:1,timeout:240000,outputDir:'/home/lingxufeng/bot/work/p5-parity/evidence/P5-61f2/vfy/edge-results',reporter:'list',use:{trace:'off'}})
