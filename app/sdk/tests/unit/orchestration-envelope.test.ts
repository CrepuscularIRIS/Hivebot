// P6-14 worker 安全信封（PLAN p6-orchestration P6-14；BRIEF D9③④⑤）纯函数与
// 接线单测：judgeWorkerCall 三族入口（协调者 / 再委派 / 后台作业）逐名判定、
// enumerateInstalledEntries 只枚举已装注册表里的成员、registerEnvelope 挂
// tools/pre-execute 且 prepend（顺序由 live 差分格证，这里只钉旗标）。
// live 用例（真 Loader + P5-06 矩阵子集复跑）在 orchestration-envelope-live.test.ts。
import { createRequire } from 'node:module'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tmkdir } from '../support/tmp-sweep.ts'
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
  resolveWorkerStatus,
  isEnveloped,
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
    const dir = tmkdir('bot-p614-unit-')
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

  it('③ worker 的普通工具 / 主 bot 会话（含调 subagent）→ next() 放行', async () => {
    const g = bootGuard({ w1: { createdBy: 'm1' } })
    expect(await g.call({ agent: { id: 'w1' }, name: 'read', arguments: { file_path: '/proc/self/environ' } })).toEqual({ kind: 'pass-through' })
    expect(await g.call({ agent: { id: 'm1' }, name: 'subagent', arguments: {} })).toEqual({ kind: 'pass-through' })
    expect(await g.call({ agent: { id: 'm1' }, name: 'bash', arguments: { run_in_background: true } })).toEqual({ kind: 'pass-through' })
  })

  it('④ 回合中 worker 被写进 bots.json 后立即生效（每次 execute 重读，不加缓存窗口）', async () => {
    const dir = tmkdir('bot-p614-unit-')
    let listener: ((exec: any, next: () => any) => Promise<any>) | undefined
    const ctx = { on: (_n: string, fn: any) => { listener = fn; return () => {} } }
    registerEnvelope(ctx as any, { config: { dataDir: dir } })
    const call = (exec: any) => listener!(exec, () => ({ kind: 'pass-through' }))
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'm1', recipes: {}, bots: { w9: { createdBy: 'm1' } } }))
    expect(await call({ agent: { id: 'w9' }, name: 'workflow', arguments: {} })).toMatchObject({ kind: 'deny' })
  })

  // P6-14.f2 C-1（REVIEW-P6-14-C major ①）：身份不可判定 = 按 worker 处理（fail
  // closed，宁可误伤）。f3（VERIFY-P6-14.f2 阻塞项）收窄 unknown 面：文件有效且
  // 省略 bots 键 = 合法零 worker（确认非 worker），unknown 仅剩缺失 / 损坏 /
  // version 不符。
  it('⑤ C-1 fail closed：bots.json 缺失 / 损坏 / version 不符时，任意会话（含陌生 id）的 subagent / 后台入口全拒；合法零 worker 文档（省略 bots 键）主 bot 放行', async () => {
    const dir = tmkdir('bot-p614f2-unit-')
    let listener: ((exec: any, next: () => any) => Promise<any>) | undefined
    const ctx = { on: (_n: string, fn: any) => { listener = fn; return () => {} } }
    registerEnvelope(ctx as any, { config: { dataDir: dir } })
    const call = (exec: any) => listener!(exec, () => ({ kind: 'pass-through' }))
    // 缺失（未写文件）
    for (const exec of [
      { agent: { id: 'w1' }, name: 'subagent', arguments: { prompt: 'x' } },
      { agent: { id: 'total-stranger' }, name: 'job_list', arguments: {} },
      { agent: { id: 'bash-session' }, name: 'bash', arguments: { command: 'x', description: 'x', run_in_background: true } },
    ]) expect(await call(exec)).toMatchObject({ kind: 'deny' })
    // 损坏（坏 JSON）→ fail closed
    writeFileSync(join(dir, 'bots.json'), '{broken')
    expect(await call({ agent: { id: 'm1' }, name: 'subagent', arguments: {} })).toMatchObject({ kind: 'deny' })
    // version 不符 → unknown → fail closed（f3：unknown 仅剩缺失 / 损坏 / version 不符）
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 2, mainBotId: 'm1', recipes: {}, bots: {} }))
    expect(await call({ agent: { id: 'm1' }, name: 'subagent', arguments: {} })).toMatchObject({ kind: 'deny' })
    // f3（VERIFY-P6-14.f2 阻塞项）：合法 v1 文档省略 bots 键 = 零 worker（CONTRACT
    // v1.5 §3.1 决策 31；生产 BotsMetaStore 零 worker 正是此形状）→ 确认非 worker，
    // 主 bot 正常路径放行，create_bot 不再被信封拒
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'm1', recipes: {} }))
    expect(await call({ agent: { id: 'm1' }, name: 'subagent', arguments: {} })).toEqual({ kind: 'pass-through' })
    expect(await call({ agent: { id: 'm1' }, name: 'create_bot', arguments: { name: 'a', prompt: 'b' } })).toEqual({ kind: 'pass-through' })
    expect(await call({ agent: { id: 'stranger' }, name: 'create_bot', arguments: {} })).toEqual({ kind: 'pass-through' })
    // 恢复健康（bots 键在、该 id 无 createdBy）→ 确认非 worker，主 bot 正常路径放行
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'm1', recipes: {}, bots: { w1: { createdBy: 'm1' } } }))
    expect(await call({ agent: { id: 'm1' }, name: 'subagent', arguments: {} })).toEqual({ kind: 'pass-through' })
    expect(await call({ agent: { id: 'm1' }, name: 'read', arguments: { file_path: '/tmp/x' } })).toEqual({ kind: 'pass-through' })
  })

  // P6-14.f2 C-2（REVIEW-P6-14-C major ②）执行层谱系：worker 的直接子代理
  // （session header origin=subagent、parentSession=worker）按信封拦——改名委派
  // 工具建出来的子代理在执行层不可达 job_list / 再委派；主 bot 的子代理不受影响。
  it('⑥ f2 C-2 谱系：worker 直接子代理的 job_list / subagent 拒；主 bot 子代与谱系外会话放行', async () => {
    const g = bootGuard({ w1: { createdBy: 'm1' } })
    const childOf = (parent: string) => ({ session: { header: { origin: 'subagent', parentSession: parent } } })
    expect(await g.call({ agent: { id: 'child-of-worker', ...childOf('w1') }, name: 'job_list', arguments: {} })).toMatchObject({ kind: 'deny' })
    expect(await g.call({ agent: { id: 'child-of-worker', ...childOf('w1') }, name: 'subagent', arguments: { prompt: 'x' } })).toMatchObject({ kind: 'deny' })
    // 主 bot（m1 无 createdBy）的子代理：委派是主 bot 的正常能力，放行
    expect(await g.call({ agent: { id: 'child-of-main', ...childOf('m1') }, name: 'subagent', arguments: { prompt: 'x' } })).toEqual({ kind: 'pass-through' })
    expect(await g.call({ agent: { id: 'child-of-main', ...childOf('m1') }, name: 'job_list', arguments: {} })).toEqual({ kind: 'pass-through' })
    // 非 subagent 会话（无 origin 标记）不吃谱系误伤；subagent 但父健康非 worker 亦放行
    expect(await g.call({ agent: { id: 'plain', session: { header: {} } }, name: 'job_list', arguments: {} })).toEqual({ kind: 'pass-through' })
    expect(await g.call({ agent: { id: 'plain', session: { header: { origin: 'subagent', parentSession: 'unknown-parent' } } }, name: 'read', arguments: {} })).toEqual({ kind: 'pass-through' })
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
    const dir = tmkdir('bot-p614f1-unit-')
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
        expect(['agent/created', 'agent/disposed', 'session/created', 'tools/pre-execute']).toContain(name)
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
    const dir = tmkdir('bot-p614f1-unit-')
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

  it('⑤ f2 C-1 fail closed：bots.json 不可读 → 所有会话按 worker 挂 restrict（身份不可判定 ≠ 非 worker）', () => {
    const dir = tmkdir('bot-p614f1-unit-') // 无 bots.json
    const listeners = new Map<string, Array<(payload: any) => void>>()
    const restricted: string[] = []
    const ctx = {
      agents: { list: () => [{ id: 'w1', ctx: { tools: { restrict: () => { restricted.push('w1'); return () => {} } } } }, { id: 'm1', ctx: { tools: { restrict: () => { restricted.push('m1'); return () => {} } } } }] },
      tools: { definitions: () => [{ name: 'subagent' }] },
      logger: { warn: () => {} },
      on: (name: string, fn: any) => { listeners.set(name, [fn]); return () => {} },
    }
    registerWorkerRestriction(ctx as any, { config: { dataDir: dir } })
    expect(restricted).toEqual(['w1', 'm1']) // 宁可误伤：主 bot 在文件坏窗口同样收窄
  })

  // P6-14.f2 C-2（REVIEW-P6-14-C major ②）创建点谱系拒绝：worker 的直接子代理
  // 在 session/created 同步抛错 veto 发布（比 agent/created 更早，session 与 agent
  // 都不落 registry → 改名委派工具的调用 isError、0 子代理）；主 bot 的子代理
  // 与身份健康的谱系外子代理照常创建。bootstrap 扫描（list）不走创建点，只挂
  // restrict（已存在的会话不能在引导期 fail 启动）。
  it('⑦ f2 C-2 创建点拒绝：worker 子代理的 session/created 抛 pbots/forbidden；主 bot 子代理不抛', () => {
    const w = boot({ w1: { createdBy: 'm1' } })
    const childSession = (parent: string) => ({ header: { origin: 'subagent', parentSession: parent } })
    expect(() => w.emit('session/created', childSession('w1'))).toThrow(/pbots\/forbidden.*delegate/)
    expect(() => w.emit('session/created', childSession('m1'))).not.toThrow()
    // 普通（非 subagent）session 创建不受影响
    expect(() => w.emit('session/created', { header: {} })).not.toThrow()
    // 身份不可判定（文件坏）→ fail closed：任何 subagent 创建都拒（宁可误伤）
    const dir = tmkdir('bot-p614f2-unit-') // 无 bots.json
    const listeners = new Map<string, Array<(payload: any) => void>>()
    const ctx = {
      agents: { list: () => [] },
      tools: { definitions: () => [{ name: 'subagent' }] },
      logger: { warn: () => {} },
      on: (name: string, fn: any) => { listeners.set(name, [fn]); return () => {} },
    }
    registerWorkerRestriction(ctx as any, { config: { dataDir: dir } })
    expect(() => listeners.get('session/created')![0]!(childSession('some-parent'))).toThrow(/pbots\/forbidden/)
  })

  it('⑧ f2 C-2 谱系纵深：bootstrap list 里已 live 的 worker 子代理挂 restrict（历史残留不 fail 引导，工具表仍收窄）', () => {
    const dir = tmkdir('bot-p614f2-unit-')
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'm1', recipes: {}, bots: { w1: { createdBy: 'm1' } } }))
    const restricted: string[] = []
    const mkAgent = (id: string, parent?: string) => ({
      id,
      ...(parent === undefined ? {} : { session: { header: { origin: 'subagent', parentSession: parent } } }),
      ctx: { tools: { restrict: () => { restricted.push(id); return () => {} } } },
    })
    const ctx = {
      agents: { list: () => [mkAgent('w1'), mkAgent('kid-of-w1', 'w1'), mkAgent('kid-of-m1', 'm1'), mkAgent('plain')] },
      tools: { definitions: () => ['subagent', 'job_list'].map((name) => ({ name })) },
      logger: { warn: () => {} },
      on: () => () => {},
    }
    registerWorkerRestriction(ctx as any, { config: { dataDir: dir } })
    expect(restricted).toEqual(['w1', 'kid-of-w1'])
  })

  // P6-14.f3（VERIFY-P6-14.f2 阻塞项 ②）：合法零 worker 文档 = 省略 bots 键
  // （CONTRACT v1.5 §3.1 决策 31），冷启动在 healthy 文档下建会话不再有 unknown
  // 窗口——bootstrap / agent/created 都不挂 restrict。
  it('⑨ f3 合法零 worker 文档（省略 bots 键）→ bootstrap 与 agent/created 均不挂 restrict（主 bot 工具表不受影响）', () => {
    const dir = tmkdir('bot-p614f3-unit-')
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'm1', recipes: {} }))
    const restricted: string[] = []
    const mkAgent = (id: string) => ({ id, ctx: { tools: { restrict: () => { restricted.push(id); return () => {} } } } })
    const listeners = new Map<string, Array<(payload: any) => void>>()
    const ctx = {
      agents: { list: () => [mkAgent('m1'), mkAgent('plain')] },
      tools: { definitions: () => ['subagent', 'job_list'].map((name) => ({ name })) },
      logger: { warn: () => {} },
      on: (name: string, fn: any) => { listeners.set(name, [...(listeners.get(name) ?? []), fn]); return () => {} },
    }
    registerWorkerRestriction(ctx as any, { config: { dataDir: dir } })
    expect(restricted).toEqual([]) // 零 worker 文档：无人收窄
    listeners.get('agent/created')!.forEach((fn) => fn({ agent: mkAgent('newcomer') }))
    expect(restricted).toEqual([])
  })

  // P6-14.f3（VERIFY-P6-14.f2 新问题 1）：unknown 窗口挂上的 restrict，在身份
  // 恢复为确认非 worker 后撤销（sweep 挂 session/created / agent/created /
  // tools/pre-execute 三个已有事件点，SDK 观察不到 main 的写盘）。真 worker 不误撤。
  it('⑩ f3 恢复撤销：unknown 窗口挂的 restrict 在文件恢复健康后撤销（agent/created / tools/pre-execute 两个触发点）；真 worker 不撤', async () => {
    const dir = tmkdir('bot-p614f3-unit-') // 无 bots.json → unknown
    const restricted: string[] = []
    const lifted: string[] = []
    const mkAgent = (id: string) => ({ id, ctx: { tools: { restrict: () => { restricted.push(id); return () => lifted.push(id) } } } })
    const m1 = mkAgent('m1')
    const w1 = mkAgent('w1')
    const live = [m1, w1]
    const listeners = new Map<string, Array<(payload: any) => any>>()
    const ctx = {
      agents: { list: () => live },
      tools: { definitions: () => ['subagent', 'job_list'].map((name) => ({ name })) },
      logger: { warn: () => {} },
      on: (name: string, fn: any) => { listeners.set(name, [...(listeners.get(name) ?? []), fn]); return () => {} },
    }
    registerWorkerRestriction(ctx as any, { config: { dataDir: dir } })
    expect(restricted).toEqual(['m1', 'w1']) // 文件缺失 → fail closed 全挂
    // 身份恢复：写健康零 worker 文档（省略 bots 键）→ agent/created 触发 sweep 撤销
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'm1', recipes: {} }))
    listeners.get('agent/created')!.forEach((fn) => fn({ agent: mkAgent('newcomer') }))
    expect(new Set(lifted)).toEqual(new Set(['m1', 'w1'])) // 两者此刻都确认非 worker
    // 再进 unknown（文件损坏）→ 重挂；随后本 agent 任意工具调用（tools/pre-execute）触发撤销
    restricted.length = 0
    lifted.length = 0
    writeFileSync(join(dir, 'bots.json'), '{broken')
    listeners.get('agent/created')!.forEach((fn) => fn({ agent: m1 }))
    expect(restricted).toEqual(['m1'])
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'm1', recipes: {} }))
    const pre = listeners.get('tools/pre-execute')!
    expect(await pre[pre.length - 1]!({ agent: m1, name: 'read', arguments: {} }, () => ({ kind: 'pass-through' }))).toEqual({ kind: 'pass-through' })
    expect(lifted).toEqual(['m1'])
    // 真 worker（在册 createdBy）：sweep 不误撤
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'm1', recipes: {}, bots: { w1: { createdBy: 'm1' } } }))
    restricted.length = 0
    lifted.length = 0
    listeners.get('agent/created')!.forEach((fn) => fn({ agent: w1 })) // unknown 已无 → w1 是 worker → 挂上
    expect(restricted).toEqual(['w1'])
    listeners.get('session/created')!.forEach((fn) => fn({ header: {} })) // 任意新 session → sweep
    expect(lifted).toEqual([]) // worker 的 restrict 保留
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

// ---------------------------------------------------------------------------
// P6-14.f2（REVIEW-P6-14-C C-1/C-2）：三态身份判定 + 信封归属
// ---------------------------------------------------------------------------

describe('P6-14.f2 resolveWorkerStatus（三态身份，fail closed）', () => {
  const mkDir = (content?: string) => {
    const dir = tmkdir('bot-p614f2-st-')
    if (content !== undefined) writeFileSync(join(dir, 'bots.json'), content)
    return dir
  }
  const healthy = JSON.stringify({ version: 1, mainBotId: 'm1', recipes: {}, bots: { w1: { createdBy: 'm1' }, w2: { createdBy: '' }, plain: {} } })

  it('① 文件健康：createdBy 非空 → worker；createdBy 空 / 无记录 → main', () => {
    const dir = mkDir(healthy)
    expect(resolveWorkerStatus('w1', dir)).toBe('worker')
    expect(resolveWorkerStatus('w2', dir)).toBe('main')
    expect(resolveWorkerStatus('plain', dir)).toBe('main')
    expect(resolveWorkerStatus('m1', dir)).toBe('main')
  })

  it('② 身份不可判定 → unknown：缺失 / 坏 JSON / version 不符 / bots 键在但非对象（f3：省略键不再算 unknown）', () => {
    expect(resolveWorkerStatus('w1', mkDir())).toBe('unknown') // 文件不存在
    expect(resolveWorkerStatus('w1', mkDir('{broken'))).toBe('unknown')
    // version 不符（含字符串 '1'）→ 损坏口径
    expect(resolveWorkerStatus('w1', mkDir(JSON.stringify({ version: 2, mainBotId: 'm1', recipes: {}, bots: { w1: { createdBy: 'm1' } } })))).toBe('unknown')
    expect(resolveWorkerStatus('w1', mkDir(JSON.stringify({ version: '1', mainBotId: 'm1', recipes: {}, bots: {} })))).toBe('unknown')
    expect(resolveWorkerStatus('w1', mkDir(JSON.stringify({ version: 1, mainBotId: 'm1', recipes: {}, bots: null })))).toBe('unknown')
    expect(resolveWorkerStatus('w1', mkDir(JSON.stringify({ version: 1, mainBotId: 'm1', recipes: {}, bots: [] })))).toBe('unknown')
  })

  it('②b f3 契约语义（VERIFY-P6-14.f2 阻塞项）：文件有效（version 1）且省略 bots 键 = 零 worker = 确认非 worker（CONTRACT v1.5 §3.1 决策 31「无 worker 不写键」，生产 BotsMetaStore 零 worker 正是此形状）', () => {
    const dir = mkDir(JSON.stringify({ version: 1, mainBotId: 'm1', recipes: {} }))
    expect(resolveWorkerStatus('w1', dir)).toBe('main')
    expect(resolveWorkerStatus('m1', dir)).toBe('main')
    expect(resolveWorkerStatus('total-stranger', dir)).toBe('main')
    expect(isEnveloped({ id: 'anyone' }, dir)).toBe(false)
    expect(isEnveloped({ id: 'kid', session: { header: { origin: 'subagent', parentSession: 'm1' } } }, dir)).toBe(false)
  })

  it('③ isEnveloped：worker / unknown / worker 直接子代为真；健康 main 与 main 子代为假', () => {
    const dir = mkDir(healthy)
    expect(isEnveloped({ id: 'w1' }, dir)).toBe(true)
    expect(isEnveloped({ id: 'nope' }, mkDir())).toBe(true) // unknown → fail closed
    expect(isEnveloped({ id: 'm1' }, dir)).toBe(false)
    expect(isEnveloped({ id: 'kid', session: { header: { origin: 'subagent', parentSession: 'w1' } } }, dir)).toBe(true)
    expect(isEnveloped({ id: 'kid', session: { header: { origin: 'subagent', parentSession: 'm1' } } }, dir)).toBe(false)
    expect(isEnveloped({ id: 'plain', session: { header: {} } }, dir)).toBe(false)
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
