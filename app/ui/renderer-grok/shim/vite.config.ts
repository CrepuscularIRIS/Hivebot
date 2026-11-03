// P5-51 · shim 独立 IIFE 构建（经典 script，先于 bundle 的 module script 执行，
// 保证 window.desktop / window.coordinatorPort 在 ProductionRenderer 引导前就位）。
// 上游 frontend/vite.config.ts 不动；注入见 scripts/inject-shim.mjs。
import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  build: {
    outDir: path.resolve(here, '../.build/shim'),
    emptyOutDir: true,
    lib: {
      entry: path.resolve(here, 'src/index.ts'),
      formats: ['iife'],
      name: 'PbotsShim',
      fileName: () => 'shim.iife.js',
    },
  },
})
