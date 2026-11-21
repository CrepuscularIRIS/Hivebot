// Q1：shell-ask 写类在依赖缺失 / 抛错时是否关闭。真实 shell-ask.mjs、真实 resolve.mjs、
// 真实 containment；ctx 只是外壳。门开（policy-state 从未 provision = 生产默认态）。
// 另取上游 SandboxPolicyService.prototype.resolve 原样调用，看「header 无 cwd」时的真实回落。
import { mkdtempSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import * as plugin from '/home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs'

const SP = '/home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-sandbox-policy@0.2.2-alpha.2_8bea2fd5758beb21221f1e201a3f020d/node_modules/@deepseek-ai/dsh-sandbox-policy/lib/index.js'
const WS = realpathSync(mkdtempSync('/tmp/bot-p625c-ws-'))
const NEVER_PROVISIONED = { policyStatePaths: [join(WS, '.no-such', 'policy-state.json')] }
const OUT = '/tmp/bot-p625c-out/fc.txt'
const DENY = 'p2sdk policy: write-outside-workspace denied (the target is outside this session workspace; the call does not run)'
const NEXT = Symbol('next')
const next = () => NEXT

const realFs = { resolve: async (raw: string, o: { cwd?: string } = {}) => ({ targetKey: raw.startsWith('/') ? raw : join(o.cwd ?? WS, raw) }) }
const policyWith = (root: string | undefined) => ({ resolve: () => ({ mode: 'workspace-write', ...(root === undefined ? {} : { workspaceRoot: root }) }) })

function listener(services: Record<string, unknown>, config: object = NEVER_PROVISIONED) {
  let l: ((exec: object, n: () => unknown) => Promise<unknown>) | undefined
  plugin.apply({ on: (_e: string, fn: typeof l) => { l = fn }, get: (n: string) => services[n] } as never, config as never)
  return l!
}
const W = (file_path: string) => ({ name: 'write', arguments: { file_path, content: 'x' } })
const rows: Record<string, unknown> = {}
const record = (k: string, v: unknown) => { rows[k] = v; console.log(`[Q1] ${k} => ${JSON.stringify(v)}`) }

it('Q1 baseline: fs+policy healthy → inside next(), outside deny', async () => {
  const l = listener({ fs: realFs, sandboxPolicy: policyWith(WS) })
  const inside = await l(W(join(WS, 'a.txt')), next)
  const outside = await l(W(OUT), next)
  record('baseline.inside', inside === NEXT ? 'next' : inside)
  record('baseline.outside', outside)
  expect(inside).toBe(NEXT)
  expect(outside).toEqual({ kind: 'deny', reason: DENY })
})

it('Q1a ctx.fs 不可用（get 返回 undefined / 无 resolve / ctx.get 不是函数）→ deny', async () => {
  for (const [k, svc] of [['fs=undefined', undefined], ['fs={}', {}], ['fs=null', null]] as const) {
    const r = await listener({ fs: svc, sandboxPolicy: policyWith(WS) })(W(join(WS, 'a.txt')), next)
    record(`a.${k}`, r)
    expect(r).toEqual({ kind: 'deny', reason: DENY })
  }
  let l: ((exec: object, n: () => unknown) => Promise<unknown>) | undefined
  plugin.apply({ on: (_e: string, fn: typeof l) => { l = fn } } as never, NEVER_PROVISIONED as never)
  const r = await l!(W(join(WS, 'a.txt')), next)
  record('a.noCtxGet', r)
  // 无 ctx.get：tiers 照常加载，fs 拿不到 → deny
  expect(r).toEqual({ kind: 'deny', reason: DENY })
})

it('Q1b 路径解析抛错 / 返回畸形 → deny', async () => {
  const throwing = { resolve: async () => { throw new Error('boom') } }
  const malformed = { resolve: async () => ({ nope: 1 }) }
  const nul = { resolve: async () => null }
  for (const [k, fs] of [['throw', throwing], ['malformed', malformed], ['null', nul]] as const) {
    const r = await listener({ fs, sandboxPolicy: policyWith(WS) })(W(join(WS, 'a.txt')), next)
    record(`b.${k}`, r)
    expect(r).toEqual({ kind: 'deny', reason: DENY })
  }
})

it('Q1c 工作区根未知：sandboxPolicy 缺失 / resolve 抛错 / 无 workspaceRoot 字段 → deny', async () => {
  const cases: Array<[string, unknown]> = [
    ['policy=undefined', undefined],
    ['policy.resolve throws', { resolve: () => { throw new Error('x') } }],
    ['no workspaceRoot', policyWith(undefined)],
    ['workspaceRoot non-string', { resolve: () => ({ workspaceRoot: 42 }) }],
  ]
  for (const [k, sp] of cases) {
    const r = await listener({ fs: realFs, sandboxPolicy: sp })(W(join(WS, 'a.txt')), next)
    record(`c.${k}`, r)
    expect(r).toEqual({ kind: 'deny', reason: DENY })
  }
})

it('Q1d 上游真实 resolve：session header 无 cwd → 回落到部署 workspaceRoot（dsh-base 配 process.cwd()），不是「未知」', async () => {
  const { SandboxPolicyService } = await import(SP)
  const deploymentRoot = '/' // 最坏：dsh 进程 cwd 为 /（桌面启动常见）
  const fakeThis = { workspaceRoot: deploymentRoot, defaultMode: 'workspace-write', additionalWritableRoots: undefined, overrideOf: () => undefined }
  const realPolicy = { resolve: (req: object) => SandboxPolicyService.prototype.resolve.call(fakeThis, req) }
  const resolvedNoCwd = realPolicy.resolve({ session: { id: 's', header: {} } })
  const resolvedAgentless = realPolicy.resolve({})
  record('d.upstream.noCwd', resolvedNoCwd)
  record('d.upstream.agentless', resolvedAgentless)
  const l = listener({ fs: realFs, sandboxPolicy: realPolicy })
  const r1 = await l({ ...W(OUT), agent: { session: { id: 's', header: {} } } }, next)
  const r2 = await l(W(OUT), next) // exec.agent === undefined
  record('d.write(/tmp) noCwd', r1 === NEXT ? 'next' : r1)
  record('d.write(/tmp) agentless', r2 === NEXT ? 'next' : r2)
  // 观察值（非断言预期）：header 无 cwd 时 shell-ask 拿到的是部署根，按它判「区内」
  expect([r1 === NEXT, r2 === NEXT]).toEqual([true, true])
})

it('Q1e 档位表损坏（A9 ②）→ 写类区外从 deny 退成 ASK 卡（P6-25「不出卡」在表坏时不成立）', async () => {
  const l = listener({ fs: realFs, sandboxPolicy: policyWith(WS) }, { ...NEVER_PROVISIONED, tiers: { write: 'bogus' } })
  const r = await l(W(OUT), next)
  record('e.corruptTiers.outside', r)
  expect(r).toMatchObject({ kind: 'ask' })
})

it('Q1f 无路径候选（file_path 缺失/非字符串/空串）→ total=0 → next()（交执行层 schema 校验）', async () => {
  const l = listener({ fs: realFs, sandboxPolicy: policyWith(WS) })
  for (const [k, args] of [['missing', { content: 'x' }], ['array', { file_path: [OUT], content: 'x' }], ['empty', { file_path: '', content: 'x' }]] as const) {
    const r = await l({ name: 'write', arguments: args }, next)
    record(`f.${k}`, r === NEXT ? 'next' : r)
    expect(r).toBe(NEXT)
  }
})

it('Q2 MCP 连接器写类工具：mcp__ 前缀 → ASK（出卡）；never 会话 → deny', async () => {
  const l = listener({ fs: realFs, sandboxPolicy: policyWith(WS) })
  const r = await l({ name: 'mcp__filesystem__write_file', arguments: { path: OUT, content: 'x' } }, next)
  record('mcp.write_file', r)
  expect(r).toMatchObject({ kind: 'ask' })
  const never = { config: { policy: 'never' }, overrideOf: () => undefined }
  const ln = listener({ fs: realFs, sandboxPolicy: policyWith(WS), approval: never })
  const rn = await ln({ name: 'mcp__filesystem__write_file', agent: { session: {} }, arguments: { path: OUT, content: 'x' } }, next)
  record('mcp.write_file.never', rn)
  expect(rn).toMatchObject({ kind: 'deny' })
})
