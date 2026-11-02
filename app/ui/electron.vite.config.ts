import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// 布局按 work/p4-ui/PLAN.md §2（main/preload/renderer 顶层目录，非脚手架的 src/ 布局）。
// sandbox preload 必须打成单文件 CJS（work/p4-ui/reuse/electron-shell.md:45）。
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
      lib: { entry: 'index.ts' },
      rollupOptions: { output: { entryFileNames: 'index.cjs', format: 'cjs' } },
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: 'renderer',
    build: {
      outDir: resolve('out/renderer'),
      rollupOptions: { input: resolve('renderer/index.html') },
    },
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom'] },
  },
})
