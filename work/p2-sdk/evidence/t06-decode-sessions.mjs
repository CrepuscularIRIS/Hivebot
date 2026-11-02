// T-06 verify: decode dsh session files (zstd jsonl) left on disk by the test run.
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
const files = process.argv.slice(2)
for (const f of files) {
  const raw = zstdDecompressSync(readFileSync(f))
  const text = raw.toString('utf8')
  const lines = text.split('\n').filter(Boolean)
  const events = []
  for (const line of lines) {
    let v
    try { v = JSON.parse(line) } catch { continue }
    // tolerate header/record wrappers
    const ev = v.event ?? v
    if (ev && typeof ev.type === 'string') events.push(ev)
  }
  const kinds = events.map((e) => e.type)
  const turnEnds = events.filter((e) => e.type === 'turn/end').map((e) => e.data?.reason?.kind ?? e.data?.turnEnd?.kind ?? '?')
  const userTexts = events.filter((e) => e.type === 'user/message' && e.data?.source?.kind === 'user').map((e) => (e.data?.content ?? []).map((b) => b.text ?? '').join(''))
  const asstTexts = events.filter((e) => e.type === 'assistant/message').map((e) => (e.data?.message?.content ?? []).map((b) => b.text ?? '').join(''))
  console.log(JSON.stringify({ file: f.split('/').slice(-2).join('/'), lines: lines.length, turnEnds, userTexts, asstTexts }))
}
