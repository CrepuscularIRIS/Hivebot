import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerRoutingPrompt, ROUTING_PROMPT, ROUTING_SECTION } from '../../src/orchestration/routing-prompt.mjs'
import { tmkdir } from '../support/tmp-sweep.ts'

const require = createRequire(realpathSync(new URL('../../node_modules/@deepseek-ai/dsh-plugin-market/lib/index.js', import.meta.url)))
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
const { default: SystemPrompt, renderPrompt } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-system-prompt')).href)
const { createScope, scopeOf } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-scope')).href)

// Missing registration, fail-open identity, stale authority, or global scoping must fail here.
describe('orchestration routing section on installed SystemPrompt', () => {
  let ctx: any // Installed peer packages are resolved dynamically to preserve the runtime instance.
  let dir: string
  let agents: Array<{ id: string, ctx: any }>
  let listeners: Map<string, Function>
  let dispose: () => void
  const meta = (value: unknown) => writeFileSync(join(dir, 'bots.json'), JSON.stringify(value))
  const prompt = async (agent?: { ctx: any }) => renderPrompt(await ctx.systemPrompt.assemble(agent ? { scope: scopeOf(agent.ctx) } : {}))

  beforeEach(async () => {
    dir = tmkdir('bot-p622-routing-')
    ctx = new Context()
    await ctx.plugin(SystemPrompt, {})
    agents = []
    await ctx.plugin(Object.assign((inner: any) => {
      for (const id of ['main', 'worker', 'ordinary']) agents.push({ id, ctx: createScope(inner, { name: id }).ctx })
    }, { inject: ['systemPrompt'] }))
    listeners = new Map()
    dispose = registerRoutingPrompt({
      agents: { list: () => agents },
      on: (name: string, fn: Function) => { listeners.set(name, fn); return () => listeners.delete(name) },
    }, { config: { dataDir: dir } })
    meta({ version: 1, mainBotId: 'main', bots: { worker: { createdBy: 'main' } } })
  })

  afterEach(async () => {
    dispose?.()
    await ctx?.fiber.dispose()
    rmSync(dir, { recursive: true, force: true })
  })

  it('renders the entire section only for the authoritative main bot, not worker, ordinary or unscoped', async () => {
    expect(await prompt(agents[0])).toContain(ROUTING_PROMPT)
    for (const agent of [agents[1], agents[2], undefined]) expect(await prompt(agent)).not.toContain('## Coordinating workers')
    expect(ROUTING_SECTION).toBe('pbots:orchestration-routing')
    expect(createHash('sha256').update(ROUTING_PROMPT).digest('hex')).toBe('5b2386805baae62b4fcc0c17af1a3052d7450860dfc12f2bd060a74bb40ccdd5')
    expect(ROUTING_PROMPT).toMatch(/^You are the main bot:/)
    expect(ROUTING_PROMPT).not.toMatch(/\b(quick|simple|small)\b/i)
    expect(ROUTING_PROMPT).toContain('write, edit, or bash')
    expect(ROUTING_PROMPT).toContain('only one file')
    expect(ROUTING_PROMPT).toContain('only one or two tool calls')
    expect(ROUTING_PROMPT).toContain('subagent')
    expect(ROUTING_PROMPT).toContain('Workers')
  })

  it.each([
    null,
    [],
    { version: 2, mainBotId: 'main' },
    { version: 1 },
    { version: 1, mainBotId: '' },
    { version: 1, mainBotId: 'main', bots: null },
    { version: 1, mainBotId: 'main', bots: [] },
    { version: 1, mainBotId: 'main', bots: 'broken' },
    { version: 1, mainBotId: 'main', bots: { main: { createdBy: 'other-main' } } },
  ].map((value) => [value]))('fails closed for unknown or conflicting identity %j', async (value) => {
    meta(value)
    for (const agent of agents) expect(await prompt(agent)).not.toContain(ROUTING_PROMPT)
  })

  it('revokes the old main on the next assembly after main reassignment', async () => {
    expect(await prompt(agents[0])).toContain(ROUTING_PROMPT)
    meta({ version: 1, mainBotId: 'ordinary', bots: { worker: { createdBy: 'main' } } })
    expect(await prompt(agents[0])).not.toContain(ROUTING_PROMPT)
    expect(await prompt(agents[2])).toContain(ROUTING_PROMPT)
    writeFileSync(join(dir, 'bots.json'), '{')
    expect(await prompt(agents[2])).not.toContain(ROUTING_PROMPT)
    rmSync(join(dir, 'bots.json'))
    expect(await prompt(agents[2])).not.toContain(ROUTING_PROMPT)
  })

  it('handles valid zero-worker metadata and reads authority anew after recovery', async () => {
    rmSync(join(dir, 'bots.json'))
    expect(await prompt(agents[0])).not.toContain(ROUTING_PROMPT)
    meta({ version: 1, mainBotId: 'main' })
    expect(await prompt(agents[0])).toContain(ROUTING_PROMPT)
  })

  it('registers newly created agents, avoids duplicates and removes scoped registrations on disposal', async () => {
    await ctx.plugin(Object.assign((inner: any) => {
      agents.push({ id: 'late', ctx: createScope(inner, { name: 'late' }).ctx })
    }, { inject: ['systemPrompt'] }))
    const late = agents[3]
    listeners.get('agent/created')!({ agent: late })
    listeners.get('agent/created')!({ agent: late })
    meta({ version: 1, mainBotId: 'late' })
    expect(await prompt(late)).toContain(ROUTING_PROMPT)
    listeners.get('agent/disposed')!({ agent: late })
    expect(await prompt(late)).not.toContain(ROUTING_PROMPT)
    meta({ version: 1, mainBotId: 'main' })
    expect(await prompt(agents[0])).toContain(ROUTING_PROMPT)
    listeners.get('dispose')!()
    expect(await prompt(agents[0])).not.toContain(ROUTING_PROMPT)
    expect(listeners.size).toBe(0)
  })
})


// T37：文案不含旧叫法——worker 不叫 bot；subagent 不再说「看不见」（ROUTING_PROMPT 已于文件头导入）
import { CREATE_BOT_DESCRIPTION } from '../../src/orchestration/create.mjs'
import { SEND_TO_BOT_DESCRIPTION } from '../../src/orchestration/send.mjs'
import { STOP_BOT_DESCRIPTION } from '../../src/orchestration/stop.mjs'
describe('T37 术语', () => {
  it('四个描述均不含 worker bot / Workers bot / that bot / not visible（T37b 扩）', () => {
    const all = [ROUTING_PROMPT, CREATE_BOT_DESCRIPTION, SEND_TO_BOT_DESCRIPTION, STOP_BOT_DESCRIPTION].join(' ')
    for (const bad of ['worker bot', 'Workers bot', 'that bot', 'not visible']) {
      expect(all, `不得含 "${bad}"`).not.toContain(bad)
    }
  })
})
