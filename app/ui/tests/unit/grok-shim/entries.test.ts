// P5-51 · shim 序列化单测：foldTurns 输出（P6-01）→ 0.18 transcript raw entry（production/model.ts
// projectTranscriptEntry 消费的形状）。每类 entry 的字段按 model.ts 实读断言（messageText/
// transcriptToolCallStatus/transcriptLocalToolPermissionStatus 的取值路径）。
import { describe, expect, it } from 'vitest'
import { foldTurns } from '../../../renderer/fold/turn-fold'
import type { TimelineItem, ToolStatus } from '../../../renderer/session/reduce'
import { askText, permissionEntry, toRawEntries, type RawEntry } from '../../../renderer-grok/shim/src/entries'

type ToolItem = Extract<TimelineItem, { kind: 'tool' }>

const u = (id: string, text = id, rpcId?: string): TimelineItem =>
  rpcId === undefined ? { kind: 'user', id, text } : { kind: 'user', id, text, rpcId }
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

  // P5-W3.f2 R4/O2：nonce 按消息身份（user/message 的 source.rpcId = session/prompt.requestId）
  // 绑定，不再按文本——同文本历史消息证明不了发送身份（f1 验收 FAIL 项）。
  it('clientNonce 绑定：按身份（rpcId）绑到对应消息（L-7 R4 / f2）', () => {
    const out = foldTurns([u('u1', 'q1'), u('u2', 'q2', 'nonce-1')], { hasMore: false, running: false })
    const raw = toRawEntries(out, 'Bot', null, { clientNonce: 'nonce-1' })
    expect(rec(raw[0]).clientNonce).toBeUndefined()
    expect(rec(raw[1]).clientNonce).toBe('nonce-1')
  })

  it('clientNonce 绑定：新消息未落到窗口时不消费（无 rpcId 命中，等下一次快照）', () => {
    const out = foldTurns([u('u1', 'q1')], { hasMore: false, running: false })
    const raw = toRawEntries(out, 'Bot', null, { clientNonce: 'nonce-1' })
    expect(raw.some((e) => rec(e).clientNonce === 'nonce-1')).toBe(false)
  })

  it('clientNonce 绑定：同文本历史消息（无 rpcId 或 rpcId 是旧 nonce）不误绑（f2 R4/O2）', () => {
    for (const old of [u('old-u', 'repeat this'), u('old-u', 'repeat this', 'old-N')]) {
      const out = foldTurns([old], { hasMore: false, running: false })
      const raw = toRawEntries(out, 'Bot', null, { clientNonce: 'new-N' })
      expect(raw.some((e) => rec(e).clientNonce === 'new-N'), '文本相同但身份不同 → 不绑').toBe(false)
    }
  })

  it('clientNonce 绑定：重试场景——wire 换回原 nonce（R5），rpcId=原 nonce 的消息拿回回执', () => {
    const out = foldTurns([u('u1', 'again', 'nonce-1'), a(1, 0, '答')], { hasMore: false, running: false })
    const raw = toRawEntries(out, 'Bot', null, { clientNonce: 'nonce-1' })
    expect(rec(raw[0]).clientNonce).toBe('nonce-1')
  })

  it('tool-call 保留完整 args 与 result（L-7 R2：输出/错误详情不再被序列化丢掉）', () => {
    const items: TimelineItem[] = [u('u1'), { ...t('c1'), result: 'boom: ENOENT' }, t('c2', 'read')]
    const out = foldTurns(items, { hasMore: false, running: false })
    const tools = toRawEntries(out, 'Bot', null).filter((e) => e.kind === 'tool-call')
    expect(rec(tools[0]).result).toBe('boom: ENOENT')
    expect(rec(tools[0]).args).toBe('{"command":"ls"}')
    expect(rec(tools[1]).result).toBe('ok')
    // summary 仍是单行预览（不因带 result 变长）
    expect(String(rec(tools[0]).summary).length).toBeLessThanOrEqual(120)
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

// P6-03：流式落点接 foldTurns.streamingAs——首工具前流式正文 = message（ack 候选）；首工具后 = thinking 行
// （回合进行中气泡 ≤1，BRIEF D1；原实现无视 streamingAs、恒推 live-stream message → 进行中 2 气泡）。
describe('toRawEntries · 流式落点（streamingAs）', () => {
  it('首工具前：live-stream message', () => {
    const out = foldTurns([u('u1')], { hasMore: false, running: true })
    const raw = toRawEntries(out, 'Bot', { text: '收到，' })
    expect(raw.at(-1)).toMatchObject({ id: 'live-stream', kind: 'message', role: 'assistant', content: '收到，' })
  })

  it('首工具后：live-stream 落 thinking 行，气泡仍 ≤1', () => {
    const out = foldTurns([u('u1'), a(1, 0, 'A'), tRun('c1')], { hasMore: false, running: true })
    const raw = toRawEntries(out, 'Bot', { text: '中间 B' })
    expect(raw.at(-1)).toMatchObject({ id: 'live-stream', kind: 'thinking', text: '中间 B' })
    expect(raw.filter((e) => e.kind === 'message' && e.role === 'assistant')).toHaveLength(1)
  })
})

// ---- P6-16：编排条目走 notice 载体 + pbotsPeer（覆盖层 notice-view 渲染；E12 / E19）----
describe('toRawEntries · P6-16 编排条目', () => {
  const tool = (name: string, args: object, status: ToolStatus, result: string | null): TimelineItem =>
    ({ kind: 'tool', id: `tool-${name}`, callId: name, name, args: JSON.stringify(args), status, result, awaiting: false, decision: null })

  it('create_bot / send_to_bot 工具行 → notice（回落文本可读）+ assign 元数据；其他工具照旧 tool-call', () => {
    const items: TimelineItem[] = [
      { kind: 'user', id: 'u1', text: '跑测试' },
      { kind: 'assistant', id: 't1-s0', text: '好的，派给 Test fixer。' },
      tool('create_bot', { name: 'Test fixer', prompt: 'Run tests' }, 'done', '{"sessionId":"w1"}'),
      tool('send_to_bot', { botId: 'w1', prompt: 'again' }, 'failed', 'pbots/busy'),
      tool('bash', { command: 'ls' }, 'done', 'ok'),
    ]
    const raw = toRawEntries(foldTurns(items, { hasMore: false, running: false }), 'Main', null)
    expect(raw.map((e) => e.kind)).toEqual(['message', 'message', 'notice', 'notice', 'tool-call'])
    expect(raw[2]).toMatchObject({ content: 'Messaging Test fixer', pbotsPeer: { kind: 'assign', tool: 'create_bot', workerId: 'w1', status: 'done' } })
    expect(raw[3]).toMatchObject({ content: "Couldn't message another assistant: This worker is busy", pbotsPeer: { kind: 'assign', status: 'failed', workerId: 'w1' } })
  })

  it('回报 / 任务 → notice + report / task 元数据（不是 message，不进用户泳道）', () => {
    const items: TimelineItem[] = [
      { kind: 'report', id: 'pbots-report:k', items: [{ key: 'a:end', kind: 'end', workerId: 'w1', name: 'Test fixer', assignmentId: 'a', outcome: 'error', awaiting: null, eventId: null, result: 'boom' }] },
      { kind: 'task', id: 'pbots-assign:a', text: 'Run tests', fromId: 'm', assignmentId: 'a' },
    ]
    const raw = toRawEntries(foldTurns(items, { hasMore: false, running: false }), 'Main', null)
    expect(raw).toHaveLength(2)
    expect(raw.every((e) => e.kind === 'notice' && e.role === undefined)).toBe(true)
    expect(raw[0]).toMatchObject({ id: 'pbots-report:k', content: 'Test fixer · Failed', pbotsPeer: { kind: 'report' } })
    expect(raw[1]).toMatchObject({ id: 'pbots-assign:a', content: 'From main bot: Run tests', pbotsPeer: { kind: 'task', fromId: 'm', text: 'Run tests' } })
  })
})
