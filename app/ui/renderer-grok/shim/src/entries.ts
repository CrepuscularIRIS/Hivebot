// P5-51 · foldTurns 输出 → 0.18 transcript raw entry 序列化（纯函数）。
// 消费端：frontend/src/production/model.ts projectTranscriptEntry（不 import 它，字段按其实读）：
// - user → message + role:'user' + content（P5-55；send-message 在 0.18 恒判 assistant 侧）
// - assistant 正文 → message + content 字符串（author=bot 名）
// - thinking → thinking + text
// - tool → tool-call + name/status/summary（status 词表 pending|running|done|failed|error|aborted）
// - notice → notice + content（messageText 读 content/text）
// - 审批卡 → send-message + local-tool-permission + ask + permissionScope/Revision（dock 渲染硬条件，
//   P5-50 坑2 根因：S0 桩没带这两个字段 → pendingLocalToolPermission 恒 null → 卡不渲染）
import { foldTurns, type FoldOutput } from '../../../renderer/fold/turn-fold'
import type { SessionView, TimelineItem } from '../../../renderer/session/reduce'

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
function toolSummary(name: string, args: string, result: string | null): string {
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
  /** sendPrompt 的 clientNonce 补记到第一条用户消息（ack 上游乐观条目）。 */
  clientNonce?: string
}

/** 完整序列化：折叠 + 映射 + 流式尾条。 */
export function serialize(input: SerializeInput): RawEntry[] {
  const out: FoldOutput = foldTurns(input.items, { hasMore: input.hasMore, running: input.running })
  const raw = toRawEntries(out, input.agentName, input.streaming, input.clientNonce === undefined ? undefined : { clientNonce: input.clientNonce })
  if (input.streaming !== null && input.streaming.reasoning !== '' && input.streaming.text === '') {
    raw.push({ id: 'live-reasoning', kind: 'thinking', text: input.streaming.reasoning, timestampMs: Date.now() })
  }
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
  let nonceUsed = false
  for (const e of out.entries) {
    const at = e.at
    switch (e.kind) {
      case 'user': {
        // P5-55：0.18 model.ts 判侧 `kind==='send-message' || role==='assistant' ? assistant : user`——send-message 是 agent 发来的消息，
        // 用户消息必须 message + role:'user'（原 send-message 让用户输入落 assistant 侧，VERIFY-P5-51 OBS）
        const entry: RawEntry = { kind: 'message', id: e.id, timestampMs: ts(at), role: 'user', author: 'You', content: e.text }
        if (nonce !== undefined && !nonceUsed) { entry.clientNonce = nonce.clientNonce; nonceUsed = true }
        raw.push(entry)
        break
      }
      case 'message':
        // role 必须 'assistant'：0.18 投影按 value.role 判侧（model.ts），缺省会落到 user 侧纯文本（无 markdown）
        raw.push({ kind: 'message', id: e.id, timestampMs: ts(at), role: 'assistant', author: agentName, content: e.text })
        break
      case 'thinking':
        raw.push({ kind: 'thinking', id: e.id, timestampMs: ts(at), text: e.text })
        break
      case 'tool-call':
        raw.push({
          kind: 'tool-call', id: e.id, timestampMs: ts(at), name: e.name, status: e.status,
          summary: toolSummary(e.name, e.args, e.result),
        })
        break
      case 'notice':
        raw.push({ kind: 'notice', id: e.id, timestampMs: ts(at), content: e.text })
        break
    }
  }
  if (streaming !== null && streaming.text !== '') {
    // P6-03：首工具后的流式正文是中间 / 尾段（turn/end 才升 result），落 thinking 行——进行中气泡 ≤1（BRIEF D1）
    raw.push(out.streamingAs === 'thinking'
      ? { kind: 'thinking', id: 'live-stream', timestampMs: Date.now(), text: streaming.text }
      : { kind: 'message', id: 'live-stream', timestampMs: Date.now(), role: 'assistant', author: agentName, content: streaming.text, isStreaming: true })
  }
  return raw
}

/** 审批卡 entry（pending 态）。status 词表：pending|always|never|denied|expired|allow-once。 */
export function permissionEntry(input: {
  id: string; requestId: string; scope: string; revision: number; at?: number
  command: string; status?: 'pending' | 'allow-once' | 'denied'
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
      },
    },
    permissionScope: input.scope,
    permissionScopeRevision: input.revision,
  }
}
