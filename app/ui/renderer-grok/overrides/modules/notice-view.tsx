// P6-16 覆盖（定稿 work/p6-orchestration/ui/P6-15-16-FINAL.md §1-13~17）：notice 载体上的三种编排条目。
// shim entries.ts 把 create_bot / send_to_bot 工具行、worker 回报（pbots-worker）、主 bot 任务（pbots-main）
// 序列化成 notice（content = 回落文本），元数据登记在 pbotsUi.peer(entryId)；查不到 → 原样交上游 notice。
// - Messaging 行：与工具行同形（.sand-outline-item*），整行 = 打开 worker；pending / failed 不可点
// - 回报卡：assistant 泳道来源消息（左列、≤560），每项署 worker 头像 + 名；ask 项只给定位入口（决策 22：
//   主 bot 侧没有 Allow / Deny），打开后焦点移到 worker 的原审批卡
// - 任务卡：worker 侧「来自主 bot」，accent 左边线；正文逐字全文
// 名字 / result / 任务正文都是不可信数据：只走 React 文本节点，不渲染 markdown、不生成链接。
import { useState } from 'react'
import { TranscriptNoticeCard as Upstream } from '../../frontend/src/recovered/features/conversation/cards/notice/view'
import { AgentAvatar } from '../../frontend/src/recovered/features/conversation/workspace/agent-avatar'
import { SandIcon } from '../../frontend/src/recovered/ui/sand-kit-primitives'
import type { TranscriptNotice } from '../../frontend/src/recovered/features/conversation/workspace/model'
import { activeAgent } from './markers'
import { ui, useUiVersion, type PbotsUi } from './pbots-ui'
import type { AssignPeer } from '../../shim/src/workers'
import type { ReportItem } from '../../../renderer/session/reduce'

export * from '../../frontend/src/recovered/features/conversation/cards/notice/view'

const PERMISSION_DOCK = '[aria-label="Local tool permissions"]'

/** 打开 bot；attention = 待人工入口：等会话切过去后把焦点交给原审批卡（容器，不是 Allow 钮——防误按 Enter 放行）。 */
function openBot(u: PbotsUi, id: string, attention = false): void {
  u.focus(id)
  if (!attention) return
  let frames = 0
  const tick = (): void => {
    const dock = activeAgent.id === id ? document.querySelector<HTMLElement>(PERMISSION_DOCK) : null
    if (dock !== null) {
      if (!dock.hasAttribute('tabindex')) dock.tabIndex = -1
      dock.scrollIntoView({ block: 'nearest' })
      dock.focus({ preventScroll: true })
      return
    }
    if ((frames += 1) < 90) requestAnimationFrame(tick) // ≈1.5s：dock 随会话快照到达
  }
  requestAnimationFrame(tick)
}

const clock = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function Avatar({ id }: { id: string | null }) {
  if (id === null) return <span aria-hidden="true" className="pb-peer__avatar pb-peer__avatar--blank" />
  return <span aria-hidden="true" className="pb-peer__avatar"><AgentAvatar agentId={id} isStatic kind="agent" size="xs" /></span>
}

// ---- Messaging 行（决策 24）----
function AssignRow({ entry, meta, u }: { entry: TranscriptNotice; meta: AssignPeer; u: PbotsUi }) {
  const name = meta.name ?? (meta.workerId === null ? null : u.agentName(meta.workerId))
  const who = name ?? 'another assistant'
  const failed = meta.status === 'failed'
  const pending = meta.status === 'pending'
  const target = !failed && meta.workerId !== null && u.agentName(meta.workerId) !== null ? meta.workerId : null
  const icon = pending ? 'loading' : failed ? 'x-circle' : 'person-chat-bubble'
  const body = <>
    <SandIcon className="sand-outline-item__icon pb-assign__icon" name={icon} size="sm" />
    <span className="sand-outline-item__label">{failed ? `Couldn't message ${who}` : `Messaging ${who}`}</span>
    {(failed ? meta.error : meta.preview) ? <span className="sand-outline-item__preview">{failed ? meta.error : meta.preview}</span> : null}
    {target === null ? null : <SandIcon className="pb-assign__go" name="chevron-right" size="sm" />}
  </>
  return <div className="sand-outline-item pb-assign" data-entry-id={entry.id} data-kind="pbots-assign" data-pbots-peer="assign" data-status={meta.status} role="listitem">
    {target === null
      ? <div aria-disabled="true" className="sand-outline-item__row pb-assign__row">{body}</div>
      : <button aria-label={`Open ${who}`} className="sand-outline-item__row pb-assign__row" data-worker-id={target} onClick={() => openBot(u, target)} type="button">{body}</button>}
  </div>
}

// ---- 回报卡（D5 UI、决策 24）----
type Tone = 'success' | 'danger' | 'muted' | 'warn'
function itemState(item: ReportItem, u: PbotsUi): { word: string; tone: Tone; pending: boolean } {
  if (item.kind === 'ask') {
    const pending = item.workerId !== null && u.askPending(item.workerId, item.eventId)
    return pending ? { word: 'Needs you', tone: 'warn', pending } : { word: 'Answered', tone: 'muted', pending }
  }
  if (item.outcome === 'error') return { word: 'Failed', tone: 'danger', pending: false }
  if (item.outcome === 'stopped') return { word: 'Stopped', tone: 'muted', pending: false }
  return { word: 'Done', tone: 'success', pending: false }
}

function StatusMark({ tone }: { tone: Tone }) {
  if (tone === 'danger') return <SandIcon className="pb-mark" name="x-circle" size="xs" />
  if (tone === 'warn') return <SandIcon className="pb-mark" name="exclamation-circle" size="xs" />
  return <span aria-hidden="true" className="pb-dot" data-hollow={tone === 'muted' || undefined} />
}

const askFallback = (item: ReportItem): string => item.awaiting === 'question' ? 'Has a question for you' : 'Needs your approval'
const resultText = (item: ReportItem): string => item.result ?? (item.kind === 'ask' ? askFallback(item) : '')
// ponytail: 「Show more」按长度 / 行数估是否溢出 3 行（不量 DOM）；误判只多一个按钮或少一个按钮，全文在 worker 里。
const isLong = (text: string): boolean => text.length > 220 || text.split('\n').length > 3

function SingleItem({ item, u, at }: { item: ReportItem; u: PbotsUi; at: number }) {
  const [expanded, setExpanded] = useState(false)
  const state = itemState(item, u)
  const name = item.name ?? (item.workerId === null ? null : u.agentName(item.workerId)) ?? 'Worker'
  const text = resultText(item)
  const canOpen = item.workerId !== null && u.agentName(item.workerId) !== null
  return <div className="pb-report__item" data-pbots-item-kind={item.kind} data-pending={state.pending || undefined} data-tone={state.tone}>
    <div className="pb-report__head">
      <Avatar id={item.workerId} />
      <span className="pb-report__name" data-pbots-worker-name="">{name}</span>
      <span aria-hidden="true" className="pb-report__sep">·</span>
      <span className="pb-report__state"><StatusMark tone={state.tone} /><span data-pbots-state="">{state.word}</span></span>
      <time className="pb-report__time" dateTime={new Date(at).toISOString()}>{clock(at)}</time>
    </div>
    {text === '' ? null : <p className="pb-report__text" data-expanded={expanded || undefined}>{text}</p>}
    <div className="pb-report__foot">
      {isLong(text) ? <button aria-expanded={expanded} className="pb-report__more" onClick={() => setExpanded((v) => !v)} type="button">{expanded ? 'Show less' : 'Show more'}</button> : null}
      {canOpen ? <button aria-label={`Open ${name}, ${state.word}`} className="pb-report__open" data-worker-id={item.workerId!} onClick={() => openBot(u, item.workerId!, state.pending)} type="button">
        {state.pending ? `Review in ${name}` : 'Open worker'}<SandIcon name="chevron-right" size="xs" />
      </button> : null}
    </div>
  </div>
}

function BatchItem({ item, u }: { item: ReportItem; u: PbotsUi }) {
  const state = itemState(item, u)
  const name = item.name ?? (item.workerId === null ? null : u.agentName(item.workerId)) ?? 'Worker'
  const preview = resultText(item).replace(/\s+/g, ' ').trim()
  const canOpen = item.workerId !== null && u.agentName(item.workerId) !== null
  const inner = <>
    <Avatar id={item.workerId} />
    <span className="pb-report__name" data-pbots-worker-name="">{name}</span>
    <span className="pb-report__state"><StatusMark tone={state.tone} /><span data-pbots-state="">{state.word}</span></span>
    <span className="pb-report__preview">{preview}</span>
    {canOpen ? <SandIcon className="pb-report__go" name="chevron-right" size="xs" /> : null}
  </>
  return canOpen
    ? <button aria-label={`Open ${name}, ${state.word}`} className="pb-report__row" data-pbots-item-kind={item.kind} data-pending={state.pending || undefined} data-tone={state.tone} data-worker-id={item.workerId!} onClick={() => openBot(u, item.workerId!, state.pending)} type="button">{inner}</button>
    : <div className="pb-report__row" data-pbots-item-kind={item.kind} data-pending={state.pending || undefined} data-tone={state.tone}>{inner}</div>
}

function ReportCard({ entry, items, u }: { entry: TranscriptNotice; items: ReportItem[]; u: PbotsUi }) {
  return <div className="sand-transcript-row pb-peer-row" data-entry-id={entry.id}>
    <section aria-label="Worker update" className="pb-peer pb-report" data-pbots-peer="report" role="article">
      {items.length === 1
        ? <SingleItem at={entry.timestampMs} item={items[0]!} u={u} />
        : <>
          <div className="pb-report__batch-head"><span>{items.length === 0 ? 'Worker update' : `${items.length} worker updates`}</span><time className="pb-report__time" dateTime={new Date(entry.timestampMs).toISOString()}>{clock(entry.timestampMs)}</time></div>
          {items.map((item, i) => <BatchItem item={item} key={item.key || i} u={u} />)}
        </>}
    </section>
  </div>
}

// ---- 任务卡（D7 UI 部分）----
function TaskCard({ entry, fromId, text, u }: { entry: TranscriptNotice; fromId: string | null; text: string; u: PbotsUi }) {
  const from = (fromId === null ? null : u.agentName(fromId)) ?? 'Main bot'
  const canOpen = fromId !== null && u.agentName(fromId) !== null
  return <div className="sand-transcript-row pb-peer-row" data-entry-id={entry.id}>
    <article aria-label={`Task from ${from}`} className="pb-peer pb-task" data-pbots-peer="task">
      <div className="pb-task__head">
        <Avatar id={fromId} />
        {canOpen ? <button className="pb-task__from" data-pbots-from={fromId!} onClick={() => openBot(u, fromId!)} type="button">From {from}</button> : <span className="pb-task__from">From {from}</span>}
        <span className="pb-task__kind">· Task</span>
        <time className="pb-report__time" dateTime={new Date(entry.timestampMs).toISOString()}>{clock(entry.timestampMs)}</time>
      </div>
      <p className="pb-task__text">{text}</p>
    </article>
  </div>
}

export function TranscriptNoticeCard({ entry }: { entry: TranscriptNotice }) {
  useUiVersion() // ask 活状态 / 名字随 roster 变化重渲
  const u = ui()
  const meta = u?.peer(entry.id) ?? null
  if (u === null || meta === null) return <Upstream entry={entry} />
  if (meta.kind === 'assign') return <AssignRow entry={entry} meta={meta} u={u} />
  if (meta.kind === 'report') return <ReportCard entry={entry} items={meta.items} u={u} />
  return <TaskCard entry={entry} fromId={meta.fromId} text={meta.text} u={u} />
}
