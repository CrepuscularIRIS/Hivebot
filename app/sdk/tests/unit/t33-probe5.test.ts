// T33 探针⑤：p2fake 真 subagent 调用——helper 的 header 判别 + list 形态
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const ROOT = new URL('../../', import.meta.url).pathname
const home = tmkdir('bot-t33p5-')
const dataDir = join(home, 'data')
const overlay = join(home, 'fake.yml')
mkdirSync(dataDir)
mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })
writeFileSync(overlay, `
- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: '${pathToFileURL(join(ROOT, 'tests/support/fake/plugin.mjs')).href}'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: p2fake
                contextWindow: 131072
    - id: t33-probe5
      name: '${pathToFileURL('/tmp/t33-probe5.mjs').href}'
`)
let rt: Runtime
beforeAll(async () => {
  process.env.HOME = tmkdir('bot-t33p5-home-')
  writeFileSync(join(dataDir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: '', bots: {} }))
  rt = await launchRuntime({ env: { P2SDK_HOME: home, P2SDK_ORCH_DATA_DIR: dataDir, P2SDK_PATCH: overlay } })
})
afterAll(async () => { await rt?.stop() })

it('p2fake subagent 真调用：helper header + list 形态', { timeout: 180_000 }, async () => {
  const { sessionId } = await rt.client.call('session/create', { request: {} }) as { sessionId: string }
  await rt.client.call('session/rename', { request: { sessionId, title: 'Host-T33' } })
  const subArgs = JSON.stringify({ description: 'T33 probe helper', prompt: 'say ok' })
  writeFileSync(join(home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls: [
    { chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id: 't33p5-sub', name: 'subagent', argumentsDelta: subArgs.slice(0, 5) },
      { type: 'tool-call-delta', index: 0, id: 't33p5-sub', name: 'subagent', argumentsDelta: subArgs.slice(5) },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id: 't33p5-sub', name: 'subagent', arguments: subArgs } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ] },
    { chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'sub done' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'sub done' } },
      { type: 'finish', reason: { kind: 'stop' } },
    ] },
  ] }))
  const { stream } = await rt.client.follow(sessionId, { awaitSnapshot: true })
  const events: Array<{ type: string, data?: unknown }> = []
  let finish!: () => void
  const ended = new Promise<void>((r) => { finish = r })
  const drain = (async () => { for await (const f of stream) { const e = (f as { event?: { type: string, data?: unknown } }).event; if (e) { events.push(e); if (e.type === 'turn/end') finish() } } })()
  await rt.client.call('session/prompt', { request: { requestId: `t33p5-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'run helper' }] } })
  await Promise.race([ended, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('turn timeout')), 120_000))])
  stream.cancel(); void drain
  const tools = events.filter((e) => e.type === 'tool/result')
  console.log('[T33P5-RESULT] toolResults=', JSON.stringify(tools.map((e) => (e.data as { message?: { isError?: boolean, content?: Array<{ text?: string }> } }).message).slice(0, 2)).slice(0, 400))
  await new Promise((r) => setTimeout(r, 2000))
  console.log('[T33P5-STDERR]\n' + rt.readStderr().split('\n').filter((l) => l.includes('T33P5')).join('\n'))
  expect(true).toBe(true)
})
