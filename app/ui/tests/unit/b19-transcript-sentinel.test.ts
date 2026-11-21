// @vitest-environment happy-dom
// B19: transcript 头部 sentinel/状态行（work/b19-transcript-paging/BRIEF.md 规格锚）
// 0.78.1 规锚：sentinel div aria-hidden + IntersectionObserver；loading 行文案；failed 行带 Retry 按钮
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { describe, expect, it } from 'vitest'
import { createElement as h, act } from '../../renderer-grok/node_modules/react'
import { createRoot, type Root } from '../../renderer-grok/node_modules/react-dom/client'
import { ConversationTranscript } from '../../renderer-grok/frontend/src/recovered/features/conversation/workspace/transcript'

let root: Root | null = null
function renderTranscript(props: Record<string, unknown>): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root!.render(h(ConversationTranscript, { entries: [], ...props })) })
  return host
}
function cleanup() {
  if (root) act(() => root!.unmount())
  root = null
  document.body.innerHTML = ''
}

describe('B19 transcript 头部 older-history 区', () => {
  it('hasOlder=true → sentinel div 存在且 aria-hidden', () => {
    const host = renderTranscript({ hasOlder: true, loadOlder: () => undefined })
    const sentinel = host.querySelector('.sand-transcript-older-history__sentinel')
    cleanup()
    expect(sentinel).not.toBeNull()
    expect(sentinel!.getAttribute('aria-hidden')).toBe('true')
  })

  it('loading 态 → 状态行文案可见', () => {
    const host = renderTranscript({ hasOlder: true, isLoadingOlder: true })
    const status = host.querySelector('.sand-transcript-older-history__status')
    cleanup()
    expect(status?.textContent).toContain('Loading older messages')
  })

  it('failed 态 → Retry 按钮存在且可点', () => {
    let retried = 0
    const host = renderTranscript({ hasOlder: true, isOlderPageFailed: true, loadOlder: () => { retried += 1 } })
    const retry = host.querySelector<HTMLButtonElement>('.sand-transcript-older-history__retry')
    expect(retry).not.toBeNull()
    retry!.click()
    cleanup()
    expect(retried).toBe(1)
  })

  it('exhausted（无 hasOlder）→ 整区不渲染', () => {
    const host = renderTranscript({ hasOlder: false })
    const region = host.querySelector('.sand-transcript-older-history')
    cleanup()
    expect(region).toBeNull()
  })
})
