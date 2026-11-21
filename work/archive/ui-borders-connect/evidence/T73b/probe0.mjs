// T73b 第 0 步：真链路打印 shell-ask 管线里的 exec——name 是否 mcp__<serverName>__*、
// header.id 是否建会话的 sessionId。fake overlay 脚本一次 toolCall；出卡无需作答
// （探针只要 tools/pre-execute 先到——ask 挂起不影响 exec 已落盘）。
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const { launchRuntime } = await import('/home/lingxufeng/bot/app/sdk/tests/support/runtime.ts')

const PKG = '/home/lingxufeng/bot/app/sdk'
const OBS = '/home/lingxufeng/bot/work/ui-borders-connect/evidence/T73b/exec-obs.jsonl'

const toolCall = (name, args) => {
  const id = `t73b-${Math.random().toString(16).slice(2, 8)}`
  const a = JSON.stringify(args)
  return { chunks: [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: a.slice(0, 5) },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: a.slice(5) },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: a } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ], paceMs: 10 }
}

// launchRuntime(opts.env) 是 runtime child 的额外 env——patch 必须启动时带上，所以一次性带全。
const dir = join(tmpdir(), `t73b-patch-${Date.now()}`)
mkdirSync(dir, { recursive: true })
const overlay = join(dir, 'fake-llm.yml')
writeFileSync(overlay, `\
- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: '${pathToFileURL(join(PKG, 'tests', 'support', 'fake', 'plugin.mjs')).href}'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: p2fake
                contextWindow: 131072
`)
const obsPatch = join(dir, 'observer.yml')
writeFileSync(obsPatch, `\
- insert:
    - id: t73b-observer
      name: '${pathToFileURL('/home/lingxufeng/bot/work/ui-borders-connect/evidence/T73b/observer.mjs').href}'
`)

const rt = await launchRuntime({ env: { P2SDK_OBS: OBS, P2SDK_PATCH: `${overlay}:${obsPatch}` } })
try {
  const mem = await rt.client.call('pluginManager/installBundle', { spec: '@modelcontextprotocol/server-memory@2.1.1', options: { enabled: true } })
  console.log(JSON.stringify({ step: 'install', application: mem?.application ?? null }))
  const cwd = join(rt.home, 'workspace')
  const { sessionId } = await rt.client.call('session/create', { request: { cwd } })
  console.log(JSON.stringify({ step: 'session', sessionId }))
  const tool = 'mcp__server-memory-30e6e77d__create_entities'
  mkdirSync(join(rt.home, 'fake', 'scripts'), { recursive: true })
  writeFileSync(join(rt.home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls: [
    toolCall(tool, { entities: [{ name: 't73b-probe', entityType: 'test', observations: [] }] }),
  ] }))
  const stream = await rt.client.follow(sessionId, { assistantStream: true })
  const frames = []
  void (async () => { for await (const f of stream) frames.push(f) })()
  await rt.client.call('session/prompt', { request: { requestId: `t73b-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: '记住一条' }] } })
  await new Promise((r) => setTimeout(r, 30_000)) // ask 挂起无妨——exec 在卡前已落盘
  stream.cancel()
  const kinds = {}
  for (const f of frames) { const k = f.type + (f.event?.type ? ':' + f.event.type : '') + (f.event?.event ? ':' + f.event.event : ''); kinds[k] = (kinds[k] ?? 0) + 1 }
  console.log('frames:', JSON.stringify(kinds))
  const errs = frames.filter((f) => JSON.stringify(f).match(/error|Error/i)).slice(0, 2)
  console.log('err-frames:', JSON.stringify(errs).slice(0, 500))
} catch (e) {
  console.log(JSON.stringify({ step: 'fatal', error: String(e).slice(0, 300) }))
} finally {
  await rt.stop()
}
