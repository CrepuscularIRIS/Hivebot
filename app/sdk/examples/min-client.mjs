// D2 demo client (T-01 acceptance ④): connect to the running p2sdk runtime,
// create one session, send one prompt, and self-assert that at least one
// assistant chunk arrives before turn end and that turn end arrives.
// Exit code 0 only when both assertions hold.
//
// Run (G2-r2 wording): pnpm -C app/sdk exec node examples/min-client.mjs "你好"
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, snapshotFrames } from './lib/client.mjs'

// T-01.f3 R1: credentials live in the operator-side handoff dir, which never
// enters the dsh runtime environment; the session cwd is an independent
// mkdtemp work dir, never under P2SDK_HOME/DSH_HOME.
// T-12 R1: the launcher's default handoff dir is a fresh random tmpdir printed
// on stderr as `p2sdk: handoff <dir>` — export it as P2SDK_HANDOFF here, or
// pass P2SDK_BASE_URL + P2SDK_LAUNCH_TOKEN directly.
const handoff = process.env.P2SDK_HANDOFF
if (!handoff && !process.env.P2SDK_BASE_URL && !process.env.P2SDK_LAUNCH_TOKEN) {
  console.error('min-client: no credentials source. Export P2SDK_HANDOFF to the dir the launcher printed as "p2sdk: handoff <dir>", or export P2SDK_BASE_URL and P2SDK_LAUNCH_TOKEN.')
  process.exit(1)
}
const baseUrl = process.env.P2SDK_BASE_URL ?? readFileSync(join(handoff, 'base-url'), 'utf8').trim()
const token = process.env.P2SDK_LAUNCH_TOKEN ?? readFileSync(join(handoff, 'launch-token'), 'utf8').trim()
const prompt = process.argv[2] ?? '你好'

const client = await connect({ baseUrl, token })
const work = mkdtempSync(join(tmpdir(), 'p2sdk-work-'))
const { sessionId } = await client.call('session/create', { request: { cwd: work } })
console.log(`session ${sessionId}`)

const frames = []
// R6 barrier: wait for the opening snapshot (the follow subscription is only
// established once the server built it) before sending the prompt, and fold
// the snapshot baseline into the frame statistics.
const { stream, snapshot } = await client.follow(sessionId, { assistantStream: true, awaitSnapshot: true })
frames.push(...snapshotFrames(snapshot))
const turnEnded = (async () => {
  for await (const frame of stream) {
    frames.push(frame)
    if (frame.type === 'event' && frame.event?.type === 'turn/end') return true
  }
  return false
})()

// Queue-mode prompt; requestId is client-minted per protocol.
const requestId = `p2sdk-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
await client.call('session/prompt', {
  request: {
    requestId,
    sessionId,
    mode: 'queue',
    content: [{ type: 'text', text: prompt }],
  },
})

const sawTurnEnd = await turnEnded
stream.cancel()
client.close()

const chunks = frames.filter((f) => f.type === 'assistant-stream' && f.frame?.type === 'chunk')
const textChunks = chunks.filter((f) => f.frame.chunk?.type === 'text-delta')
const text = textChunks.map((f) => f.frame.chunk.text).join('')
const turnEndFrame = frames.find((f) => f.type === 'event' && f.event?.type === 'turn/end')
const turnEndSeq = frames.indexOf(turnEndFrame)
const firstChunkIdx = frames.findIndex((f) => f.type === 'assistant-stream' && f.frame?.type === 'chunk')
const endReason = turnEndFrame?.event?.data?.reason?.kind

console.log(`assistant chunks: ${chunks.length} text=${JSON.stringify(text)}`)
console.log(`turn end: ${sawTurnEnd} reason=${endReason ?? 'ok'}`)

if (!sawTurnEnd) {
  console.error('min-client FAIL: no turn/end event')
  process.exit(1)
}
if (firstChunkIdx < 0 || firstChunkIdx >= turnEndSeq) {
  console.error('min-client FAIL: no assistant chunk arrived before turn end')
  process.exit(1)
}
if (textChunks.length < 1 || !text) {
  console.error('min-client FAIL: no text-delta chunk arrived (error stream is not a demo pass)')
  process.exit(1)
}
if (endReason === 'error') {
  console.error(`min-client FAIL: turn ended with error: ${JSON.stringify(turnEndFrame.event.data.reason.error?.message ?? {})}`)
  process.exit(1)
}
console.log('min-client PASS')
process.exit(0)
