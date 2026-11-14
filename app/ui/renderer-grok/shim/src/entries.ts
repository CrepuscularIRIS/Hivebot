// P5-51 · foldTurns 输出 → 0.18 transcript raw entry 序列化（纯函数）。
// 消费端：frontend/src/production/model.ts projectTranscriptEntry（不 import 它，字段按其实读）：
// - user → message + role:'user' + content（P5-55；send-message 在 0.18 恒判 assistant 侧）
// - assistant 正文 → message + content 字符串（author=bot 名）
// - thinking → thinking + text
// - tool → tool-call + name/status/summary（status 词表 pending|running|done|failed|error|aborted）
// - notice → notice + content（messageText 读 content/text）
// - P6-16：create_bot / send_to_bot 工具行、回报（report）、任务（task）→ notice + content（回落文本）+ pbotsPeer
//   元数据（data.ts 收进 pbotsUi.peer，覆盖层 notice-view.tsx 按它渲染 Messaging 行 / 回报卡 / 任务卡）
// - 审批卡 → send-message + local-tool-permission + ask + permissionScope/Revision（dock 渲染硬条件，
//   P5-50 坑2 根因：S0 桩没带这两个字段 → pendingLocalToolPermission 恒 null → 卡不渲染）
import { foldTurns, type FoldOutput } from '../../../renderer/fold/turn-fold'
import type { SessionView, TimelineItem } from '../../../renderer/session/reduce'
import { ASSIGN_TOOLS, assignPeer, peerFallback, type PeerMeta } from './workers'

/** 0.18 transcript raw entry（id+kind 起码，其余按 kind 开放）。 */
export type RawEntry = Record<string, unknown> & { id: string; kind: string }

const ts = (at: number | undefined): number => at ?? Date.now()

/** 工具实参里第一个常见键（command/path/query/url）的全文；非 JSON / 无键 → null。 */
function argText(args: string): string | null {
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>
    for (const key of ['command', 'path', 'file_path', 'query', 'url']) {
      const v = parsed[key]
      if (typeof v === 'string' && v !== '') return v
    }
  } catch { /* 原样 */ }
  return null
}

/** 工具行单行摘要：argText 优先，截 120 字。 */
/** T25：kickstart 自我介绍提示（0.79.3 服务端注入引导提示的客户端形态——transcript/outline 都不显示）。
 * 0.79.3 无 UI 抑制开关：是否介绍由代码路径决定；我们的 createBot 带 kickstart?:false 供 T26 onboarding 用。 */
/** T30：介绍提示构造——全部内容都在标签内（name/setup 可选；:550 旧 bug 是 setup 拼到闭合标签后）。 */
export function kickstartPrompt(o: { name?: string; setup?: string }): string {
  const name = o.name !== undefined && o.name.trim() !== '' ? `Your name is ${o.name.trim()}. ` : ''
  const setup = o.setup !== undefined && o.setup.trim() !== '' ? ` Your setup: ${o.setup.trim()}` : ''
  return `<bot_introduction_request>${name}You were just created. Greet the user and introduce yourself in two or three short sentences: your name if you have one, your personality, and what you can help with. Don't use any tools.${setup}</bot_introduction_request>`
}

export const KICKSTART_PROMPT = kickstartPrompt({})

/** T60：dsh 自动标题会取第一条 user 消息——kickstart 提示被截断成标题（无闭合标签，
 * isKickstartPrompt 认不出）。前缀判定（工单边界 3）：中缀（用户自起名照带）不算泄漏。 */
export function isKickstartTitle(title: string): boolean {
  return title.startsWith('<bot_introduction_request>')
}

/** 只认标签不认正文（T30 往里加名字时旧会话照样认得出）。 */
export function isKickstartPrompt(text: string | undefined | null): boolean {
  const t = (text ?? '').trim()
  return t.startsWith('<bot_introduction_request>') && t.endsWith('</bot_introduction_request>')
}

/** T25 review M：条目级判定——标签 + kickstart 发送身份（rpcId 前缀）。
 * 用户自己输入同标签文本时 rpcId 是自己的 nonce，照常显示与对账（ack 不悬挂）。 */
export function isKickstartEntry(text: string | undefined | null, rpcId: string | undefined | null): boolean {
  return isKickstartPrompt(text) && (rpcId ?? '').startsWith('kickstart-')
}

export function toolSummary(name: string, args: string, result: string | null): string {
  const text = argText(args)
  if (text !== null) return text.slice(0, 120)
  if (result !== null && result !== '') return result.replace(/\s+/g, ' ').slice(0, 120)
  return args === '' ? name : args.slice(0, 120)
}

/** 审批卡显示的完整动作（P5-31 ③，不截断）：request_network 的 reason 已含命令 + 范围 + 期限
 * （sdk shell-ask.mjs:187），一律显示 reason；其余取同 callId 工具行实参全文，拿不到退 reason、再退工具名。 */
export function askText(ask: { toolName: string; reason: string | null }, args: string | undefined): string {
  const fromArgs = ask.toolName === 'request_network' || args === undefined ? null : argText(args)
  return fromArgs ?? ask.reason ?? ask.toolName
}

export interface SerializeInput {
  items: readonly TimelineItem[]
  hasMore: boolean
  running: boolean
  streaming: SessionView['streaming']
  agentName: string
  /** sendPrompt 的 clientNonce（= session/prompt.requestId，按消息身份绑定，见 toRawEntries）。 */
  clientNonce?: string
}

/** 完整序列化：折叠 + 映射 + 流式尾条。 */
export function serialize(input: SerializeInput): RawEntry[] {
  const out: FoldOutput = foldTurns(input.items, { hasMore: input.hasMore, running: input.running })
  const raw = toRawEntries(out, input.agentName, input.streaming, input.clientNonce === undefined
    ? undefined
    : { clientNonce: input.clientNonce })
  // T22（0.79.3 COORD Qz / APP LF）：reasoning 流不进主 transcript（过程只在 outline 侧板）
  return raw
}

/** FoldOutput → raw entries（单测直接喂 foldTurns 结果）。 */
export function toRawEntries(
  out: FoldOutput,
  agentName: string,
  streaming: { text: string } | null,
  nonce?: { clientNonce: string },
): RawEntry[] {
  const raw: RawEntry[] = []
  // L-7 R4/O2（f2 身份匹配）：nonce 只绑到 source.rpcId 与它一致的用户消息——rpcId 就是
  // session/prompt.requestId（wire 上 SDK 写进 user/message 的发送身份），文本匹配证明
  // 不了发送身份（f1 验收：同文本历史消息被补上新 nonce、ack 被提前对账）。窗口里还
  // 没有该 rpcId 时不消费——下一次快照新消息到达再绑；重试场景（R5 换回原 nonce 后）
  // 原消息的 rpcId 即原 nonce，同样命中。
  const nonceEntryId = nonce === undefined ? null
    : (out.entries.filter((e) => e.kind === 'user' && e.rpcId === nonce.clientNonce).at(-1)?.id ?? null)
  for (const e of out.entries) {
    const at = e.at
    switch (e.kind) {
      case 'user': {
        // T25：kickstart 介绍提示不进主 transcript（0.79.3 客户端看不到那条引导 user 消息）
        if (isKickstartEntry(e.text, e.rpcId)) break
        // P5-55：0.18 model.ts 判侧 `kind==='send-message' || role==='assistant' ? assistant : user`——send-message 是 agent 发来的消息，
        // 用户消息必须 message + role:'user'（原 send-message 让用户输入落 assistant 侧，VERIFY-P5-51 OBS）
        const entry: RawEntry = { kind: 'message', id: e.id, timestampMs: ts(at), role: 'user', author: 'You', content: e.text }
        if (nonce !== undefined && e.id === nonceEntryId) entry.clientNonce = nonce.clientNonce
        raw.push(entry)
        break
      }
      case 'message':
        // role 必须 'assistant'：0.18 投影按 value.role 判侧（model.ts），缺省会落到 user 侧纯文本（无 markdown）
        raw.push({ kind: 'message', id: e.id, timestampMs: ts(at), role: 'assistant', author: agentName, content: e.text })
        break
      case 'thinking':
        // T22（0.79.3 COORD Qz / APP LF）：thinking（reasoning 与中间轮正文两种 from）无条件
        // 不进主 transcript——用户原话「没有 cot，只有第一次回答和最后一次回答」；过程在 outline 侧板。
        break
      case 'tool-call':
        // T22：普通工具行无条件不进主 transcript（Qz 的 tool-call 分支；ASSIGN_TOOLS 转编排
        // peer 不变）。工具状态/args/result 的可见性全部由 T21 的 outline 面板承接
        //（L-7 R2 的完整 args/result 随主聊天工具卡一并退场）。
        if (ASSIGN_TOOLS.has(e.name)) raw.push(peerEntry(e.id, at, assignPeer(e)))
        break
      case 'notice':
        // T50a：缺 key 引导 notice 带 action，透传给视图层出按钮
        raw.push(e.action === undefined
          ? { kind: 'notice', id: e.id, timestampMs: ts(at), content: e.text }
          : { kind: 'notice', id: e.id, timestampMs: ts(at), content: e.text, action: e.action })
        break
      case 'peer':
        raw.push(peerEntry(e.id, at, e.peer.kind === 'report' ? { kind: 'report', items: e.peer.items } : { kind: 'task', fromId: e.peer.fromId, text: e.peer.text }))
        break
    }
  }
  if (streaming !== null && streaming.text !== '') {
    // T22 流式取舍（0.79.3 RE 题 1(f)）：首工具后的正文在 turn/end 前分不清中间轮还是终答
    //（P6-03），流式期不显示、turn/end 后作为 result 一次出现——先显示再消失会闪；过程期间
    // 的可见反馈是 typing 点 + 侧栏状态（T23 换状态行），流式过程在 outline（live-stream 尾条）。
    // streamingAs==='text'（首答流）照旧实时显示。
    if (out.streamingAs !== 'thinking') {
      raw.push({ kind: 'message', id: 'live-stream', timestampMs: Date.now(), role: 'assistant', author: agentName, content: streaming.text, isStreaming: true })
    }
  }
  return raw
}

/** P6-16 编排条目：上游当 notice 渲染（content = 回落文本），覆盖层按 pbotsPeer 渲染。 */
function peerEntry(id: string, at: number | undefined, meta: PeerMeta): RawEntry {
  return { kind: 'notice', id, timestampMs: ts(at), content: peerFallback(meta), pbotsPeer: meta }
}

/** 审批卡 entry（pending 态）。status 词表：pending|always|never|denied|expired|allow-once。 */
export function permissionEntry(input: {
  id: string; requestId: string; scope: string; revision: number; at?: number
  command: string; status?: 'pending' | 'allow-once' | 'denied' | 'always' | 'skipped'
  /** T73c：连接器卡只读标注（mcp__ 工具才有；bash/文件卡不带）。 */
  connector?: { serverName: string; displayName: string }
}): RawEntry {
  return {
    kind: 'send-message',
    id: input.id,
    timestampMs: ts(input.at),
    message: {
      type: 'local-tool-permission',
      ask: {
        requestId: input.requestId,
        status: input.status ?? 'pending',
        action: { kind: 'run-command', command: input.command },
        target: { kind: 'local-computer' },
        ...(input.connector === undefined ? {} : { connector: input.connector }),
      },
    },
    permissionScope: input.scope,
    permissionScopeRevision: input.revision,
  }
}
