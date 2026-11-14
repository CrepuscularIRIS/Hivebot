// T81a：supersede（发消息即顶掉运行中 turn）。上游原语配方：session/cancel（turn 级，
// 半截 interruptedBlocks 保留、pending inbox 不丢）+ 紧跟 queue prompt。
// 先红材料（探针轮记录，见回执）：queue 直发=第二条排队干等（gate 挂起时 8s 无 turn/end）。
import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchFakeRuntime, sendPrompt, type FakeRuntime } from '../support/fake/harness.ts'
import { snapshotFrames, type Frame } from '../../examples/lib/client.mjs'

interface TurnEnd { type: string; data: unknown }

const runSupersede = async (rt: FakeRuntime) => {
  const work = join(rt.home, 'workspace')
  mkdirSync(work, { recursive: true })
  const { sessionId } = await rt.client.call('session/create', { request: { cwd: work } }) as { sessionId: string }
  const dir = join(rt.home, 'fake', 'scripts')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls: [
    { chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: '第一段长回复开头' },
      { type: 'text-delta', index: 0, text: '第一段长回复后半' },
      { type: 'block-end', index: 0, block: { type: 'text', text: '第一段长回复完整' } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ], gateAfterChunk: 1, gateId: 'g1', paceMs: 50 },
    { chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: '第二条的回复' },
      { type: 'block-end', index: 0, block: { type: 'text', text: '第二条的回复' } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 3 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ], paceMs: 10 },
  ] }))
  const { stream, snapshot } = await rt.client.follow(sessionId, { assistantStream: true, awaitSnapshot: true })
  const frames: Frame[] = [...snapshotFrames(snapshot)]
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  await sendPrompt(rt.client, sessionId, '第一条问题')
  await new Promise((r) => setTimeout(r, 1_500)) // gate 挂起：turn1 流出首块后停在 gate
  // T81a 配方
  await rt.client.call('session/cancel', { request: { sessionId } })
  await new Promise((r) => setTimeout(r, 300))
  await sendPrompt(rt.client, sessionId, '第二条问题')
  await new Promise((r) => setTimeout(r, 4_000))
  stream.cancel(); void drained
  const events = frames.filter((f) => f.type === 'event').map((f) => (f as { event?: { type?: string; data?: unknown } }).event)
  const texts = frames.filter((f) => f.type === 'assistant-stream' && f.frame?.chunk?.type === 'text-delta').map((f) => (f.frame as { chunk: { text: string } }).chunk.text).join('')
  return { sessionId, events, texts }
}

describe('T81a supersede（cancel+queue 配方）', () => {
  it('① 运行中 cancel+新消息：旧 turn aborted-by-user、半截保留、新 turn 即刻接续', { timeout: 60_000 }, async () => {
    const rt = await launchFakeRuntime()
    try {
      const { events, texts } = await runSupersede(rt)
      const turnEnds = events.filter((e) => e?.type === 'turn/end') as Array<{ data?: { turn?: number; reason?: { kind?: string; reason?: { kind?: string } } } }>
      expect(turnEnds.length, '两个 turn 都结束').toBeGreaterThanOrEqual(2)
      const t1 = turnEnds[0].data
      expect(t1?.reason?.kind, '旧 turn=aborted').toBe('aborted')
      expect(t1?.reason?.reason?.kind, '打断了 active turn（user）').toBe('user')
      // 半截保留：assistant/message 落盘只有首块文本（gate 后的块没流出）
      const halfMsg = frames_assistant(events)
      expect(halfMsg.some((m) => m.includes('第一段长回复开头') && !m.includes('第一段长回复后半')), '半截文本作为 assistant 消息保留（后块未流出）').toBe(true)
      // 新 turn 跑完且回应第二条
      const t2end = turnEnds.find((e) => e.data?.turn === 2)
      expect(t2end, 'turn2 结束').toBeTruthy()
      expect(texts, '流里含半截与第二条回复').toContain('第一段长回复开头')
      expect(texts).toContain('第二条的回复')
    } finally { await rt.stop() }
  })
  it('② idle cancel 幂等：accepted:true，后续 prompt 正常', { timeout: 60_000 }, async () => {
    const rt = await launchFakeRuntime()
    try {
      const work = join(rt.home, 'workspace')
      mkdirSync(work, { recursive: true })
      const { sessionId } = await rt.client.call('session/create', { request: { cwd: work } }) as { sessionId: string }
      const r = await rt.client.call('session/cancel', { request: { sessionId } }) as { accepted?: boolean }
      expect(r.accepted).toBe(true)
      const dir = join(rt.home, 'fake', 'scripts')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls: [{ chunks: [
        { type: 'block-start', index: 0, blockType: 'text' },
        { type: 'text-delta', index: 0, text: 'idle 后正常回复' },
        { type: 'block-end', index: 0, block: { type: 'text', text: 'idle 后正常回复' } },
        { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } },
        { type: 'finish', reason: { kind: 'stop' } },
      ], paceMs: 10 }] }))
      const { stream, snapshot } = await rt.client.follow(sessionId, { assistantStream: true, awaitSnapshot: true })
      const frames: Frame[] = [...snapshotFrames(snapshot)]
      const drained = (async () => { for await (const f of stream) frames.push(f) })()
      await sendPrompt(rt.client, sessionId, 'idle 后问')
      await new Promise((r2) => setTimeout(r2, 3_000))
      stream.cancel(); void drained
      const text = frames.filter((f) => f.type === 'assistant-stream' && f.frame?.chunk?.type === 'text-delta').map((f) => (f.frame as { chunk: { text: string } }).chunk.text).join('')
      expect(text).toContain('idle 后正常回复')
    } finally { await rt.stop() }
  })
})

function frames_assistant(events: Array<{ type?: string; data?: unknown } | undefined>): string[] {
  return JSON.stringify(events.filter((e) => e?.type === 'assistant/message')).split('"text":"').map((x) => x.split('"')[0])
}
void ({} as TurnEnd)
