// Real shipped Loader + orchestration patch; p2fake is scripted, never a real model.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const ROOT = new URL('../../', import.meta.url).pathname
const home = tmkdir('bot-p622-live-')
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
`)
const marker = 'You are the main bot: you talk with the user and hand their hands-on work to workers.'
let rt: Runtime
beforeAll(async () => {
  process.env.HOME = tmkdir('bot-p622-live-home-')
  writeFileSync(join(dataDir, 'bots.json'), JSON.stringify({ version: 1 }))
  rt = await launchRuntime({ env: {
    P2SDK_HOME: home,
    P2SDK_ORCH_DATA_DIR: dataDir,
    P2SDK_PATCH: `${join(ROOT, 'profile/patches/orchestration.yml')}:${overlay}`,
  } })
})
afterAll(async () => { await rt?.stop() })

async function newSession(): Promise<string> {
  const { sessionId } = await rt.client.call('session/create', { request: {} }) as { sessionId: string }
  // Fake cursors are per session: prewrite every turn instead of overwriting a consumed script.
  writeFileSync(join(home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls: Array.from({ length: 3 }, () => ({ chunks: [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: 'scripted reply' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'scripted reply' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ] })) }))
  return sessionId
}

async function systemText(sessionId: string): Promise<string> {
  const { stream } = await rt.client.follow(sessionId, { awaitSnapshot: true })
  const events: Array<{ type: string, data?: unknown }> = []
  let finish!: () => void
  const ended = new Promise<void>((resolve) => { finish = resolve })
  const drain = (async () => {
    for await (const frame of stream) {
      const event = (frame as { event?: { type: string, data?: unknown } }).event
      if (!event) continue
      events.push(event)
      if (event.type === 'turn/end') finish()
    }
  })()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await rt.client.call('session/prompt', { request: {
      requestId: `p622-${sessionId}-${Date.now()}`,
      sessionId, mode: 'queue', content: [{ type: 'text', text: 'routing smoke, scripted response' }],
    } })
    await Promise.race([ended, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('p622 fake turn did not end')), 60_000)
    })])
    const systems = events.filter((event) => event.type === 'system/message')
    expect(systems.length).toBeGreaterThan(0)
    return JSON.stringify(systems)
  } finally {
    clearTimeout(timer)
    stream.cancel()
    await drain
  }
}

it('records routing in main system/message only; worker, ordinary, unknown and old-main next step exclude it', async () => {
  const main = await newSession()
  const worker = await newSession()
  const ordinary = await newSession()
  const metadata = { version: 1, mainBotId: main, bots: { [worker]: { createdBy: main } } }
  writeFileSync(join(dataDir, 'bots.json'), JSON.stringify(metadata))
  expect(await systemText(main)).toContain(marker)
  expect(await systemText(worker)).not.toContain(marker)
  expect(await systemText(ordinary)).not.toContain(marker)
  writeFileSync(join(dataDir, 'bots.json'), JSON.stringify({ ...metadata, mainBotId: ordinary }))
  expect(await systemText(main)).not.toContain(marker)
  expect(await systemText(ordinary)).toContain(marker)
  writeFileSync(join(dataDir, 'bots.json'), '{')
  expect(await systemText(ordinary)).not.toContain(marker)
}, 180_000)
