// P6-14 worker 安全信封（PLAN p6-orchestration P6-14；BRIEF D9③④⑤）纯函数与
// 接线单测：judgeWorkerCall 三族入口（协调者 / 再委派 / 后台作业）逐名判定、
// enumerateInstalledEntries 只枚举已装注册表里的成员、registerEnvelope 挂
// tools/pre-execute 且 prepend（顺序由 live 差分格证，这里只钉旗标）。
// live 用例（真 Loader + P5-06 矩阵子集复跑）在 orchestration-envelope-live.test.ts。
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COORDINATOR_TOOLS,
  DELEGATION_TOOLS,
  JOB_TOOLS,
  ENTRY_ANNOTATIONS,
  RESTRICT_TOOLS,
  judgeWorkerCall,
  enumerateInstalledEntries,
  registerEnvelope,
  workerRestrictDeny,
  applyWorkerRestriction,
  registerWorkerRestriction,
} from '../../src/orchestration/envelope.mjs'

const denyText = (name: string, args?: object) => judgeWorkerCall(name, args)?.reason ?? ''

describe('P6-14 judgeWorkerCall（入口三族，D9③④⑤）', () => {
  it('① 协调者工具：create_bot / send_to_bot / stop_bot 全拒（stop_bot 自 944afa0（P6-13）起注册；按名拒绝不依赖注册时序）', () => {
    for (const name of COORDINATOR_TOOLS) {
      const verdict = judgeWorkerCall(name, {})
      expect(verdict?.kind).toBe('deny')
      expect(verdict!.reason).toContain('pbots/forbidden')
      expect(verdict!.reason).toContain('coordinator')
      expect(verdict!.reason).toContain(name)
    }
  })

  it('② 再委派：subagent / subagent_fork / list_subagent_models / send_message / interrupt_agent / list_agents / workflow 全拒', () => {
    for (const name of DELEGATION_TOOLS) {
      const verdict = judgeWorkerCall(name, { prompt: 'x' })
      expect(verdict?.kind).toBe('deny')
      expect(verdict!.reason).toContain('pbots/forbidden')
      expect(verdict!.reason).toContain('delegate')
      expect(verdict!.reason).toContain(name)
    }
  })

  it('③ 后台作业工具族：job_output / job_list / job_kill / schedule_* 全拒', () => {
    for (const name of JOB_TOOLS) {
      const verdict = judgeWorkerCall(name, {})
      expect(verdict?.kind).toBe('deny')
      expect(verdict!.reason).toContain('pbots/forbidden')
      expect(verdict!.reason).toContain('background')
      expect(verdict!.reason).toContain(name)
    }
  })

  it('④ 后台参数入口：bash / pwsh 的 run_in_background === true 拒；缺省 / false / 其他工具同名参数放行', () => {
    for (const name of ['bash', 'pwsh']) {
      expect(judgeWorkerCall(name, { command: 'sleep 1', description: 'x', run_in_background: true })?.kind).toBe('deny')
      expect(denyText(name, { command: 'sleep 1', description: 'x', run_in_background: true })).toContain('run_in_background')
      expect(judgeWorkerCall(name, { command: 'sleep 1', description: 'x' })).toBe(null)
      expect(judgeWorkerCall(name, { command: 'sleep 1', description: 'x', run_in_background: false })).toBe(null)
    }
    // 其他工具带同名参数不误伤（判定按工具名绑定）
    expect(judgeWorkerCall('write', { file_path: '/tmp/x', content: 'x', run_in_background: true })).toBe(null)
  })

  it('⑤ 普通工具放行：read / write / edit / grep / glob / ask_user_question / 未知工具 → null（worker 仍可干活，P5 guard 链照常）', () => {
    for (const name of ['read', 'write', 'edit', 'grep', 'glob', 'present', 'ask_user_question', 'todo_write', 'p612_conn_write', 'totally_unknown']) {
      expect(judgeWorkerCall(name, {})).toBe(null)
    }
  })

  it('⑥ 入口全集都带来源锚点（报告「入口全集及锚点」的数据源）', () => {
    const all = [...COORDINATOR_TOOLS, ...DELEGATION_TOOLS, ...JOB_TOOLS, 'bash', 'pwsh']
    for (const name of all) expect(ENTRY_ANNOTATIONS[name], `anchor for ${name}`).toBeTruthy()
  })
})

describe('P6-14 enumerateInstalledEntries（清单从已装注册表枚举）', () => {
  it('① 只保留注册表里实际存在的入口；三族分开、排序稳定', () => {
    const registry = new Set(['subagent', 'subagent_fork', 'workflow', 'job_output', 'job_kill', 'bash', 'read', 'write', 'create_bot'])
    expect(enumerateInstalledEntries(registry)).toEqual({
      coordinator: ['create_bot'],
      delegation: ['subagent', 'subagent_fork', 'workflow'],
      jobs: ['job_output', 'job_kill'],
    })
  })

  it('② 全家桶注册表 → 全集；空注册表 → 全空（不装不枚举）', () => {
    const full = new Set([...COORDINATOR_TOOLS, ...DELEGATION_TOOLS, ...JOB_TOOLS, 'bash'])
    expect(enumerateInstalledEntries(full)).toEqual({
      coordinator: [...COORDINATOR_TOOLS],
      delegation: [...DELEGATION_TOOLS],
      jobs: [...JOB_TOOLS],
    })
    expect(enumerateInstalledEntries(new Set(['bash', 'read']))).toEqual({ coordinator: [], delegation: [], jobs: [] })
  })
})

describe('P6-14 registerEnvelope（接线）', () => {
  const bootGuard = (bots?: Record<string, { createdBy: string }>) => {
    const dir = mkdtempSync(join(tmpdir(), 'bot-p614-unit-'))
    if (bots) writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'm1', recipes: {}, bots }))
    let listener: { fn: (exec: any, next: () => any) => Promise<any>, prepend?: boolean } | undefined
    const ctx = {
      on: (name: string, fn: any, prepend?: boolean) => {
        expect(name).toBe('tools/pre-execute')
        listener = { fn, prepend }
        return () => { listener = undefined }
      },
    }
    const dispose = registerEnvelope(ctx as any, { config: { dataDir: dir } })
    expect(listener).toBeTruthy()
    return {
      prepend: listener!.prepend,
      call: (exec: any) => listener!.fn(exec, () => ({ kind: 'pass-through' })),
    }
  }

  it('① prepend 旗标为 true（cordis unshift 最外层，P5-05 同层）', () => {
    expect(bootGuard({ w1: { createdBy: 'm1' } }).prepend).toBe(true)
  })

  it('② worker 会话：subagent / bash+run_in_background / create_bot 三族各拒，reason 同 judgeWorkerCall', async () => {
    const g = bootGuard({ w1: { createdBy: 'm1' } })
    for (const exec of [
      { agent: { id: 'w1' }, name: 'subagent', arguments: { prompt: 'x' } },
      { agent: { id: 'w1' }, name: 'bash', arguments: { command: 'sleep 1', description: 'x', run_in_background: true } },
      { agent: { id: 'w1' }, name: 'create_bot', arguments: { name: 'a', prompt: 'b' } },
    ]) {
      const verdict = await g.call(exec)
      expect(verdict).toMatchObject({ kind: 'deny' })
      expect((verdict as any).reason).toContain('pbots/forbidden')
    }
  })

  it('③ worker 的普通工具 / 主 bot 会话（含调 subagent）/ bots.json 不可读的会话 → next() 放行', async () => {
    const g = bootGuard({ w1: { createdBy: 'm1' } })
    expect(await g.call({ agent: { id: 'w1' }, name: 'read', arguments: { file_path: '/proc/self/environ' } })).toEqual({ kind: 'pass-through' })
    expect(await g.call({ agent: { id: 'm1' }, name: 'subagent', arguments: {} })).toEqual({ kind: 'pass-through' })
    expect(await g.call({ agent: { id: 'm1' }, name: 'bash', arguments: { run_in_background: true } })).toEqual({ kind: 'pass-through' })
    const broken = bootGuard() // 无 bots.json：readWorkerIds 返回 []，不按 worker 拦
    expect(await broken.call({ agent: { id: 'w1' }, name: 'subagent', arguments: {} })).toEqual({ kind: 'pass-through' })
  })

  it('④ 回合中 worker 被写进 bots.json 后立即生效（每次 execute 重读，不加缓存窗口）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bot-p614-unit-'))
    let listener: ((exec: any, next: () => any) => Promise<any>) | undefined
    const ctx = { on: (_n: string, fn: any) => { listener = fn; return () => {} } }
    registerEnvelope(ctx as any, { config: { dataDir: dir } })
    const call = (exec: any) => listener!(exec, () => ({ kind: 'pass-through' }))
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'm1', recipes: {}, bots: { w9: { createdBy: 'm1' } } }))
    expect(await call({ agent: { id: 'w9' }, name: 'workflow', arguments: {} })).toMatchObject({ kind: 'deny' })
  })
})

// ---------------------------------------------------------------------------
// P6-14.f1 per-agent restrict（VERIFY-P6-14 [FIX]；快捷列第 1 级集成）
// ---------------------------------------------------------------------------

describe('P6-14.f1 workerRestrictDeny / applyWorkerRestriction（restrict 拒绝面）', () => {
  it('① RESTRICT_TOOLS = 协调者 + 再委派 + 后台作业三族并集（worker 模型可见面收窄全集）', () => {
    expect(RESTRICT_TOOLS).toEqual([...COORDINATOR_TOOLS, ...DELEGATION_TOOLS, ...JOB_TOOLS])
    expect(new Set(RESTRICT_TOOLS).size).toBe(RESTRICT_TOOLS.length) // 无重复名（restrict 拒绝列表干净）
  })

  it('② deny = RESTRICT_TOOLS ∩ 已装注册表：restrict 拒未知名，交集后再交（未装入口不进 filter）', () => {
    const registry = new Set(['subagent', 'workflow', 'job_list', 'schedule_create', 'create_bot', 'stop_bot', 'bash'])
    expect(workerRestrictDeny(registry)).toEqual(['create_bot', 'stop_bot', 'subagent', 'workflow', 'job_list', 'schedule_create'])
    expect(workerRestrictDeny(new Set(['bash', 'read']))).toEqual([])
  })

  it('③ applyWorkerRestriction 经 agent.ctx.tools.restrict({deny}) 挂上并原样返回 disposer（交集取 agent 视图）', () => {
    const calls: Array<{ deny: string[] }> = []
    const agent = { id: 'w1', ctx: { tools: { restrict: (filter: { deny: string[] }) => { calls.push(filter); return () => { calls.push({ deny: ['<lifted>'] }) } } } } }
    const registry = new Set([...RESTRICT_TOOLS, 'bash'])
    const tools = { definitions: (scope: unknown) => { expect(scope).toBe(agent); return [...registry].map((name) => ({ name })) } }
    const undo = applyWorkerRestriction(agent as any, tools as any)
    expect(undo).toBeTypeOf('function')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.deny).toEqual(workerRestrictDeny(registry))
    undo!()
    expect(calls[1]!.deny).toEqual(['<lifted>']) // 原样透传 disposer，不包一层
  })

  it('④ deny 为空（agent 视图无任何入口）→ 不调 restrict，返回 null', () => {
    let called = 0
    const agent = { id: 'w1', ctx: { tools: { restrict: () => { called += 1; return () => {} } } } }
    const tools = { definitions: () => ['bash', 'read'].map((name) => ({ name })) }
    expect(applyWorkerRestriction(agent as any, tools as any)).toBe(null)
    expect(called).toBe(0)
  })
})

describe('P6-14.f1 registerWorkerRestriction（agent 生命周期接线）', () => {
  /** fake ctx：agents.list 引导 + agent/created / agent/disposed 监听 + 全局工具表。 */
  const boot = (bots: Record<string, { createdBy: string }>, liveAgentIds: string[] = [], registry: string[] = [...RESTRICT_TOOLS, 'bash']) => {
    const dir = mkdtempSync(join(tmpdir(), 'bot-p614f1-unit-'))
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'm1', recipes: {}, bots }))
    const listeners = new Map<string, Array<(payload: any) => void>>()
    const warns: string[] = []
    const restricted: Array<{ agentId: string; deny: string[] }> = []
    const lifted: string[] = []
    const mkAgent = (id: string) => ({
      id,
      ctx: { tools: { restrict: (filter: { deny: string[] }) => { restricted.push({ agentId: id, deny: filter.deny }); return () => lifted.push(id) } } },
    })
    const agents = liveAgentIds.map(mkAgent)
    const ctx = {
      agents: { list: () => agents },
      tools: { definitions: () => registry.map((name) => ({ name })) },
      logger: { warn: (m: string) => warns.push(m) },
      on: (name: string, fn: any) => {
        expect(['agent/created', 'agent/disposed']).toContain(name)
        listeners.set(name, [...(listeners.get(name) ?? []), fn])
        return () => listeners.set(name, (listeners.get(name) ?? []).filter((f) => f !== fn))
      },
    }
    const dispose = registerWorkerRestriction(ctx as any, { config: { dataDir: dir } })
    const emit = (name: string, payload: any) => listeners.get(name)?.forEach((fn) => fn(payload))
    return { dispose, emit, restricted, lifted, warns, mkAgent, agents, listeners }
  }

  it('① 引导：构造时已 live 的 worker 立即 restrict；主 bot / 普通会话不动', () => {
    const w = boot({ w1: { createdBy: 'm1' } }, ['w1', 'm1'])
    expect(w.restricted.map((r) => r.agentId)).toEqual(['w1'])
    expect(w.restricted[0]!.deny).toEqual(workerRestrictDeny(new Set([...RESTRICT_TOOLS, 'bash'])))
  })

  it('② agent/created：worker（含重启后 resume 的冷 worker）→ restrict；主 bot 会话不挂', () => {
    const w = boot({ w1: { createdBy: 'm1' } })
    w.emit('agent/created', { agent: w.mkAgent('w1') })
    w.emit('agent/created', { agent: w.mkAgent('m1') })
    w.emit('agent/created', { agent: w.mkAgent('plain') })
    expect(w.restricted.map((r) => r.agentId)).toEqual(['w1'])
  })

  it('③ 同一 worker 重复 agent/created 不重复挂；agent/disposed 撤销后重建可重挂', () => {
    const w = boot({ w1: { createdBy: 'm1' } })
    const a1 = w.mkAgent('w1')
    w.emit('agent/created', { agent: a1 })
    w.emit('agent/created', { agent: a1 }) // 幂等
    expect(w.restricted).toHaveLength(1)
    w.emit('agent/disposed', { agent: a1 })
    expect(w.lifted).toEqual(['w1'])
    w.emit('agent/created', { agent: w.mkAgent('w1') }) // 重建（resume）重挂
    expect(w.restricted).toHaveLength(2)
  })

  it('④ restrict 抛错不外抛（agent/created 是 serial listener，失败会杀会话创建），logger.warn 记一行', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bot-p614f1-unit-'))
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'm1', recipes: {}, bots: { w1: { createdBy: 'm1' } } }))
    const listeners = new Map<string, Array<(payload: any) => void>>()
    const warns: string[] = []
    const ctx = {
      agents: { list: () => [] },
      tools: { definitions: () => [{ name: 'subagent' }] },
      logger: { warn: (m: string) => warns.push(m) },
      on: (name: string, fn: any) => { listeners.set(name, [fn]); return () => {} },
    }
    registerWorkerRestriction(ctx as any, { config: { dataDir: dir } })
    expect(() => listeners.get('agent/created')![0]!({
      agent: { id: 'w1', ctx: { tools: { restrict: () => { throw new Error('boom restrict') } } } },
    })).not.toThrow()
    expect(warns.join('\n')).toContain('w1')
  })

  it('⑤ bots.json 不可读 → 不挂（与 pre-execute 守卫同口径），不抛', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bot-p614f1-unit-')) // 无 bots.json
    const listeners = new Map<string, Array<(payload: any) => void>>()
    const restricted: string[] = []
    const ctx = {
      agents: { list: () => [{ id: 'w1', ctx: { tools: { restrict: () => { restricted.push('w1'); return () => {} } } } }] },
      tools: { definitions: () => [{ name: 'subagent' }] },
      logger: { warn: () => {} },
      on: (name: string, fn: any) => { listeners.set(name, [fn]); return () => {} },
    }
    registerWorkerRestriction(ctx as any, { config: { dataDir: dir } })
    expect(restricted).toEqual([])
  })

  it('⑥ 返回的 disposer：摘监听 + 撤销全部已挂 restriction', () => {
    const w = boot({ w1: { createdBy: 'm1' }, w2: { createdBy: 'm1' } })
    w.emit('agent/created', { agent: w.mkAgent('w1') })
    w.emit('agent/created', { agent: w.mkAgent('w2') })
    w.dispose()
    expect(new Set(w.lifted)).toEqual(new Set(['w1', 'w2']))
    w.emit('agent/created', { agent: w.mkAgent('w1') }) // 监听已摘，不再挂
    expect(w.restricted.filter((r) => r.agentId === 'w1')).toHaveLength(1)
  })
})

describe('P6-14.f1 升级哨兵：已装 dsh-tools 的 restrict API 形状', () => {
  // 依赖解析同 src/orchestration/main-channel.mjs / tests/support/orchestration-create-inspect.mjs
  // （裸包名只能从 app/sdk 直接依赖 createResolve）。对照 repos/deepseek-harness@ce7073d
  // packages/core/tools/src/index.ts:160-190 —— 与已装 0.2.2-alpha.2 语义一致；上游
  // 改动这三条契约（scoped ctx / 未知名拒 / disposer）任一条 → 本格红，须重审 envelope 的用法。
  const lib = readFileSync(createRequire(realpathSync(join(
    new URL('.', import.meta.url).pathname, '..', '..',
    'node_modules', '@deepseek-ai', 'dsh-plugin-market', 'lib', 'index.js',
  ))).resolve('@deepseek-ai/dsh-tools'), 'utf8')

  it('① 需 scoped ctx（agent.ctx）调用——全局 ctx 上 restrict 抛错', () => {
    expect(lib).toContain('requires a scoped context')
  })
  it('② 拒未知名（filter 名单必须 ∩ 已装注册表后才能交）', () => {
    expect(lib).toContain('names unknown global tool')
  })
  it('③ 返回幂等 disposer（layers.effect 语义，撤销用）', () => {
    expect(lib).toContain('label: "tools.restrict()"')
  })
})
