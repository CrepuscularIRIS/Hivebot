// T33 探针格：插件侧 ctx.agents.list() 能否拿到带 title 的名册（工单第一步——拿不到就停）
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const ROOT = new URL('../../', import.meta.url).pathname
const home = tmkdir('bot-t33-probe-')
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
    - id: t33-probe
      name: '${pathToFileURL('/tmp/t33-probe-plugin.mjs').href}'
`)
let rt: Runtime
beforeAll(async () => {
  process.env.HOME = tmkdir('bot-t33-probe-home-')
  rt = await launchRuntime({ env: { P2SDK_HOME: home, P2SDK_ORCH_DATA_DIR: dataDir, P2SDK_PATCH: overlay } })
})
afterAll(async () => { await rt?.stop() })

it('探针：agents 对象形状 + rename 后 title 是否可见', { timeout: 120_000 }, async () => {
  const { sessionId } = await rt.client.call('session/create', { request: {} }) as { sessionId: string }
  await rt.client.call('session/rename', { request: { sessionId, title: 'Bravo-T33' } }) as { ok: boolean }
  writeFileSync(join(home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls: [{ chunks: [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: 'hi' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'hi' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ] }] }))
  await rt.client.call('session/prompt', { request: { requestId: `t33-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'x' }] } })
  await new Promise((r) => setTimeout(r, 3000)); await rt.client.call('session/rename', { request: { sessionId, title: 'Renamed-T33' } }); await new Promise((r) => setTimeout(r, 1500))
  console.log('[T33-PROBE-STDERR]\n' + rt.readStderr().split('\n').filter((l) => l.includes('T33-PROBE')).join('\n'))
  expect(true).toBe(true)
})
