// P5-51 · 构建后插桩：把 shim.iife.js 以经典 <script> 注入 .build/frontend-shell/index.html
// （module script 天然 defer，经典 script 解析即执行 → shim 先于 bundle；CSP script-src 'self' 放行同源）。
// P5-52 · 同时把 overrides/*.css（我们的覆盖文件，不改上游）以 <link> 注入 </head> 前，排在 bundle 样式之后。
// 幂等：已注入则跳过。
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const shellDir = path.resolve(here, '../.build/frontend-shell')
const overridesDir = path.resolve(here, '../overrides')
const htmlPath = path.join(shellDir, 'index.html')
let html = readFileSync(htmlPath, 'utf8')
if (!html.includes('shim.iife.js')) {
  copyFileSync(path.resolve(here, '../.build/shim/shim.iife.js'), path.join(shellDir, 'shim.iife.js'))
  const injected = html.replace(/<script([^>]*)type="module"/, '<script defer src="./shim.iife.js"></script>\n    <script$1type="module"')
  if (injected === html) throw new Error('inject-shim: no module script found in built index.html')
  html = injected
}
for (const css of readdirSync(overridesDir).filter((f) => f.endsWith('.css')).sort()) {
  copyFileSync(path.join(overridesDir, css), path.join(shellDir, `override-${css}`))
  if (!html.includes(`override-${css}`)) html = html.replace('</head>', `  <link rel="stylesheet" href="./override-${css}">\n  </head>`)
}
writeFileSync(htmlPath, html)
