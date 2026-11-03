// P-B 会话流（U-21/PAB；裁决见 work/p4-ui/ui/PAB-final.md）：对照原版 ConversationWorkspace（RE-ui-shell §3.2）
// 只留 Transcript + Composer；ChatHeader 并进 titlebar（shell/App.tsx）。
// - tool-call 紧凑行：原版 Bfn 图标映射 loading / x-circle / wrench，name→Title Case + 单行摘要，点击展开（disclosure）。
// - 审批卡 inline 挂在对应 callId 的行下（R1）；缺 callId → 本流末尾独立块（R2）；composer 位 36px 提示条（R1）。
//   卡内无默认 Enter 批准、不抢焦点（R3）；「仅批准这一次」（R4）；提交态/终态文案（R5）；离线禁用作答（R20）。
// - 流式：首块前三点气泡（R17）、逐 chunk 原位增长、assistant/message 定稿替换；底部 80px 内跟随，否则胶囊（R18）。
// - c1 只读 bot：composer 位换失效横幅 +「用此配置新建 →」（U-23 PDC D5）。
// - U-27（RE-visual-audit B6/B8/B10）：tool 行 = 0.18 outline-item 描边卡（+6px 旋转箭头）；审批卡 r10 / 14·16 / 小按钮，
//   提交后整卡收成 outcome 单行；composer = 0.18 prompt-shell（9px / r16 / 输入 ≥48 + 动作行），不做 mic/附件。
// - composer：Enter 发送 / Shift+Enter 换行 / IME 组字不发送；运行中主按钮为停止，Esc 不绑定（R19）；草稿按 bot 隔离（R21）。
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon, type IconName } from '../../theme/theme'
import { answer, cancelTurn, getState, loadOlder, openNewBot, sendPrompt, setDraft, type Approval, type State } from '../../shell/store'
import { Avatar, botInfo } from '../bots/Sidebar'
import { cloneInit } from '../settings/InfoPane'
import { toolSummary, toolTitle, type TimelineItem } from './reduce'
import { Markdown } from './Markdown'

type ToolItem = Extract<TimelineItem, { kind: 'tool' }>

const DECISION: Record<string, { icon: IconName; text: string; tone: string }> = {
  'allowed-once': { icon: 'check', text: '已批准一次', tone: 'success' },
  rejected: { icon: 'x', text: '已拒绝', tone: 'danger' },
  cancelled: { icon: 'x', text: '已取消', tone: 'muted' },
  unavailable: { icon: 'x', text: '不可用', tone: 'muted' },
}

function ApprovalCard({ approval, args, online }: { approval: Approval; args: string | null; online: boolean }): JSX.Element {
  const busy = approval.phase === 'submitting' || approval.phase === 'submitted'
  if (approval.phase === 'submitted') {
    // B8：0.18 已决审批整卡替换为 outcome 一行（secondary 色）；工具结果到达后由行内 tool-decision 接手
    return (
      <div className="approval-outcome" role="status" tabIndex={-1} data-approval-card data-approval-outcome={approval.value ?? ''}
        data-event-id={approval.eventId} data-call-id={approval.callId ?? ''}>
        {approval.value === 'allowed-once' ? '已批准，等待工具结果' : '已拒绝，等待回合继续'}
      </div>
    )
  }
  const status = approval.phase === 'submitting' ? '正在提交决定…' : approval.error
  return (
    <div className="approval-card" role="group" aria-label="等待你的批准" tabIndex={-1}
      data-approval-card data-event-id={approval.eventId} data-call-id={approval.callId ?? ''}>
      <div className="approval-strip"><span className="dot warn" />等待你的批准</div>
      <div className="approval-title">想要运行 {toolTitle(approval.toolName)}</div>
      {args !== null && <pre className="approval-command">{toolSummary(args)}</pre>}
      {approval.reason !== null && <div className="approval-reason">{approval.reason}</div>}
      <div className="approval-actions">
        {status !== null && <span className={`approval-status${approval.phase === 'error' ? ' danger' : ''}`} role="status">{status}</span>}
        <button type="button" className="btn secondary" data-action="reject" disabled={busy || !online} onClick={() => void answer(approval.eventId, 'rejected')}>拒绝</button>
        <button type="button" className="btn primary" data-action="approve" disabled={busy || !online} onClick={() => void answer(approval.eventId, 'allowed-once')}>仅批准这一次</button>
      </div>
    </div>
  )
}

function ToolRow({ item, approval, online }: { item: ToolItem; approval: Approval | undefined; online: boolean }): JSX.Element {
  const [open, setOpen] = useState(false)
  const icon: IconName = item.status === 'failed' ? 'x-circle' : item.status === 'running' ? 'loading' : 'wrench'
  const decided = item.decision === null ? undefined : DECISION[item.decision] ?? { icon: 'x' as IconName, text: item.decision, tone: 'muted' }
  return (
    <div className="tool-row" data-call-id={item.callId} data-status={item.status}>
      <div className="tool-card">
        <button type="button" className="tool-line" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name={icon} className={item.status === 'running' && !item.awaiting ? 'spin' : item.status === 'failed' ? 'danger' : undefined} />
          <span className="tool-name">{toolTitle(item.name)}</span>
          <span className="tool-summary">{toolSummary(item.args)}</span>
          {item.awaiting && item.decision === null && <span className="tool-flag warn">等待批准</span>}
          <span className="tool-chevron" aria-hidden="true" />
        </button>
        {decided !== undefined && (
          <div className={`tool-decision ${decided.tone}`} data-decision={item.decision}><Icon name={decided.icon} />{decided.text}</div>
        )}
        {open && <pre className="tool-detail">{item.args}{item.result !== null ? `\n\n${item.result}` : ''}</pre>}
      </div>
      {approval !== undefined && <ApprovalCard approval={approval} args={item.args} online={online} />}
    </div>
  )
}

function Composer({ s, id, running, name }: { s: State; id: string; running: boolean; name: string }): JSX.Element {
  const draft = s.drafts[id] ?? ''
  const [error, setError] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  useEffect(() => { if (!running) setStopping(false) }, [running])
  async function send(): Promise<void> {
    const text = draft
    if (text.trim() === '') return
    setDraft(id, '')
    setError(null)
    const res = await sendPrompt(id, text)
    if (!res.ok) {
      // [GU-2]（席 C-M）：失败保留待发文本；等待期已有新输入则不覆盖，原文本进错误提示
      const waiting = getState().drafts[id] ?? ''
      if (waiting === '') { setDraft(id, text); setError(`发送失败：${res.error?.message ?? ''}`) }
      else setError(`发送失败：${res.error?.message ?? ''}（草稿已有新内容；未发送的文本：${text}）`)
    }
  }
  return (
    <div className="composer-wrap">
      <form className="composer" onSubmit={(e) => { e.preventDefault(); void send() }}>
        <textarea
          data-composer rows={1} value={draft} aria-label="消息" placeholder={`给 ${name} 发消息`}
          onChange={(e) => setDraft(id, e.target.value)}
          onKeyDown={(e) => {
            // IME 组字中的 Enter 是选词，不发送（isComposing / keyCode 229 双判，兼容 Chromium 输入法）
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); void send() }
          }}
        />
        <div className="composer-actions">
          {running
            ? <button type="button" className="send stop" data-action="stop" aria-label="停止" disabled={stopping}
              onClick={() => {
                setStopping(true)
                // [GU-3]（席 C-L）：失败两条路都复位 stopping——!ok 走 then，裸抛走 catch，不得永久 disabled
                void cancelTurn(id)
                  .then((r) => { if (!r.ok) { setStopping(false); setError(`停止失败：${r.error?.message ?? ''}`) } })
                  .catch((e: unknown) => { setStopping(false); setError(`停止失败：${e instanceof Error ? e.message : String(e)}`) })
              }}>
              <Icon name="stop" />
            </button>
            : <button type="submit" className="send" data-action="send" aria-label="发送" disabled={draft.trim() === ''}><Icon name="arrow-up" /></button>}
        </div>
      </form>
      {error !== null && <div className="composer-error" role="alert">{error}</div>}
    </div>
  )
}

export function Conversation({ s, id }: { s: State; id: string }): JSX.Element {
  const view = s.views[id]
  const info = botInfo(s, id)
  const mine = s.approvals.filter((a) => a.agentId === id)
  const toolCalls = new Set(view?.items.flatMap((i) => (i.kind === 'tool' ? [i.callId] : [])) ?? [])
  const orphans = mine.filter((a) => a.callId === null || !toolCalls.has(a.callId))
  const scroller = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const [pill, setPill] = useState(false)
  /** 「加载更早」prepend 前的视口锚点（首条 id + 当时 scrollHeight），加载后补偿 scrollTop（席 C）。 */
  const anchor = useRef<{ id: string; height: number } | null>(null)
  const last = view?.items[view.items.length - 1]
  const thinking = info.running && view?.streaming === null && !(last?.kind === 'tool' && last.status === 'running')

  const startOlder = (): void => {
    const el = scroller.current
    if (el !== null && view !== undefined) anchor.current = { id: view.items[0]?.id ?? '', height: el.scrollHeight }
    void loadOlder(id)
  }

  useLayoutEffect(() => {
    const el = scroller.current
    if (el === null) return
    // U-26 ③：更早一页 prepend（首条 id 变化）→ scrollTop 补偿高度差，视口锚点不动
    if (anchor.current !== null) {
      const prepended = view?.items[0]?.id !== anchor.current.id
      if (prepended) el.scrollTop += el.scrollHeight - anchor.current.height
      anchor.current = null
    }
    if (atBottom.current) el.scrollTop = el.scrollHeight
    else setPill(true)
  }, [view?.items.length, view?.streaming?.text, mine.length, thinking])

  const scrollToEnd = (): void => {
    const el = scroller.current
    if (el !== null) el.scrollTop = el.scrollHeight
    setPill(false)
  }

  return (
    <section className="pane" data-pane={id}>
      {!s.online && <div className="offline-bar" role="status">与本地引擎的连接中断，正在重连…</div>}
      {s.notice !== null && <div className="pane-notice" role="status">{s.notice}</div>}
      <div className="transcript" ref={scroller} onScroll={(e) => {
        const el = e.currentTarget
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        if (atBottom.current) setPill(false)
      }}>
        <div className="chat-col">
          {view?.loaded === true && view.items.length > 0 && (view.hasMore || view.older.phase === 'error') && (
            <div className="older-bar" data-older>
              {view.older.phase === 'loading'
                ? <span className="older-status" role="status">正在加载更早…</span>
                : view.older.phase === 'error'
                  ? <button type="button" className="btn secondary" data-action="retry-older" onClick={startOlder}>加载更早失败 · 重试</button>
                  : <button type="button" className="btn secondary" data-action="load-older" onClick={startOlder}>加载更早</button>}
            </div>
          )}
          {view?.loaded !== true && (
            <div className="skeleton" aria-label="正在加载对话"><div className="sk-bubble left" /><div className="sk-bubble right" /></div>
          )}
          {view?.loaded === true && view.items.length === 0 && view.streaming === null && !thinking && (
            <div className="empty">
              <Avatar info={info} size={48} />
              <div className="empty-name">{info.name}</div>
              <div className="empty-meta">{info.preset}{info.connectors.length > 0 ? ` · ${info.connectors.join('、')}` : ''}</div>
              <div className="empty-hint">发送第一条消息开始</div>
            </div>
          )}
          {view?.items.map((item) => {
            if (item.kind === 'user') return <div key={item.id} className="bubble user final" data-message-bubble>{item.text}</div>
            if (item.kind === 'assistant') return <div key={item.id} className="bubble assistant final" data-assistant-bubble><Markdown text={item.text} /></div>
            if (item.kind === 'notice') return <div key={item.id} className={`turn-notice ${item.tone}`}>{item.text}</div>
            return <ToolRow key={item.id} item={item} online={s.online} approval={mine.find((a) => a.callId === item.callId)} />
          })}
          {view?.streaming != null && <div className="bubble assistant streaming" data-streaming><Markdown text={view.streaming.text} /></div>}
          {thinking && <div className="bubble assistant thinking" aria-label="正在思考"><span /><span /><span /></div>}
          {orphans.map((a) => <ApprovalCard key={a.eventId} approval={a} args={null} online={s.online} />)}
        </div>
      </div>
      {pill && <button type="button" className="new-pill" onClick={scrollToEnd}><Icon name="arrow-down" />新消息</button>}
      {mine.length > 0 && (
        <button type="button" className="approval-hint" data-approval-hint onClick={() => {
          const card = scroller.current?.querySelector<HTMLElement>('[data-approval-card]')
          card?.scrollIntoView({ block: 'center' })
          card?.focus()
        }}>
          <span className="dot warn" />{info.name} 在等待你的批准<span className="hint-link">查看 ↑</span>
        </button>
      )}
      {info.readOnly
        ? (
          // c1（PDC D5）：composer 位换横幅 + 主按钮「用此配置新建 →」；不自动重试、无 spinner，历史照常可读
          <div className="readonly-bar" role="status" data-readonly-bar>
            <Icon name="slash-circle" /><span>连接器已失效，请新建 bot</span>
            <button type="button" className="btn primary" data-action="clone-config-bar" onClick={() => openNewBot(cloneInit(s, id))}>
              用此配置新建 <Icon name="arrow-right" />
            </button>
          </div>
        )
        : <Composer s={s} id={id} running={info.running} name={info.name} />}
    </section>
  )
}
