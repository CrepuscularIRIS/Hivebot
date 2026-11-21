// P5-52 覆盖：消息悬浮操作剥掉无实底的三项，保留 More → Copy。
// T91：renderMessageReactionActions 恢复透传（coordinator 已实现 reactToMessage）。
// B5：onReply 恢复透传（reply 态 UI 走 recovered reply-thread-controller；发送引用走 shim [reply:id] 标记）。
// onStartThread 保持 undefined（线程树不在本批——shim 无线程语义）。
// transcript-card 那条路径（TranscriptCardActionAnchor）按 context.threadRootId 门控 Reply / Start a thread，
// 而 More/Copy 依赖 context 存在：context 原样传，threadRootId 置哨兵 = 「不在主线 → 不给线程操作」。
// （context.threadRootId 全树只有 message-actions.tsx 两处消费，都是这个门控。）
// P5-54：主线 transcript 插入时间分隔 / 未读线（markers.ts，0.78.1 语义；上游只渲染、不生成）。
// P5-55：进入带未读线的会话，线以下超一屏 → 滚到线（顶下 28px）；每次冻结出新起点只滚一次，停留期不再抢滚动。
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ConversationTranscript as Upstream } from '../../frontend/src/recovered/features/conversation/workspace/transcript'
import { AgentAvatar } from './agent-avatar' // T88f：接 T88 引擎覆盖版（modules 内相对——曾全路径指上游 0.18 旧版，状态行画旧吉祥物）
import { activeAgent, createUnreadTracker, unreadScrollTop, withMarkers } from './markers'
import { begin, exitUntil, nextWakeMs, render as renderStatus, step, textKindOf, type Activity, type StatusState } from './status-line'
import '../status-line.css'
import './reaction-t91b.css' // T91b：reaction 视觉（0.78.1 形态补足）

export * from '../../frontend/src/recovered/features/conversation/workspace/transcript'

const NO_THREADS = 'pbots:no-threads'

/** T23：活动形状归一（shim activityOf 产 {kind:'thinking'} | {kind:'tool',tool}；其余按无活动）。 */
const normalizeActivity = (raw: unknown): Activity => {
  if (typeof raw === 'object' && raw !== null) {
    const r = raw as { kind?: unknown; tool?: unknown }
    if (r.kind === 'thinking') return { kind: 'thinking' }
    if (r.kind === 'tool' && typeof r.tool === 'string') return { kind: 'tool', tool: r.tool }
  }
  return null
}

/** T23：0.79.3 状态行（吉祥物 + 活动短语）。挂在 .sand-virtual-transcript 最后，随转录滚动。
 * 活动源 = chat-header 覆盖渲染期写入的 activeAgent（同 markers 先例）；wake 定时器兜底重绘。 */
function StatusLine() {
  const box = useRef<{ state: StatusState | null; visibleSince: number | null; exitUntil: number | null }>({ state: null, visibleSince: null, exitUntil: null })
  const [, setTick] = useState(0)
  const now = Date.now()
  const b = box.current
  const activity = normalizeActivity(activeAgent.activity)
  if (activeAgent.running) {
    b.exitUntil = null // review M3：退场窗口内恢复运行 → 取消退场
    if (b.state === null) {
      b.state = begin(activity, now, Math.random)
      b.visibleSince = now
      b.exitUntil = null
    } else {
      b.state = step(b.state, activity, now, Math.random)
    }
  } else if (b.state !== null && b.exitUntil === null) {
    b.exitUntil = exitUntil(now) // Yjn：回合结束保留 140ms 再卸载
  }
  useEffect(() => {
    const cur = box.current
    if (cur.state === null) return
    if (cur.exitUntil !== null) {
      const t = setTimeout(() => { box.current = { state: null, visibleSince: null, exitUntil: null }; setTick((x) => x + 1) }, Math.max(0, cur.exitUntil - Date.now()))
      return () => clearTimeout(t)
    }
    const wake = nextWakeMs(cur.state, Date.now(), cur.visibleSince ?? Date.now())
    if (wake === null) return
    const t = setTimeout(() => setTick((x) => x + 1), Math.max(0, wake - Date.now()))
    return () => clearTimeout(t)
  })
  if (b.state === null || typeof document === 'undefined') return null
  const scroller = document.querySelector<HTMLElement>('.sand-virtual-transcript')
  if (scroller === null) return null
  // 虚拟列表可能在 portal 之后又 append 行——每趟把自己挪回末尾（随转录滚到底可见）
  queueMicrotask(() => {
    const el = scroller.querySelector(':scope > .sand-status-line')
    if (el !== null && el !== scroller.lastElementChild) scroller.appendChild(el)
  })
  const out = renderStatus(b.state, now, b.visibleSince ?? now)
  const kind = textKindOf(b.state.activity)
  return createPortal(
    <div className="sand-status-line" data-role="assistant" data-activity={kind} data-exiting={b.exitUntil !== null || undefined}>
      <span className="sand-status-line__avatar"><AgentAvatar agentId={activeAgent.id ?? ''} color={activeAgent.avatarColor} shape={activeAgent.avatarShape} currentActivity={activeAgent.activity} isRunning size="sm" /></span>
      {out.text !== null ? <span className="sand-activity-label__text" data-text={out.text}>{out.text}</span> : null}
      {out.elapsed !== null ? <span className="sand-activity-elapsed">· {out.elapsed}</span> : null}
    </div>,
    scroller,
  )
}
// P5-55：用户消息改走普通 message 路径后（shim 判侧修正），其 More 菜单的 Copy 依赖 onCopyMessage——宿主没注入，菜单为空 = 死入口。
// 与卡片路径的兜底同语义（message-actions.tsx clipboardCopyForEntry：navigator.clipboard.writeText）。
const copyText = (entry: { text: string }): Promise<void> | undefined => navigator.clipboard?.writeText(entry.text)
const unread = createUnreadTracker()

type Props = Parameters<typeof Upstream>[0]

export function ConversationTranscript(props: Props) {
  const interactions = props.resolveTranscriptCardInteractions
  const cardInteractions = useMemo(() => interactions == null ? interactions : { ...interactions, threadRootId: NO_THREADS }, [interactions])
  const isMainLine = props.threadRootId == null && activeAgent.id !== null
  const unreadBefore = isMainLine ? unread.visit(activeAgent.id!, props.entries) : null
  const entries = useMemo(
    () => (isMainLine ? withMarkers(props.entries, Date.now(), unreadBefore) as Props['entries'] : props.entries),
    [isMainLine, props.entries, unreadBefore],
  )
  const scrollKey = isMainLine && unreadBefore !== null ? `${activeAgent.id}:${unreadBefore}` : null
  useEffect(() => {
    if (scrollKey === null) return
    // 上游跟底在同一提交后执行，下一帧再定位
    const raf = requestAnimationFrame(() => {
      const divider = document.querySelector<HTMLElement>('.sand-virtual-transcript .sand-unread-divider')
      const scroller = divider?.closest<HTMLElement>('.sand-virtual-transcript')
      if (divider == null || scroller == null) return
      const lineTop = divider.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      const top = unreadScrollTop(lineTop, scroller.scrollHeight, scroller.clientHeight)
      if (top !== null) scroller.scrollTop = top
    })
    return () => cancelAnimationFrame(raf)
  }, [scrollKey])
  // T23：typing 三点退役（0.18 构件）——0.79.3 状态行由覆盖层自己渲染（portal 到滚动容器末尾）
  // T85c：滚动跟随——stick 态由用户 scroll 维护（距底 <80=stick）；跟底 ResizeObserver
  // （内容长高含 statusline/margin/过渡——childList 看不见）；钮放 scroller 兄弟（不随内容滚走）
  const [showJump, setShowJump] = useState(false)
  // T79c：动态未读态（0.78.1 jumpToLatestPill——非 stick 时新内容到达升 pill）；
  // unreadBefore 只是挂载快照（重进会话的历史未读），流式中新到达不升——产品缺口补
  const [hasUnread, setHasUnread] = useState(false)
  const prevContentHRef = useRef(0) // T79c b：内容高度基线（替代 distance 基线）
  const stickRef = useRef(true)
  const sentLockRef = useRef(false)
  const programScrollRef = useRef(false)
  const prevUsersRef = useRef<number | null>(null)
  const scrollHostRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!isMainLine) return
    const scroller = document.querySelector<HTMLElement>('.sand-virtual-transcript')
    if (scroller === null) return
    scrollHostRef.current = scroller
    let raf = 0
    const check = (): void => {
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
      if (!programScrollRef.current) sentLockRef.current = false
      const wasProgram = programScrollRef.current
      programScrollRef.current = false
      // T85c 根因②：程序滚动帧不重判 stick——follow 赋值触发的 scroll 里瞬时 distance
      // 可能 >80（赋值后内容又长），重判 false 把后续 follow 全拦死（210 恒定真因）
      if (!wasProgram) { stickRef.current = distance < 80; setShowJump(distance > 80) }
    }
    const onScroll = (): void => { cancelAnimationFrame(raf); raf = requestAnimationFrame(check) }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    scroller.dataset.t85Live = '1'
    // T85c b 修（Sol M1）：check 仅用户 scroll 触发——effect 重挂（entries 变化）不再同步调
    // check（曾按内容增长后 distance 杀 stick——16 块长流式 d=6151 探针复现）
    return () => { delete scroller.dataset.t85Live; scroller.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [isMainLine])
  useEffect(() => {
    if (!isMainLine) return
    const scroller = scrollHostRef.current ?? document.querySelector<HTMLElement>('.sand-virtual-transcript')
    if (scroller === null) return
    // stick 轮询跟底（250ms）——RO/childList 各有盲区（RO 不触发 scroller 定高内容长高、
    // childList 不触发 statusline/margin），轮询最鲁棒（原版 chat UI 常规做法）
    const mo = new MutationObserver(() => {
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
      const users = scroller.querySelectorAll('.sand-message[data-role="user"]').length
      const sent = prevUsersRef.current !== null && users > prevUsersRef.current
      prevUsersRef.current = users
      // 发送=无条件滚底（sent 与内容长高同帧——distance 已超须先滚再判）
      // T85c 工单④：发送仅在 stick（距底<80）时滚底——用户滚上去（150 位）发消息不拽回
      // T85c 真根因：stick 只由用户 scroll 的 check() 重判——MO 帧曾按瞬时 distance 重判
      // （内容长高时恒 >80）把 stick 杀死后永无用户 scroll 复活 → follow 全停（1194/210）
      if (sent && (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight) < 80) { programScrollRef.current = true; scroller.scrollTop = scroller.scrollHeight; stickRef.current = true; sentLockRef.current = true; return }
      setShowJump(distance > 80)
      // T79c b（Sol 两中根治）：用 scrollHeight 差判**内容增长**（distance 差被用户滚动污染
      // ——滚离后 class mutation 误报；且每帧覆盖基线小块增长不累计。scrollHeight 只随内容变，
      // 用户滚动不动它）；>4px 防布局微抖
      if (!stickRef.current && distance > 80 && scroller.scrollHeight > prevContentHRef.current + 4) setHasUnread(true)
      if (stickRef.current) setHasUnread(false)
      prevContentHRef.current = scroller.scrollHeight
      if (stickRef.current && distance > 0) scroller.scrollTop = scroller.scrollHeight
    })
    mo.observe(scroller, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
    // T85c 方案主体：RO 观察**内容**（scroller 定高 border-box 不触发；firstElementChild
    // contentRect 长高——statusline 弹入/margin/过渡都看得见）——stick 即时跟底；
    // 250ms 轮询留兜底（RO 与 MO 各有盲区的双保险，工单方案 1）
    // T85c 根因修：follow 不看 sentLock——sentLock 只约束 check() 的 stick 重判（防程序
    // scroll 自反馈），拦跟底则发送后 RO/轮询全锁死（210 残留=发送帧跟底后的增量全没跟）
    // T85c：rAF 连追——赋值后布局分帧再长（虚拟列表/状态行/过渡），单次赋值恒落后一帧
    // （210=最后一帧增量）；连追到 distance<2 或 4 帧上限（防死循环）
    let chaseRaf = 0
    const chase = (frames: number): void => {
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
      if (!stickRef.current || distance < 2 || frames <= 0) return
      programScrollRef.current = true
      scroller.scrollTop = scroller.scrollHeight
      chaseRaf = requestAnimationFrame(() => chase(frames - 1))
    }
    const follow = (): void => { if (stickRef.current) chase(4) }
    const ro = new ResizeObserver(follow)
    const content = scroller.firstElementChild ?? scroller
    ro.observe(content, { box: 'content-box' })
    const timer = window.setInterval(follow, 250)
    return () => { mo.disconnect(); ro.disconnect(); window.clearInterval(timer); cancelAnimationFrame(chaseRaf) }
  }, [isMainLine, props.entries])
  const jump = (): void => {
    setHasUnread(false) // T79c：点钮视作已读
    const scroller = scrollHostRef.current
    if (scroller === null) return
    const divider = scroller.querySelector<HTMLElement>('.sand-unread-divider')
    if (divider !== null) divider.scrollIntoView({ behavior: 'smooth', block: 'center' })
    else scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
  }

  return <>
    <Upstream {...props} isAgentRunning={false} entries={entries} onCopyMessage={props.onCopyMessage ?? copyText} onReply={props.onReply} onStartThread={undefined} resolveTranscriptCardInteractions={cardInteractions} />
    {isMainLine ? <StatusLine /> : null}
    {isMainLine && showJump ? createPortal(
      <button aria-label="Jump to latest" className="sand-jump-to-latest" data-unread={unreadBefore !== null || hasUnread || undefined} onClick={jump} type="button">{unreadBefore !== null || hasUnread ? 'New messages' : 'Jump to latest ↓'}</button>,
      (scrollHostRef.current?.parentElement as HTMLElement | null) ?? document.body,  // T85c：兄弟位
    ) : null}
  </>
}
