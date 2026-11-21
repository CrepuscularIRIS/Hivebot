// T-06 acceptance ③ (PLAN p2-sdk T-06 / D5 断线重连, D-iface-r1.md:19 contract):
// close the mux socket -> the operator's cookie is rejected (dsh-api.md:84,
// rpc-host disposes the live Peer on socket release) -> while disconnected a
// second operator persists turn 2 -> a fresh /connect + re-follow opens with a
// snapshot whose records cover the missed durable events and whose cursor
// moved past the pre-disconnect cursor. Transient assistant chunks are NOT
// asserted to replay: only durable records + cursor are the reconnect contract.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { rpc } from '../../examples/lib/mux.mjs'
import {
  createSession,
  launchFakeRuntime,
  PIECES_A,
  PIECES_B,
  PROMPT_A,
  PROMPT_B,
  sendPrompt,
  waitForDelta,
  waitForTurnEnd,
  type Frame,
} from '../support/fake/harness.ts'

interface WireEvent {
  type: string
  seq: number
  // user/message flattens the message onto data (content/id/role/source);
  // assistant/message nests it under data.message.
  data: {
    reason?: { kind?: string }
    content?: Array<{ type: string; text?: string }>
    source?: { kind?: string }
    message?: { content?: Array<{ type: string; text?: string }> }
  }
}
type Records = Array<{ type: string; event: WireEvent }>
interface EventsPage { records: Records; hasMore: boolean; cursor: number }

const recordText = (m?: { content?: Array<{ type: string; text?: string }> }): string =>
  (m?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')

const realUserTexts = (records: Records): string[] =>
  records
    .filter((r) => r.event.type === 'user/message' && r.event.data.source?.kind === 'user')
    .map((r) => recordText(r.event.data))

const assistantTexts = (records: Records): string[] =>
  records.filter((r) => r.event.type === 'assistant/message').map((r) => recordText(r.event.data.message))

const turnEndReasons = (records: Records): string[] =>
  records.filter((r) => r.event.type === 'turn/end').map((r) => r.event.data.reason?.kind ?? '')

async function eventsOf(client: DshClient, sessionId: string): Promise<EventsPage> {
  return (await client.call('session/events', {
    request: { address: { kind: 'session', sessionId }, maxMessages: 200 },
  })) as EventsPage
}

/** Scripted model call (chunk vocabulary copied from harness.ts scriptedCall, upstream mock-adapter). */
function scriptedCall(pieces: string[]): object {
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      ...pieces.map((text) => ({ type: 'text-delta', index: 0, text })),
      { type: 'block-end', index: 0, block: { type: 'text', text: pieces.join('') } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: pieces.length } },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
    paceMs: 10,
  }
}

/** Poll until the old cookie's HTTP calls are rejected; any other outcome fails. */
async function waitForCookieRejection(baseUrl: string, cookie: string): Promise<void> {
  const deadline = Date.now() + 5_000
  for (;;) {
    try {
      await rpc(baseUrl, cookie, 'session/list', { _request: {} })
    } catch (err) {
      expect(String(err)).toMatch(/HTTP 401/)
      return
    }
    if (Date.now() >= deadline) throw new Error('old cookie still accepted 5s after the mux socket closed')
    await new Promise((r) => setTimeout(r, 100))
  }
}

it('③ mux reconnect: old cookie rejected after socket close; re-/connect + re-follow catch up via snapshot/cursor', async () => {
  const rt = await launchFakeRuntime()
  try {
    const sid = await createSession(rt.client, rt.home)
    // Two scripted turns: turn 1 before the disconnect, turn 2 during it.
    mkdirSync(join(rt.home, 'fake', 'scripts'), { recursive: true })
    writeFileSync(join(rt.home, 'fake', 'scripts', `${sid}.json`), JSON.stringify({ calls: [scriptedCall(PIECES_A), scriptedCall(PIECES_B)] }))

    // Turn 1 through operator A, then pin the durable cursor before dropping.
    const stream1 = await rt.client.follow(sid)
    const frames1: Frame[] = []
    const drained1 = (async () => { for await (const f of stream1) frames1.push(f) })()
    await sendPrompt(rt.client, sid, PROMPT_A)
    await waitForDelta(frames1, PIECES_A[0], 15_000)
    await waitForTurnEnd(frames1, 15_000)
    const page1 = await eventsOf(rt.client, sid)
    const cursorBefore = page1.cursor
    expect(turnEndReasons(page1.records)).toEqual(['completed'])
    expect(assistantTexts(page1.records)).toContain(PIECES_A.join(''))

    // The disconnect: close the mux socket; the operator's cookie must die with it.
    const cookieA = rt.client.cookie
    rt.client.close()
    await waitForCookieRejection(rt.baseUrl, cookieA)

    // While A is offline, operator B (fresh /connect, same launch token) persists turn 2.
    const b = await connect({ baseUrl: rt.baseUrl, token: rt.token })
    await sendPrompt(b, sid, PROMPT_B)
    let page2: EventsPage | undefined
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      page2 = await eventsOf(b, sid)
      if (turnEndReasons(page2.records).join(',') === 'completed,completed') break
      await new Promise((r) => setTimeout(r, 100))
    }
    expect(turnEndReasons(page2!.records), 'turn 2 completed during the disconnect').toEqual(['completed', 'completed'])
    expect(assistantTexts(page2!.records)).toContain(PIECES_B.join(''))
    b.close()

    // Reconnect: fresh /connect -> new operator -> re-follow. The opening
    // snapshot must cover everything persisted while offline.
    const c = await connect({ baseUrl: rt.baseUrl, token: rt.token })
    const stream3 = await c.follow(sid)
    const iter = stream3[Symbol.asyncIterator]()
    const first = await iter.next()
    const snapshot = first.value as { type: string; cursor: number; hasMore: boolean; records: Records }
    expect(snapshot.type).toBe('snapshot')
    expect(snapshot.cursor, 'cursor moved past the pre-disconnect durable cut').toBeGreaterThan(cursorBefore)
    expect(realUserTexts(snapshot.records)).toContain(PROMPT_B)
    expect(assistantTexts(snapshot.records)).toContain(PIECES_B.join(''))
    expect(turnEndReasons(snapshot.records)).toEqual(['completed', 'completed'])
    // Deliberately NOT asserting transient assistant chunks replay: turn 2's
    // text is required here only through durable records (the reconnect
    // contract is snapshot + cursor, not transient frame replay).
    stream3.cancel()
    c.close()
    stream1.cancel()
    void drained1
  } finally {
    await rt.stop()
  }
}, 120_000)
