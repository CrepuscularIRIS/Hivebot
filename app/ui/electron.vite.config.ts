import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'node:path'

// 布局按 work/p4-ui/PLAN.md §2（main/preload 顶层目录，非脚手架的 src/ 布局）。
// sandbox preload 必须打成单文件 CJS（work/p4-ui/reuse/electron-shell.md:45）。
// P5-54：renderer 不再由 electron-vite 构建——产品 renderer = renderer-grok（0.18 移植树 + shim），
// 由 package.json build 的第二步 `pnpm -C renderer-grok build` 产出后整目录拷进 out/renderer/
// （main 的缺省 appRoot 不变：out/main/../renderer）。
export default defineConfig({
  main: {
    root: 'main',
    build: {
      outDir: resolve('out/main'),
      lib: { entry: 'index.ts' },
      rollupOptions: { output: { entryFileNames: 'index.js' } },
    },
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    root: 'preload',
    build: {
      outDir: resolve('out/preload'),
      lib: { entry: { index: 'index.ts', pet: 'pet.ts' } }, // T45a：宠物 preload 第二入口
      rollupOptions: { output: { entryFileNames: '[name].cjs', format: 'cjs' } },
    },
    plugins: [externalizeDepsPlugin()],
  },
})
