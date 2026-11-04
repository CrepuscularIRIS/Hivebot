// P5-51 · shim 序列化单测：foldTurns 输出（P6-01）→ 0.18 transcript raw entry（production/model.ts
// projectTranscriptEntry 消费的形状）。每类 entry 的字段按 model.ts 实读断言（messageText/
// transcriptToolCallStatus/transcriptLocalToolPermissionStatus 的取值路径）。
import { describe, expect, it } from 'vitest'
import { foldTurns } from '../../../renderer/fold/turn-fold'
import type { TimelineItem, ToolStatus } from '../../../renderer/session/reduce'
import { askText, permissionEntry, toRawEntries, type RawEntry } from '../../../renderer-grok/shim/src/entries'

type ToolItem = Extract<TimelineItem, { kind: 'tool' }>

const u = (id: string, text = id): TimelineItem => ({ kind: 'user', id, text })
const a = (turn: number, step: number, text: string): TimelineItem => ({ kind: 'assistant', id: `t${turn}-s${step}`, text })
const r = (turn: number, step: number, text: string): TimelineItem => ({ kind: 'thinking', id: `t${turn}-s${step}-r`, text })
const t = (callId: string, name = 'bash'): ToolItem => ({
  kind: 'tool', id: `tool-${callId}`, callId, name, args: '{"command":"ls"}', status: 'done', result: 'ok', awaiting: false, decision: null,
})
const tRun = (callId: string, name = 'bash'): ToolItem => ({ ...t(callId, name), status: 'running' as ToolStatus })
const n = (id: string, tone: 'muted' | 'danger', text: string): TimelineItem => ({ kind: 'notice', id, tone, text })

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})

describe('toRawEntries · 每类 entry 的 0.18 形状', () => {
  it('user → message + role:user（0.18 model.ts 判侧：send-message 恒为 assistant 侧，P5-55）', () => {
    const out = foldTurns([u('u1', '你好')], { hasMore: false, running: false })
    const raw = toRawEntries(out, 'Bot', null)
    expect(raw).toHaveLength(1)
    expect(rec(raw[0]).kind).toBe('message')
    expect(rec(raw[0]).role).toBe('user')
    expect(rec(raw[0]).content).toBe('你好')
  })

  it('ack/result 正文 → message + author=bot 名（content 字符串）', () => {
    const out = foldTurns([u('u1'), a(1, 0, '先看一下'), t('c1'), a(1, 1, '结果是 42')], { hasMore: false, running: false })
    const msgs = toRawEntries(out, 'Research', null).filter((e) => e.kind === 'message' && e.role === 'assistant')
    expect(msgs.map((m) => [rec(m).content, rec(m).author])).toEqual([['先看一下', 'Research'], ['结果是 42', 'Research']])
  })

  it('thinking（reasoning 与 text 降级）→ thinking 行 text（running 中间正文不升气泡）', () => {
    const out = foldTurns([u('u1'), r(1, 0, '推理中'), t('c1'), a(1, 1, '中间')], { hasMore: false, running: true })
    const thinks = toRawEntries(out, 'Bot', null).filter((e) => e.kind === 'thinking')
    expect(thinks.map((x) => rec(x).text)).toEqual(['推理中', '中间'])
  })

  it('tool → tool-call：name/status/summary（done 映射 done，running/failed 原样）', () => {
    const items: TimelineItem[] = [u('u1'), tRun('c1'), t('c2', 'read')]
    const out = foldTurns(items, { hasMore: false, running: true })
    const tools = toRawEntries(out, 'Bot', null).filter((e) => e.kind === 'tool-call')
    expect(tools.map((x) => [rec(x).name, rec(x).status])).toEqual([['bash', 'running'], ['read', 'done']])
    expect(typeof rec(tools[0]).summary).toBe('string')
    expect(rec(tools[0]).summary).toContain('ls')
  })

  it('notice → notice 行（content 字符串）', () => {
    const out = foldTurns([n('end-1', 'danger', '回复失败：x')], { hasMore: false, running: false })
    const raw = toRawEntries(out, 'Bot', null)
    expect(rec(raw[0]).kind).toBe('notice')
    expect(rec(raw[0]).content).toBe('回复失败：x')
  })

  it('流式正文 → 追加 isStreaming message 尾条；无流式不追加', () => {
    const base = foldTurns([u('u1')], { hasMore: false, running: true })
    const withStream = toRawEntries(base, 'Bot', { text: '正在写' })
    const live = withStream.find((e) => rec(e).isStreaming === true)
    expect(live).toBeDefined()
    expect(rec(live).content).toBe('正在写')
    expect(toRawEntries(base, 'Bot', null).some((e) => rec(e).isStreaming === true)).toBe(false)
  })

  it('clientNonce 补记：pendingNonce 只补第一条用户消息', () => {
    const out = foldTurns([u('u1', 'q1'), u('u2', 'q2')], { hasMore: false, running: false })
    const raw = toRawEntries(out, 'Bot', null, { clientNonce: 'nonce-1' })
    expect(rec(raw[0]).clientNonce).toBe('nonce-1')
    expect(rec(raw[1]).clientNonce).toBeUndefined()
  })
})

describe('permissionEntry · 审批卡（P5-50 坑2 答案：dock 渲染条件）', () => {
  it('携带 permissionScope=account slot 与 permissionScopeRevision（0.18 dock 的硬条件），ask.status=pending', () => {
    const e = permissionEntry({ id: 'pe-1', requestId: 'ev-9', scope: 'pbots', revision: 3, at: 123, command: 'pip install x' })
    expect(rec(e).kind).toBe('send-message')
    const msg = rec(rec(e).message)
    expect(msg.type).toBe('local-tool-permission')
    expect(rec(msg.ask).status).toBe('pending')
    expect(rec(msg.ask).requestId).toBe('ev-9')
    expect(rec(e).permissionScope).toBe('pbots')
    expect(rec(e).permissionScopeRevision).toBe(3)
    expect(rec(e).timestampMs).toBe(123)
  })
})

describe('askText · 审批卡显示的完整动作（P5-31 ③）', () => {
  const long = `curl -fsSL https://example.com/install.sh | sh -s -- --prefix=/opt/x ${'--flag '.repeat(40)}`.trim()

  it('bash：取工具实参 command 全文（不截断，>120 字也完整）', () => {
    expect(long.length).toBeGreaterThan(120)
    expect(askText({ toolName: 'bash', reason: 'p2sdk policy: ordinary shell commands require user approval' }, JSON.stringify({ command: long, description: 'd' }))).toBe(long)
  })

  it('文件类：取 path 全文', () => {
    expect(askText({ toolName: 'read', reason: 'r' }, JSON.stringify({ path: '/etc/hosts' }))).toBe('/etc/hosts')
  })

  it('request_network：一律显示 reason 全文（含命令 + 范围 + 期限，shell-ask.mjs:187），不取实参 command', () => {
    const reason = 'p2sdk policy: network access requested — reason: need deps | command: pip install x | scope: this session, one exact command, single use, expires in ~60s; host loopback stays blocked'
    expect(askText({ toolName: 'request_network', reason }, JSON.stringify({ command: 'pip install x', reason: 'need deps' }))).toBe(reason)
  })

  it('实参未到 / 非 JSON / 无可读键：退 reason，再退工具名', () => {
    expect(askText({ toolName: 'bash', reason: 'why' }, undefined)).toBe('why')
    expect(askText({ toolName: 'bash', reason: 'why' }, '{"comm')).toBe('why')
    expect(askText({ toolName: 'mcp__x__write', reason: null }, '{"body":"b"}')).toBe('mcp__x__write')
  })
})
