// Markdown 正文（U-22 ⑤，选型 work/p4-ui/reuse/markdown-rendering.md：react-markdown@10.1.0 + shiki）。
// 安全口径（scout 安全面 1/2）：skipHtml 删除 raw HTML 节点（非「转文本显示」——DOM 中不得出现原始标签串）、
// 不挂 rehype-raw、不用 dangerouslySetInnerHTML（shiki 只输出 token，见 highlight.ts）；
// 链接：a 覆写 target=_blank —— 点击走 U-00 setWindowOpenHandler 门控 openExternal（main/window.ts:37，
// 不在本层另写拦截）；图片：不挂载 <img>（远程图片零请求，D12① 先导），只输出 alt 文本。
// 适用面：assistant 定稿与流式气泡（Conversation.tsx）；user 气泡保持纯文本。
import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import { useHighlighted } from './highlight'

function CodeBlock({ lang, code }: { lang: string | undefined; code: string }): JSX.Element {
  const { lines } = useHighlighted(lang, code)
  if (lines === null) return <code className="plain">{code}</code>
  return (
    <code className="shiki">
      {lines.map((line, i) => (
        <span className="hl-line" key={i}>{line.map((tok, j) => (
          <span className="hl-tok" key={j} style={{ color: tok.color, ...(tok.darkColor !== undefined ? { ['--shiki-dark' as string]: tok.darkColor } : {}) }}>{tok.content}</span>
        ))}{i < lines.length - 1 ? '\n' : ''}</span>
      ))}
    </code>
  )
}

/** 正文渲染：语言别名将常见写法归一（C/js→typescript 系见 highlight.ts 的别名表）。 */
export const Markdown = memo(function Markdown({ text }: { text: string }): JSX.Element {
  return (
    <div className="md">
      <ReactMarkdown
        skipHtml
        components={{
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>,
          img: ({ alt }) => <span className="img-alt">{alt}</span>,
          pre: ({ children }) => <pre>{children}</pre>,
          code: ({ className, children }) => {
            const raw = Array.isArray(children) ? children.join('') : String(children ?? '')
            if (!/^language-/.test(className ?? '')) return <code>{raw}</code> // 行内代码不高亮
            const lang = /language-(\S+)/.exec(className ?? '')?.[1]
            return <CodeBlock lang={lang} code={raw.replace(/\n$/, '')} />
          },
        }}
      >{text}</ReactMarkdown>
    </div>
  )
})
