// T46a：Windows 包内容校验（工单验收 3）。
// 用法：node scripts/check-win-package.mjs
// 退出码 0=全过；1=任何一条不过（无产物也红——先红后绿的「红」）。
// ⓐ 必需文件在；ⓑ ws 可解析；ⓒ 白名单（只许 /out/** /package.json /node_modules/ws/**）；
// ⓓ resources/ 下除 app.asar（与 electron-builder 自带 app-update.yml）外无别的。
import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { listPackage } from '@electron/asar'

const dist = resolve('dist-app')
const asarPath = resolve(dist, 'win-unpacked/resources/app.asar')
if (!existsSync(asarPath)) {
  console.error(`FAIL 无产物：${asarPath} 不存在（先 pnpm build && pnpm dist:win）`)
  process.exit(1)
}
let entries
try {
  entries = listPackage(asarPath).map((p) => p.replace(/^\//, '')) // listPackage 带前导 /，剥掉
} catch (e) {
  console.error(`FAIL asar 读不了：${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
}
const set = new Set(entries)
const fail = (msg) => { console.error(`FAIL ${msg}`); process.exitCode = 1 }

// ⓐ 必需文件
for (const f of ['out/main/index.js', 'out/preload/index.cjs', 'out/renderer/index.html', 'out/renderer/shim.iife.js', 'package.json']) {
  if (!set.has(f)) fail(`ⓐ 缺 ${f}`)
}

// ⓑ ws 可解析：main 里有 require("ws") 就必须有 node_modules/ws/package.json
let mainJs = ''
try {
  // asar 读文件：listPackage 只给名；用 extractFile 拿内容
  const { extractFile } = await import('@electron/asar')
  mainJs = extractFile(asarPath, 'out/main/index.js').toString('utf8')
} catch { /* ⓐ 已红 */ }
const needsWs = mainJs.includes('require("ws")') || mainJs.includes("require('ws')")
if (needsWs && !set.has('node_modules/ws/package.json')) fail('ⓑ main require("ws") 但 asar 无 node_modules/ws')
if (!needsWs && mainJs.includes('ws')) {
  // main 提到 ws 却不是 require——人工看一眼，不算硬红
  console.error('WARN main 提到 ws 但未以 require("ws") 形式出现，请人工确认')
}

// ⓒ 白名单：每个条目都得落在三片之一
// 目录节点（out、node_modules、node_modules/ws）是白名单片的父目录，一并放行
const allowed = (p) => p === 'package.json' || p === 'out' || p === 'node_modules' || p === 'node_modules/ws' || p.startsWith('out/') || p.startsWith('node_modules/ws/')
// T46ab：白名单片内的禁令（工单 3ⓒ）——sourcemap 与 .env 在哪一层都不许（含 out/ 内）
const forbidden = (p) => p.endsWith('.map') || p.split('/').some((seg) => seg === '.env') || p.startsWith('.env')
const bad = entries.filter((p) => !allowed(p) || forbidden(p))
if (bad.length > 0) fail(`ⓒ 非白名单条目 ${bad.length} 个：${bad.slice(0, 10).join(', ')}${bad.length > 10 ? ' …' : ''}`)

// ⓓ resources/ 下只许 app.asar 与 electron-builder 自带文件（app-update.yml / elevate.exe 等 NSIS 侧不在这——win-unpacked/resources 检查）
const resDir = resolve(dist, 'win-unpacked/resources')
// elevate.exe = electron-builder NSIS 自带的卸载提升件（perMachine:false 也会带）
const extra = readdirSync(resDir).filter((f) => !['app.asar', 'app-update.yml', 'elevate.exe'].includes(f))
if (extra.length > 0) fail(`ⓓ resources/ 多了：${extra.join(', ')}`)

if (process.exitCode === 1) {
  console.error(`\n校验红（条目总数 ${entries.length}）`)
} else {
  console.log(`OK 白名单 ${entries.length} 条全过（ws 内含：${set.has('node_modules/ws/package.json') ? '是' : '否，main 也不 require'}）`)
}
