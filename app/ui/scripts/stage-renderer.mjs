// P5-54：产品 renderer = renderer-grok 构建产物（.build/frontend-shell，shim 与覆盖样式已注入），
// 整目录拷到 out/renderer/——main 缺省 appRoot（out/main/../renderer）与打包目录都只认 out/。
import { cpSync, existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const from = resolve('renderer-grok/.build/frontend-shell')
const to = resolve('out/renderer')
if (!existsSync(resolve(from, 'shim.iife.js'))) throw new Error(`stage-renderer: ${from} has no shim.iife.js (run pnpm -C renderer-grok build)`)
rmSync(to, { recursive: true, force: true })
cpSync(from, to, { recursive: true })
