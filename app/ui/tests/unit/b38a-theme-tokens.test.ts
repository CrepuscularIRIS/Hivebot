// B38 T-A：主题 token 收口守卫——组件层 CSS 不得引用未定义变量、不得依赖 OS 级媒体查询。
// 病根（HANDOFF 坑速查）：runtime-theme-token-installer 生成 :root 双态变量，但组件层
// ① 引用了 installer 从未定义的 --cursor-color-*（var() 静默空值）② prefers-color-scheme 跟 OS
// 而非应用设置（应用 Light+OS Dark 错乱）③ 硬编码暗色 hex 在亮色下渲染黑块。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

// vitest RUN 时 cwd=app/ui（见 vitest.config 的 root）；renderer-grok 是 app/ui 的子目录
const ROOT = resolve(process.cwd(), 'renderer-grok/frontend/src/recovered/')
const COMPONENT_CSS = [
  'features/conversation/workspace/view.css',
  'ui/sand-kit-primitives.css',
] as const

function installerDefinedVars(): Set<string> {
  const src = readFileSync(resolve(ROOT, 'features/runtime-theme-token-installer.ts'), 'utf8')
  const vars = new Set<string>()
  // 来源一：CORE_CSS/Ezn 的静态块（--x: value 字面量）
  for (const m of src.matchAll(/(--[\w-]+)\s*:/g)) vars.add(m[1])
  // 来源二：RUNTIME_PALETTE/SAND_DATA 的对象 key（"cssVar":"--x" / "--x":"#..."）
  for (const m of src.matchAll(/"(--[\w-]+)"/g)) vars.add(m[1])
  return vars
}

it('组件 CSS 引用的每个 var() 都在 token installer 里有定义（无静默空变量）', () => {
  const defined = installerDefinedVars()
  const builtin = new Set(['--fg']) // var(--fg, fallback) 形态：有 fallback 且属浏览器惯用名，放行
  // B43：shiki 双主题输出 --shiki-light/--shiki-dark 于代码块内联 style（运行时注入非全局 token）
  const runtime = new Set(['--shiki-light', '--shiki-dark', '--tasks-peek-island-width', '--tasks-peek-card-width']) // shiki=代码块内联注入；tasks-peek=G2 ResizeObserver 运行时写（inline style 非 token）
  const offenders: string[] = []
  for (const rel of COMPONENT_CSS) {
    const css = readFileSync(resolve(ROOT, rel), 'utf8')
    for (const m of css.matchAll(/var\((--[\w-]+)/g)) {
      if (!defined.has(m[1]) && !builtin.has(m[1]) && !runtime.has(m[1])) offenders.push(`${rel}: ${m[1]}`)
    }
  }
  expect(offenders, `未定义变量被引用：\n${offenders.join('\n')}`).toEqual([])
})

it('组件 CSS 不用 prefers-color-scheme（主题只认 html[data-theme]，不跟 OS）', () => {
  for (const rel of COMPONENT_CSS) {
    const css = readFileSync(resolve(ROOT, rel), 'utf8')
    expect(css.includes('prefers-color-scheme'), `${rel} 含 OS 级媒体查询`).toBe(false)
  }
})
