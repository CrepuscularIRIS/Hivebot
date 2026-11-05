// P6-24 SDK 侧单测（PLAN p6-orchestration P6-24 + 决策 36 + Q-024 A + panels/
// D3-r1.md 必须回应 ①③）：create_bot 的 subdir / artifacts 参数与按文件划分写入
// 责任（claims：同主 bot 下交叉即拒 pbots/busy，worker turn/end 释放）；worker 的
// write/edit 拒写 agent-instructions 指令文件（AGENTS.md / CLAUDE.md 及 .local 变体，
// 防 worker 借指令文件给主 bot 下指令绕过决策 29 的污染判定）。
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tmkdir } from '../support/tmp-sweep.ts'
import { Slots } from '../../src/orchestration/slots.mjs'
import { CreateChannel } from '../../src/orchestration/main-channel.mjs'
import { registerCreateBot, CREATE_BOT_TOOL } from '../../src/orchestration/create.mjs'
import {
  subdirProblem, artifactsProblem, claimDescriptors, claimsConflict, registerClaims, dropClaims,
} from '../../src/orchestration/claims.mjs'
import { instructionFileDenial, registerEnvelope, INSTRUCTION_FILES } from '../../src/orchestration/envelope.mjs'

// ---- claims.mjs 纯函数 ----

describe('P6-24 subdirProblem / artifactsProblem（create_bot 参数校验）', () => {
  it('subdir：单段路径放行（trim 后）；分隔符 / ".." / "." / 空 / 非字符串 / 超长 → 问题串', () => {
    expect(subdirProblem(undefined)).toBe(null)
    expect(subdirProblem('out')).toBe(null)
    expect(subdirProblem('  out  ')).toBe(null)
    for (const bad of ['a/b', 'a\\b', '..', '.', '', '   ', '/abs', 5, null]) {
      expect(subdirProblem(bad as never)).not.toBe(null)
    }
    expect(subdirProblem('x'.repeat(129))).not.toBe(null)
    expect(subdirProblem('x'.repeat(128))).toBe(null)
  })

  it('artifacts：相对路径数组放行；绝对路径 / ".." 段 / 非数组 / 非字符串项 → 问题串', () => {
    expect(artifactsProblem(undefined)).toBe(null)
    expect(artifactsProblem(['a.txt', 'src/b.ts', ' deep/c.md '])).toBe(null)
    for (const bad of ['/abs/a.txt', 'a/../b', '../x', 5, 'a.txt\0b', '']) {
      expect(artifactsProblem([bad as never])).not.toBe(null)
    }
    expect(artifactsProblem('a.txt' as never)).not.toBe(null)
    expect(artifactsProblem([1, 2] as never)).not.toBe(null)
    expect(artifactsProblem(Array.from({ length: 33 }, (_, i) => `f${i}`))).not.toBe(null)
    expect(artifactsProblem(Array.from({ length: 32 }, (_, i) => `f${i}`))).toBe(null)
  })
})

describe('P6-24 claimDescriptors（描述符 = <subdir|·>/<相对产物路径>）', () => {
  it('无 artifacts → 空数组；subdir 归一进描述符（同 subdir 同文件 → 同描述符）', () => {
    expect(claimDescriptors(undefined, undefined)).toEqual([])
    expect(claimDescriptors(undefined, [])).toEqual([])
    expect(claimDescriptors(undefined, ['a.txt', 'src/b.ts'])).toEqual(['a.txt', 'src/b.ts'])
    expect(claimDescriptors('out', ['a.txt', ' src/b.ts '])).toEqual(['out/a.txt', 'out/src/b.ts'])
    // 不同 subdir 的同名文件是不同描述符（分区不误伤）
    expect(claimDescriptors('out1', ['a.txt'])[0]).not.toBe(claimDescriptors('out2', ['a.txt'])[0])
  })
})

describe('P6-24 claims 冲突判定（D-3-③ 按文件划分写入责任）', () => {
  it('同主 bot 下描述符交叉 → 冲突（报持有人）；不同主 bot 不互相拦；turn/end 释放后可再占', () => {
    const claims = new Map()
    registerClaims(claims, 'm1', 'w1', ['out/a.txt', 'shared/b.ts'])
    expect(claimsConflict(claims, 'm1', ['out/a.txt'])).toMatchObject({ holder: 'w1', descriptor: 'out/a.txt' })
    expect(claimsConflict(claims, 'm1', ['shared/b.ts'])).toMatchObject({ holder: 'w1' })
    expect(claimsConflict(claims, 'm1', ['out/c.txt'])).toBe(null)
    expect(claimsConflict(claims, 'm1', [])).toBe(null)
    // 换主后旧主的 worker 不拦新主（不同的共享目录）
    expect(claimsConflict(claims, 'm2', ['out/a.txt'])).toBe(null)
    dropClaims(claims, 'w1')
    expect(claimsConflict(claims, 'm1', ['out/a.txt'])).toBe(null)
  })
})

// ---- create_bot execute：subdir / artifacts 参数面 ----

function subscriber(peer: string) {
  return { peer, queue: [] as Array<Record<string, unknown>>, wake: undefined as undefined | (() => void) }
}

/** registeredTool（orchestration-create.test.ts 同构，加 session/event 捕获与 delivery 桩）。 */
function registeredTool(dataDir: string, slotsLimit = 3) {
  let definition: any
  let options: any
  const handlers: Record<string, Array<(a: any, b: any) => void>> = {}
  const ctx = {
    tools: { register: (d: any, o: any) => { definition = d; options = o } },
    sessionPersistence: { flush: async () => {} },
    on: (name: string, fn: any) => { (handlers[name] ??= []).push(fn); return () => {} },
  }
  const slots = new Slots(slotsLimit)
  const channel = new CreateChannel()
  const sub = subscriber('peer-main')
  channel.attach(sub)
  const orch: any = { config: { dataDir }, slots, channel, agentOf: async (id: string) => ({ id }), delivery: { send: async () => {} } }
  registerCreateBot(ctx as never, orch)
  const fire = (name: string, a: any, b: any) => { for (const fn of handlers[name] ?? []) fn(a, b) }
  // execute 先读 bots.json（异步 IO）再进通道：轮询等请求落进订阅队列（≤2s）。
  const nextRequest = async (): Promise<Record<string, unknown>> => {
    const seen = sub.queue.length
    for (let i = 0; i < 200 && sub.queue.length === seen; i++) await new Promise((r) => setTimeout(r, 10))
    return sub.queue[sub.queue.length - 1] as Record<string, unknown>
  }
  const answerCreate = async (sessionId: string) => {
    const item = await nextRequest()
    channel.respond(item.requestId as string, { value: { sessionId } }, 'peer-main')
  }
  // f1 HIGH#2 探针用：应答队列里第 n 个请求（不等新请求出现）。
  const answerNth = (index: number, sessionId: string) => {
    const item = sub.queue[index] as Record<string, unknown>
    channel.respond(item.requestId as string, { value: { sessionId } }, 'peer-main')
  }
  return { definition, options, orch, slots, sub, fire, answerCreate, answerNth, nextRequest }
}

describe('P6-24 create_bot 参数面（execute 校验 + 请求体 + 冲突）', () => {
  const dir = tmkdir('bot-p624-create-')
  const writeBots = () => writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'session-main', recipes: {} }))

  it('subdir / artifacts 进入工具 schema（模型可见参数）与请求体（artifacts 不出 SDK）', () => {
    writeBots()
    const { definition } = registeredTool(dir)
    expect(definition.name).toBe(CREATE_BOT_TOOL)
    const props = definition.parameters.properties as Record<string, unknown>
    expect(props.subdir).toBeTruthy()
    expect(props.artifacts).toBeTruthy()
    expect(definition.parameters.required).toEqual(['name', 'prompt'])
  })

  it('非法 subdir / artifacts → invalid-args，0 次通道请求、不占容量', async () => {
    writeBots()
    const { definition, sub, slots } = registeredTool(dir)
    for (const bad of [
      { name: 'w', prompt: 'p', subdir: 'a/b' },
      { name: 'w', prompt: 'p', subdir: '..' },
      { name: 'w', prompt: 'p', artifacts: '/abs' },
      { name: 'w', prompt: 'p', artifacts: 'x.txt' },
      { name: 'w', prompt: 'p', artifacts: ['a/../b'] },
      { name: 'w', prompt: 'p', other: 1 },
    ]) {
      await expect(definition.execute(bad, { agent: { id: 'session-main' } })).rejects.toMatchObject({ code: 'pbots/invalid-args' })
    }
    expect(sub.queue.length).toBe(0)
    expect(slots.used).toBe(0)
  })

  it('合法 subdir 随请求体发给 main（artifacts 留在 SDK）；未声明 subdir/artifacts → 结果带分区提醒', async () => {
    writeBots()
    const { definition, answerCreate, fire, nextRequest } = registeredTool(dir)
    const p1 = definition.execute({ name: 'w1', prompt: 'p', subdir: 'out', artifacts: ['a.txt'] }, { agent: { id: 'session-main' } })
    const item = await nextRequest()
    expect(item.subdir).toBe('out')
    expect('artifacts' in item).toBe(false)
    await answerCreate('session-w1')
    const r1 = await p1
    expect(r1.sessionId).toBe('session-w1')
    expect(r1.advisory).toBeUndefined()
    // worker turn/end 释放 claims（fire session/event）
    fire('session/event', { id: 'session-w1' }, { type: 'turn/end' })

    const p2 = definition.execute({ name: 'w2', prompt: 'p' }, { agent: { id: 'session-main' } })
    await answerCreate('session-w2')
    const r2 = await p2
    expect(typeof r2.advisory).toBe('string')
    expect(r2.advisory).toContain('subdir')
    fire('session/event', { id: 'session-w2' }, { type: 'turn/end' })
  })

  it('D-3-③：与在跑 worker 的声明产物交叉 → pbots/busy，不占容量；不同文件放行；turn/end 后可再占', async () => {
    writeBots()
    const { definition, sub, answerCreate, fire, slots } = registeredTool(dir)
    // w1 占住 out/a.txt（assignment 回合在跑：create 后不 fire turn/end）
    const p1 = definition.execute({ name: 'w1', prompt: 'p', artifacts: ['out/a.txt', 'shared/b.ts'] }, { agent: { id: 'session-main' } })
    await answerCreate('session-w1')
    await p1
    expect(slots.used).toBe(1)

    // w2 交叉 out/a.txt → 拒（0 通道请求、容量不涨）
    await expect(definition.execute({ name: 'w2', prompt: 'p', artifacts: ['out/a.txt'] }, { agent: { id: 'session-main' } }))
      .rejects.toMatchObject({ code: 'pbots/busy' })
    expect(sub.queue.length).toBe(1)
    expect(slots.used).toBe(1)

    // w2 不同文件 → 放行
    const p2 = definition.execute({ name: 'w2', prompt: 'p', artifacts: ['out/c.txt'] }, { agent: { id: 'session-main' } })
    await answerCreate('session-w2')
    await p2
    expect(slots.used).toBe(2)

    // w1 回合结束 → claims 释放，w3 再占 out/a.txt 可过
    fire('session/event', { id: 'session-w1' }, { type: 'turn/end' })
    const p3 = definition.execute({ name: 'w3', prompt: 'p', artifacts: ['out/a.txt'] }, { agent: { id: 'session-main' } })
    await answerCreate('session-w3')
    await p3
    fire('session/event', { id: 'session-w2' }, { type: 'turn/end' })
    fire('session/event', { id: 'session-w3' }, { type: 'turn/end' })
    expect(slots.used).toBe(0)
  })

  it('不同 subdir 分区不冲突（Q-024 任务自适应：新开子目录 = 写入责任划分）', async () => {
    writeBots()
    const { definition, answerCreate, fire } = registeredTool(dir)
    const p1 = definition.execute({ name: 'w1', prompt: 'p', subdir: 's1', artifacts: ['a.txt'] }, { agent: { id: 'session-main' } })
    await answerCreate('session-w1')
    await p1
    const p2 = definition.execute({ name: 'w2', prompt: 'p', subdir: 's2', artifacts: ['a.txt'] }, { agent: { id: 'session-main' } })
    await answerCreate('session-w2')
    await p2
    fire('session/event', { id: 'session-w1' }, { type: 'turn/end' })
    fire('session/event', { id: 'session-w2' }, { type: 'turn/end' })
  })

  it.each(['channel', 'delivery'])('f1 HIGH#2：%s 失败后声明与容量都释放，不阻塞下次同文件创建', async (phase) => {
    writeBots()
    const { definition, orch, sub, answerNth, slots, fire } = registeredTool(dir)
    if (phase === 'delivery') orch.delivery.send = async () => { throw new Error('simulated delivery failure') }
    const creating = definition.execute({ name: 'w', prompt: 'p', artifacts: ['shared.txt'] }, { agent: { id: 'session-main' } })
    const rejected = expect(creating).rejects.toMatchObject({ code: phase === 'channel' ? 'main-unavailable' : 'pbots/orchestration-failed' })
    await expect.poll(() => sub.queue.length).toBe(1)
    if (phase === 'channel') orch.channel.detach()
    else answerNth(0, 'session-failed')
    await rejected
    expect(slots.used).toBe(0)
    expect(orch.claims.size).toBe(0)
    orch.channel.attach(sub)
    orch.delivery.send = async () => {}
    const retry = definition.execute({ name: 'w2', prompt: 'p', artifacts: ['shared.txt'] }, { agent: { id: 'session-main' } })
    await expect.poll(() => sub.queue.length).toBe(2)
    answerNth(1, 'session-retry')
    await retry
    fire('session/event', { id: 'session-retry' }, { type: 'turn/end' })
    expect(slots.used).toBe(0)
    expect(orch.claims.size).toBe(0)
  })

  // VERIFY-P6-24 HIGH#2：并发两个 create 都显式声明同一 artifacts，检查与登记
  // 跨 await（登记在 channel.request 返回后）→ 互相看不见，双双 created。
  it('f1 HIGH#2：并发同 artifacts 声明 → 恰一个进通道 created，另一个 pbots/busy（检查+登记原子化）', async () => {
    writeBots()
    const { definition, sub, answerNth, fire, slots } = registeredTool(dir)
    let rejectedBeforeReply = 0
    const jobs = ['w1', 'w2'].map((name) =>
      definition.execute({ name, prompt: 'p', artifacts: ['shared.txt'] }, { agent: { id: 'session-main' } })
        .catch((error: unknown) => { rejectedBeforeReply++; throw error }),
    )
    // 身份读取是异步 IO，谁先取得占位不固定；立即接住两边的拒绝，不能假定 w1 先到。
    const settled = Promise.allSettled(jobs)
    await expect.poll(() => sub.queue.length + rejectedBeforeReply).toBe(2)
    // 基点红时也应答所有请求，避免遗留 30s 通道计时器掩盖真正的断言失败。
    sub.queue.forEach((_, i) => answerNth(i, `session-w${i + 1}`))
    const results = await settled
    expect(sub.queue.length, '同文件并发只应有一次 main 创建请求').toBe(1)
    const created = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(created).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'pbots/busy' })
    expect(slots.used).toBe(1)
    fire('session/event', { id: 'session-w1' }, { type: 'turn/end' })
    expect(slots.used).toBe(0)
    // 释放后同文件可再占（占位确已释放，不泄漏）
    const p3 = definition.execute({ name: 'w3', prompt: 'p', artifacts: ['shared.txt'] }, { agent: { id: 'session-main' } })
    await expect.poll(() => sub.queue.length).toBe(2) // 释放后确实进入通道，而非等一个未 resolve 的 timer
    answerNth(1, 'session-w3')
    await p3
    fire('session/event', { id: 'session-w3' }, { type: 'turn/end' })
  })
})

// ---- D-3-①：worker 的 write/edit 拒写指令文件 ----

describe('P6-24 instructionFileDenial（D-3-①）', () => {
  it('四个指令文件名（含 .local 变体，上游 config.ts:12-13 候选全集）按 basename 拒；其他文件名放行', () => {
    expect(INSTRUCTION_FILES).toEqual(new Set(['AGENTS.md', 'CLAUDE.md', 'AGENTS.local.md', 'CLAUDE.local.md']))
    for (const name of ['AGENTS.md', 'CLAUDE.md', 'AGENTS.local.md', 'CLAUDE.local.md']) {
      const verdict = instructionFileDenial(join('/ws/main', name))
      expect(verdict?.kind).toBe('deny')
      expect(verdict?.reason).toContain('instruction files')
      // 任意深度同名都拒（agent-instructions 会沿 cwd 祖先链与触达目录加载）
      expect(instructionFileDenial(join('/ws/main', 'sub', name))?.kind).toBe('deny')
    }
    expect(instructionFileDenial('/ws/main/AGENTS.md.bak')).toBe(null)
    expect(instructionFileDenial('/ws/main/notes.md')).toBe(null)
    expect(instructionFileDenial(undefined)).toBe(null)
  })

  it('软链逃逸：raw 名无害但 resolve 后指向指令文件 → 拒（判定用 resolved，防 rename-then-write）', () => {
    expect(instructionFileDenial('link.md', '/ws/main/AGENTS.md')?.kind).toBe('deny')
    expect(instructionFileDenial('link.md', '/ws/main/notes.md')).toBe(null)
    // resolve 失败（undefined）→ 退回 raw basename 判定
    expect(instructionFileDenial('AGENTS.md', undefined)?.kind).toBe('deny')
  })

  it('basename 级拒绝不误伤同名目录中的普通文件', () => {
    expect(instructionFileDenial('/ws/AGENTS.md/notes.md', '/ws/AGENTS.md/notes.md')).toBe(null)
  })

  // VERIFY-P6-24 HIGH#1：raw 名本身是指令文件（反向软链 AGENTS/CLAUDE 名 → 普通
  // 文件）时，resolved 存在不能舍弃 raw——软链任一端命中即拒，否则 edit 经
  // CLAUDE.local.md 实改 innocent.md 的指令内容。
  it('f1 HIGH#1 反向软链：raw 与 resolved 两端 basename 都过清单，任一命中即拒', () => {
    expect(instructionFileDenial('CLAUDE.local.md', '/ws/main/innocent.md')?.kind).toBe('deny')
    expect(instructionFileDenial(join('/ws/main', 'AGENTS.md'), '/ws/main/innocent.md')?.kind).toBe('deny')
    expect(instructionFileDenial(join('/ws/main', 'sub', 'AGENTS.local.md'), '/ws/main/sub/innocent.md')?.kind).toBe('deny')
    // 两端都无害 → 放行（不误伤普通文件；中间段是普通目录名不受影响）
    expect(instructionFileDenial('/ws/main/notes.md', '/ws/main/other.md')).toBe(null)
    expect(instructionFileDenial('/ws/AGENTS_tree/x.md', '/ws/AGENTS_tree/x.md')).toBe(null)
  })
})

describe('P6-24 registerEnvelope：worker 的 write/edit 指令文件拦截接线', () => {
  const boot = (bots?: Record<string, { createdBy: string }>) => {
    const dir = mkdtempSync(join(tmpdir(), 'bot-p624-env-'))
    if (bots) writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'm1', recipes: {}, bots }))
    let listener: { fn: (exec: any, next: () => any) => Promise<any> } | undefined
    const ctx = {
      on: (name: string, fn: any) => { listener = { fn } },
      get: (name: string) => {
        if (name === 'fs') {
          return {
            resolve: async (raw: string) => ({ targetKey: raw.endsWith('link.md') ? '/ws/main/AGENTS.md' : raw }),
          }
        }
        return null
      },
    }
    registerEnvelope(ctx as never, { config: { dataDir: dir } } as never)
    return { call: (exec: any) => listener!.fn(exec, () => ({ kind: 'pass-through' })) }
  }

  it('worker：write/edit 指令文件拒（ctx.fs.resolve 后按 resolved basename）；普通文件放行', async () => {
    const g = boot({ w1: { createdBy: 'm1' } })
    for (const tool of ['write', 'edit']) {
      const denied = await g.call({ name: tool, arguments: { file_path: '/ws/main/AGENTS.md' }, agent: { id: 'w1' } })
      expect(denied).toMatchObject({ kind: 'deny' })
      expect((denied as { reason: string }).reason).toContain('instruction files')
    }
    const ok = await g.call({ name: 'write', arguments: { file_path: '/ws/main/notes.md' }, agent: { id: 'w1' } })
    expect(ok).toEqual({ kind: 'pass-through' })
    // 软链逃逸：raw 是 link.md，resolved 指向 AGENTS.md → 拒
    const viaLink = await g.call({ name: 'write', arguments: { file_path: '/ws/main/link.md' }, agent: { id: 'w1' } })
    expect(viaLink).toMatchObject({ kind: 'deny' })
  })

  it('主 bot 会话不受限（用户可让主 bot 写自己的 AGENTS.md）；read 不拦', async () => {
    const g = boot({ w1: { createdBy: 'm1' } })
    const ok = await g.call({ name: 'write', arguments: { file_path: '/ws/main/AGENTS.md' }, agent: { id: 'm1' } })
    expect(ok).toEqual({ kind: 'pass-through' })
    const readOk = await g.call({ name: 'read', arguments: { file_path: '/ws/main/AGENTS.md' }, agent: { id: 'w1' } })
    expect(readOk).toEqual({ kind: 'pass-through' })
  })
})
