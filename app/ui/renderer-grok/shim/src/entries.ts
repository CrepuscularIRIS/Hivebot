// P5-51 · foldTurns 输出 → 0.18 transcript raw entry 序列化（纯函数）。
// 消费端：frontend/src/production/model.ts projectTranscriptEntry（不 import 它，字段按其实读）：
// - user → send-message + message{type:'text',content}（messageText 读 message.content）
// - assistant 正文 → message + content 字符串（author=bot 名）
// - thinking → thinking + text
// - tool → tool-call + name/status/summary（status 词表 pending|running|done|failed|error|aborted）
// - notice → notice + content（messageText 读 content/text）
// - 审批卡 → send-message + local-tool-permission + ask + permissionScope/Revision（dock 渲染硬条件，
//   P5-50 坑2 根因：S0 桩没带这两个字段 → pendingLocalToolPermission 恒 null → 卡不渲染）
import { foldTurns, type FoldOutput } from '../../../renderer/fold/turn-fold'
import type { SessionView, TimelineItem } from '../../../renderer/plugins/session/reduce'

/** 0.18 transcript raw entry（id+kind 起码，其余按 kind 开放）。 */
export type RawEntry = Record<string, unknown> & { id: string; kind: string }

const ts = (at: number | undefined): number => at ?? Date.now()

/** 工具行单行摘要：args 里常见键（command/path/query/url）优先，截 120 字。 */
function toolSummary(name: string, args: string, result: string | null): string {
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>
    for (const key of ['command', 'path', 'file_path', 'query', 'url']) {
      const v = parsed[key]
      if (typeof v === 'string' && v !== '') return v.slice(0, 120)
    }
  } catch { /* 原样 */ }
  if (result !== null && result !== '') return result.replace(/\s+/g, ' ').slice(0, 120)
  return args === '' ? name : args.slice(0, 120)
}

export interface SerializeInput {
  items: readonly TimelineItem[]
  hasMore: boolean
  running: boolean
  streaming: SessionView['streaming']
  agentName: string
  /** sendPrompt 的 clientNonce 补记到第一个 send-message（ack 上游乐观条目）。 */
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
        const entry: RawEntry = { kind: 'send-message', id: e.id, timestampMs: ts(at), message: { type: 'text', content: e.text } }
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
    raw.push({ kind: 'message', id: 'live-stream', timestampMs: Date.now(), role: 'assistant', author: agentName, content: streaming.text, isStreaming: true })
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
