// B6.2 SpotlightApp：spotlight 窗的 quick-chat renderer（1.1.0 规格 RE-SPOTLIGHT-1.1.0.md §4）。
// 单输入框直达 most-recent-bot；Escape/外点/发送成功三路 dismiss；CSS phase 动画二段收起。
// 薄实现：不走 ProductionRenderer（重），直接用 pbots M1 白名单 RPC（session/list+session/prompt）。
import './SpotlightApp.css'
import { useCallback, useEffect, useRef, useState } from 'react'

interface AgentItem { id: string; title?: string; lastActivity?: number }

async function pickMostRecentBot(): Promise<AgentItem | null> {
  const res = await window.pbots.api('session/list', { _request: {} }) as { ok: boolean; value?: { items?: Array<{ sessionId: string; origin?: string; updatedAt?: number | string; title?: string }> } }
  if (!res?.ok) return null
  const items = (res.value?.items ?? []).filter((i) => i.origin !== 'subagent')
  if (items.length === 0) return null
  const key = (v: number | string | undefined): number => (typeof v === 'number' ? v : v !== undefined ? Date.parse(v) : 0)
  items.sort((a, b) => key(b.updatedAt) - key(a.updatedAt))
  const top = items[0]!
  return { id: top.sessionId, title: top.title, lastActivity: key(top.updatedAt) }
}

export default function SpotlightApp(): React.JSX.Element {
  const [bot, setBot] = useState<AgentItem | null>(null)
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<'presented' | 'dismissing'>('presented')
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const poll = (attempt: number): void => {
      void pickMostRecentBot().then((b) => { if (alive && b !== null) setBot(b) })
        .catch((e: unknown) => { if (alive) setErr(String(e)) })
      if (attempt < 20) setTimeout(() => { if (alive) poll(attempt + 1) }, 1_500) // ready 门未开时 invoke 悬挂——轮询直到拿到
    }
    poll(0)
    return () => { alive = false }
  }, [])

  const dismiss = useCallback((): void => {
    setPhase('dismissing') // CSS 动画收起；main 侧由 spotlight 窗 blur 兜底（RE：dismiss 回退 400ms）
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); dismiss() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dismiss])

  const send = useCallback(async (): Promise<void> => {
    const value = text.trim()
    if (value.length === 0 || bot == null || busy) return
    setBusy(true)
    try {
      // wire 契约照 shim sendPrompt（data.ts:744）：requestId+mode:queue+content 块
      await window.pbots.api('session/prompt', { request: { requestId: `spotlight-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, sessionId: bot.id, mode: 'queue', content: [{ type: 'text', text: value }] } })
      setText('')
      dismiss() // 发送成功即收（RE §4 onSent → beginDismiss）
    } catch { /* 失败保留输入——不发丢 */ }
    finally { setBusy(false) }
  }, [bot, busy, dismiss, text])

  return (
    <div
      className="pbots-spotlight-root"
      data-pbots-spotlight-phase={phase}
      ref={rootRef}
      onPointerDown={(e) => { if (e.target === e.currentTarget) dismiss() }}
      onAnimationEnd={(e) => { if (e.target === e.currentTarget && phase === 'dismissing') window.close() }}
    >
      <div className="pbots-spotlight-card">
        <div className="pbots-spotlight-target">{err !== null ? 'ERR ' + err.slice(0, 80) : bot == null ? '…' : `→ ${bot.title ?? bot.id.slice(0, 13)}`}</div>
        <textarea
          autoFocus
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
          placeholder={bot == null ? '找最近会话…' : '发消息给最近的 bot'}
          rows={3}
          value={text}
        />
        <div className="pbots-spotlight-hint">Enter 发送 · Shift+Enter 换行 · Esc 收起</div>
      </div>
    </div>
  )
}
