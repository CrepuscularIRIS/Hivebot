// P5-54：产品 renderer = renderer-grok 构建产物（.build/frontend-shell，shim 与覆盖样式已注入），
// 整目录拷到 out/renderer/——main 缺省 appRoot（out/main/../renderer）与打包目录都只认 out/。
import { cpSync, existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const from = resolve('renderer-grok/.build/frontend-shell')
const to = resolve('out/renderer')
if (!existsSync(resolve(from, 'shim.iife.js'))) throw new Error(`stage-renderer: ${from} has no shim.iife.js (run pnpm -C renderer-grok build)`)
rmSync(to, { recursive: true, force: true })
cpSync(from, to, { recursive: true })
// T45a：宠物页（index.html + pet.js + assets/fish）拷到 out/renderer/pet/
cpSync(resolve('pet'), resolve(to, 'pet'), { recursive: true })
// T88：0.78.1 吉祥物引擎原件（vendor-078，字节不改）拷进产物——页面内动态 import 用
// （vite 静态打包会经 rolldown 转换；原件直载保真且可独立闸门验证）
cpSync(resolve('renderer-grok/assets/vendor-078'), resolve(to, 'vendor-078'), { recursive: true })
