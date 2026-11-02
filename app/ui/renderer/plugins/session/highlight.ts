// 代码高亮（U-22 ⑤）：shiki@4.6.0 细粒度接入（createHighlighterCore + JavaScript 正则引擎 + 按需语言）。
// 选型依据 work/p4-ui/reuse/markdown-rendering.md（scout：shiki 4.6.0 在维护；rehype-highlight 超 6 月门槛不选；
// 「复用 dsh Shiki hook」的前提——ui-primitives link 依赖——已被 U-00.fN 撤销，故 npm 直装第 1 级）。
// 不用 Oniguruma WASM（bundle-web 会全量打包语言与主题并动态加载 wasm）；未知语言/引擎未就绪回退纯文本。
import { useEffect, useState } from 'react'
import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import langTs from 'shiki/langs/typescript.mjs'
import langShell from 'shiki/langs/shell.mjs'
import langJson from 'shiki/langs/json.mjs'
import langMd from 'shiki/langs/markdown.mjs'
import themeLight from 'shiki/themes/github-light.mjs'
import themeDark from 'shiki/themes/github-dark.mjs'

export interface Token { content: string; color?: string; darkColor?: string }

/** 初始语言集（对齐 dsh ui-primitives：TypeScript / Shell / JSON；markdown 供自身嵌套代码块）。 */
const LANG_ALIASES: Record<string, string> = {
  typescript: 'typescript', ts: 'typescript', tsx: 'typescript',
  shell: 'shell', sh: 'shell', bash: 'shell', zsh: 'shell', console: 'shell',
  json: 'json', jsonc: 'json',
  markdown: 'markdown', md: 'markdown',
}

let highlighter: Promise<HighlighterCore> | undefined

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    langs: [langTs, langShell, langJson, langMd],
    themes: [themeLight, themeDark],
  })
  return highlighter
}

/** 高亮成行 token（双主题：亮色进 color，暗色进 --shiki-dark 同款变量语义）。未知语言返回 null（纯文本回退）。 */
export async function highlightCode(lang: string | undefined, code: string): Promise<Token[][] | null> {
  const resolved = lang !== undefined ? LANG_ALIASES[lang.toLowerCase()] : undefined
  if (resolved === undefined) return null
  try {
    const hl = await getHighlighter()
    const { tokens } = hl.codeToTokens(code, { lang: resolved, themes: { light: 'github-light', dark: 'github-dark' } })
    return tokens.map((line) => line.map((tok) => ({
      content: tok.content,
      color: tok.htmlStyle?.color,
      darkColor: tok.htmlStyle?.['--shiki-dark'],
    })))
  } catch {
    return null // 引擎/语言加载失败：纯文本，不阻塞正文
  }
}

/** 高亮 hook：tokens 就绪前渲染纯文本（流式期间高亮异步追赶，不闪断）。 */
export function useHighlighted(lang: string | undefined, code: string): { lines: Token[][] | null; plain: string } {
  const [lines, setLines] = useState<Token[][] | null>(null)
  useEffect(() => {
    let alive = true
    void highlightCode(lang, code).then((out) => { if (alive) setLines(out) })
    return () => { alive = false }
  }, [lang, code])
  return { lines, plain: code }
}
