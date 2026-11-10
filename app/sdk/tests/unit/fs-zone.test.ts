// P6-25.f1 单测：文件工具的区域判定下沉到执行层（REVIEW-P6-25-B B1/B2）。
// 红基线 = work/p6-orchestration/evidence/P6-25-rvw/toctou.test.mjs 的确定性接缝
// （pre-execute 判定返回后、execute 前换链），断言翻转为「拒」：写不落区外、读
// 不读出区外。真实组件：shell-ask（pre-execute 判定）+ dsh-tool-fs write/edit/read
// 的 execute + ZoneCheckedFileSystem（继承上游 SandboxedFileSystem）+
// fs-observation-policy + tools/execute 执行期复判。替身只有 ctx 外壳（同探针）。
// 新增格（review 未测，验收②）：同一窗口把目录换成指向 NEVER 根（临时目录里
// 构造的假凭证目录，不碰真实凭证）→ 读写都拒。
// 既有语义保持格（验收③）：区内读写照常；区外读走完出卡批准后照常读到
// （write-outside ② 的单测对照——执行层不得把已批准的区外读静默改拒）。
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import * as shellAsk from '../../src/policy/shell-ask.mjs'
import { applyZoneRecheck, ZoneCheckedFileSystem } from '../../src/policy/fs-zone.mjs'
import { noteZoneVerdict } from '../../src/policy/resolve.mjs'
import { tmkdir } from '../support/tmp-sweep.ts'

// 与生产模块（src/policy/fs-zone.mjs）同一条解析链：经 @deepseek-ai/dsh（本仓
// 直接依赖）的 node_modules 取上游件，与 dsh-base 运行时加载的是同一 store 实例。
const requireFromDsh = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const toolFs = await import(requireFromDsh.resolve('@deepseek-ai/dsh-tool-fs')) as { apply(ctx: unknown, config: unknown): void }
const obsPolicy = await import(requireFromDsh.resolve('@deepseek-ai/dsh-fs-observation-policy')) as { apply(ctx: unknown): void }

const ALLOW = Symbol('next() = shell-ask 放行')
const WRITE_OUT = 'p2sdk policy: write-outside-workspace denied (the target is outside this session workspace; the call does not run)'
const READ_OUT_ASK = 'p2sdk policy: reading files outside the workspace requires user approval'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
})

interface CallOutcome {
  decision: unknown
  result?: { isError?: boolean; content?: Array<{ type: string; text?: string }>; path?: string }
  error?: { code?: string; message?: string }
}

function harness(opts: { neverRoots?: string[]; tiers?: unknown } = {}): {
  root: string
  ws: string
  outside: string
  far: string
  call(name: string, args: object, hook?: () => void, mode?: { approve?: boolean; inner?: boolean }): Promise<CallOutcome>
  swapTo(target: string): void
  breakResolve(): void
} {
  const root = tmkdir('bot-p625f1-unit-')
  cleanups.push(() => rmSync(root, { recursive: true, force: true }))
  const ws = join(root, 'ws')
  const outside = join(root, 'outside') // 区外 + 宿主 /tmp 下 = fence 可写根（B1 语义）
  const far = join(root, 'far') // 区外（读不经 fence，任意区外目录都算）
  mkdirSync(join(ws, 'sub'), { recursive: true })
  mkdirSync(outside)
  mkdirSync(far)

  const policy = { mode: 'workspace-write', workspaceRoot: ws }
  const sandboxPolicy = { defaultMode: 'workspace-write', resolve: () => policy }
  // SandboxedFileSystem 的方法全部真实；只绕开 cordis Service 构造器（字段与构造器
  // 一致，同探针）。
  const fs = Object.create(ZoneCheckedFileSystem.prototype) as ZoneCheckedFileSystem
  Object.assign(fs, {
    config: { cwd: ws, diffBasisMaxBytes: 1 << 20, neverRoots: opts.neverRoots ?? [] },
    p2sdkNeverRoots: opts.neverRoots ?? [],
    internals: {},
    locks: new Map(),
    defaultMode: 'workspace-write',
  })
  const listeners = new Map<string, Array<(a: unknown, b: unknown) => unknown>>()
  const tools = new Map<string, { execute(args: unknown, exec: unknown): Promise<unknown> }>()
  const ctx = {
    fs,
    sandboxPolicy,
    workingDirectory: { ensure: async () => ws },
    systemPrompt: { section(): void {}, getSectionOrder: () => 0 },
    tools: { register: (t: { name: string; execute: (a: unknown, e: unknown) => Promise<unknown> }) => tools.set(t.name, t), get: (n: string) => tools.get(n) },
    get: (n: string) => ({ fs, sandboxPolicy, workingDirectory: ctx.workingDirectory } as Record<string, unknown>)[n],
    on: (ev: string, fn: (a: unknown, b: unknown) => unknown) => listeners.set(ev, [...(listeners.get(ev) ?? []), fn]),
    effect(): void {},
    inject(): void {},
    waterfall: async (ev: string, target: unknown, exec: unknown, fallback: () => unknown) => {
      const fns = listeners.get(ev) ?? []
      return fns.length ? fns[0](target, exec) : fallback()
    },
    emit: (ev: string, ...a: unknown[]) => (listeners.get(ev) ?? []).forEach((fn) => fn(...a)),
  }
  obsPolicy.apply(ctx)
  toolFs.apply(ctx, { read: true, readImage: false, write: true, edit: true, readLimit: 2000, readMaxLineLength: 2000, readMaxBytes: 1 << 20, readStreamMinSize: 1 << 20 })
  applyZoneRecheck(ctx as never, opts.neverRoots ?? [])
  // policyStatePaths 指向从未存在的文件 = L-7 R6「从未 provision」→ 文件工具门开（生产默认态）。
  shellAsk.apply(ctx as never, { policyStatePaths: [join(root, 'state', 'policy-state.json')], ...(opts.tiers === undefined ? {} : { tiers: opts.tiers }) })
  const preExecute = listeners.get('tools/pre-execute')![0]!
  const zoneWrapper = listeners.get('tools/execute')![0]!
  const agent = { session: { header: { id: 's1' } } } // 同一会话对象（observation-policy 按 session 对象记账）
  const exec = (name: string, args: object) => ({ name, arguments: args, agent, signal: new AbortController().signal })

  /** 一次完整调用，按真实管线顺序：pre-execute →（ask 经 approve 视为已批）→ [hook] → tools/execute 包装 → execute。 */
  async function call(name: string, args: object, hook?: () => void, mode: { approve?: boolean; inner?: boolean } = {}): Promise<CallOutcome> {
    const e = exec(name, args)
    const decision = await (preExecute(e, () => ALLOW) as unknown)
    if (decision !== ALLOW && !mode.approve) return { decision }
    if (hook && !mode.inner) hook() // pre 接缝
    const body = () => {
      if (mode.inner) hook?.() // P6-26：区域包装已通过，上游工具尚未 resolve/open。
      return tools.get(name)!.execute(args, e)
    }
    try {
      const result = await (zoneWrapper ? zoneWrapper(e, body) : body()) as CallOutcome['result']
      return { decision, result }
    } catch (error) {
      return { decision, error: error as { code?: string; message?: string } }
    }
  }

  /** 把 ws/sub 换成指向 target 的符号链接（模型可经工作区内 bash 做到：工作区 rw bind）。 */
  const swapTo = (target: string): void => {
    renameSync(join(ws, 'sub'), join(ws, 'sub.orig'))
    symlinkSync(target, join(ws, 'sub'))
  }
  return { root, ws, outside, far, call, swapTo, breakResolve() { fs.resolve = async () => { throw new Error('test resolve unavailable') } } }
}

const dump = (r: CallOutcome): string => JSON.stringify(r.result ?? r.error?.message ?? '')

/** 管线级写拒断言：tools/execute 复判先拒（isError 结果）或 fs 后端 checkedTarget 抛 FS_PERMISSION_DENIED，都算拒。 */
function expectWriteDenied(r: CallOutcome, literal: string, label: string): void {
  const viaWrapper = (r.result as { isError?: boolean; error?: { message?: string } } | undefined)?.isError === true
  const viaBackend = r.error?.code === 'FS_PERMISSION_DENIED'
  expect(viaWrapper || viaBackend, `${label}：两层之一必须拒，实际 ${JSON.stringify(r.result ?? r.error)}`).toBe(true)
  const message = viaWrapper ? String((r.result as { error?: { message?: string } }).error?.message) : String(r.error?.message)
  expect(message).toContain(literal)
}

/** 恢复真 sub 目录（换链后）。 */
function restore(ws: string): void {
  renameSync(join(ws, 'sub'), join(ws, 'sub.link'))
  renameSync(join(ws, 'sub.orig'), join(ws, 'sub'))
}

// ── 对照格（P6-25 语义不变 + 区内照常 + Q-013 区外读语义保持）──

it('对照：无替换时 write/read 落在工作区内、内容可读回（区内照常，验收③）', async () => {
  const h = harness()
  const w = await h.call('write', { file_path: 'sub/a.txt', content: 'A' })
  expect(w.decision).toBe(ALLOW)
  expect(w.error, String(w.error)).toBeUndefined()
  expect(readFileSync(join(h.ws, 'sub', 'a.txt'), 'utf8')).toBe('A')
  const rd = await h.call('read', { file_path: 'sub/a.txt' })
  expect(rd.decision).toBe(ALLOW)
  expect(rd.error).toBeUndefined()
  expect(dump(rd)).toContain('A')
})

it('对照：判定前已是区外软链 → shell-ask 直接 deny（P6-25 格④不回退）', async () => {
  const h = harness()
  h.swapTo(h.outside)
  const r = await h.call('write', { file_path: 'sub/a.txt', content: 'A' })
  expect(r.decision).toEqual({ kind: 'deny', reason: WRITE_OUT })
  expect(existsSync(join(h.outside, 'a.txt'))).toBe(false)
})

it('对照：区外读出卡批准后照常读到（Q-013 语义保持——执行层不改拒已批准的区外读）', async () => {
  const h = harness()
  writeFileSync(join(h.outside, 'approved.txt'), 'OUTSIDE-APPROVED')
  symlinkSync(h.outside, join(h.ws, 'link'))
  // 判定前就是区外（不经换链）：pre-execute 出卡 readOut；approve 模拟用户批准后的执行段
  const r = await h.call('read', { file_path: 'link/approved.txt' }, undefined, { approve: true })
  expect(r.decision).toEqual({ kind: 'ask', reason: READ_OUT_ASK })
  expect(r.error, String(r.error)).toBeUndefined()
  expect(dump(r)).toContain('OUTSIDE-APPROVED')
})

it.each(['outside', 'credential'])('P6-26 inner 接缝读 %s：复判之后换链仍拒，不能返回区外内容', async (destination) => {
  const home = tmkdir('bot-p626-home-')
  cleanups.push(() => rmSync(home, { recursive: true, force: true }))
  const credential = join(home, '.ssh')
  mkdirSync(credential)
  const h = harness({ neverRoots: [credential] })
  const to = destination === 'credential' ? credential : h.outside
  writeFileSync(join(h.ws, 'sub', 'secret.txt'), 'INSIDE')
  writeFileSync(join(to, 'secret.txt'), 'FAKE-CRED-MARKER-OUTSIDE')
  const rd = await h.call('read', { file_path: 'sub/secret.txt' }, () => h.swapTo(to), { inner: true })
  expect(rd.decision).toBe(ALLOW)
  expect(rd.result?.isError || rd.error?.code === 'FS_PERMISSION_DENIED', dump(rd)).toBeTruthy()
  expect(dump(rd)).not.toContain('FAKE-CRED-MARKER')
})

// ── B1（REVIEW-P6-25-B major）：写类，判定后换链 → 执行层必须拒 ──

it('Q1 write：pre-execute 放行后、execute 前换链到区外（fence 可写根内）→ 拒、区外无文件', async () => {
  const h = harness()
  const r = await h.call('write', { file_path: 'sub/race.txt', content: 'RACED' }, () => h.swapTo(h.outside))
  expect(r.decision).toBe(ALLOW)
  expectWriteDenied(r, 'write-outside-workspace', 'Q1 write')
  expect(existsSync(join(h.outside, 'race.txt')), '写入不得落到区外（B1）').toBe(false)
  expect(existsSync(join(h.ws, 'sub.orig', 'race.txt'))).toBe(false)
})

it('Q1 read+edit：两步都在判定后换链 → 区外已有文件不被读出/改写', async () => {
  const h = harness()
  writeFileSync(join(h.outside, 'victim.txt'), 'hello\n')
  writeFileSync(join(h.ws, 'sub', 'victim.txt'), 'hello\n') // 区内同名诱饵，使判定看到的是区内文件
  // 第一步：read 在判定后换链 → 执行层拒绝，不读出区外内容
  const rd = await h.call('read', { file_path: 'sub/victim.txt' }, () => h.swapTo(h.outside))
  expect(rd.decision).toBe(ALLOW)
  expect(rd.error).toBeUndefined()
  expect((rd.result as { isError?: boolean }).isError, '读不得无卡读出区外（B2）').toBe(true)
  expect(dump(rd)).not.toContain('hello')
  restore(h.ws)
  // 第二步：edit 在判定后换回区外链 → 区外文件不被改写
  const ed = await h.call('edit', { file_path: 'sub/victim.txt', old_string: 'hello', new_string: 'PWNED' }, () => {
    renameSync(join(h.ws, 'sub'), join(h.ws, 'sub.orig'))
    renameSync(join(h.ws, 'sub.link'), join(h.ws, 'sub'))
  })
  expect(ed.decision).toBe(ALLOW)
  expectWriteDenied(ed, 'write-outside-workspace', 'Q1 edit')
  expect(readFileSync(join(h.outside, 'victim.txt'), 'utf8'), '区外内容不变').toBe('hello\n')
})

// ── B2（REVIEW-P6-25-B 范围外 major）：读类不经 fence，同一窗口可读任意区外 ──

it('旁支 read：判定后换链到非 fence 相关区外目录 → 执行层拒绝、不返回区外内容', async () => {
  const h = harness()
  writeFileSync(join(h.far, 'secret.txt'), 'FAR-SECRET-CONTENT')
  const rd = await h.call('read', { file_path: 'sub/secret.txt' }, () => h.swapTo(h.far))
  expect(rd.decision).toBe(ALLOW)
  expect(rd.error).toBeUndefined()
  expect((rd.result as { isError?: boolean }).isError, '读不得无卡读出区外（B2）').toBe(true)
  expect(dump(rd)).not.toContain('FAR-SECRET-CONTENT')
})

// ── 验收②（review 未测）：同一窗口换链指向 NEVER 根（假凭证目录）→ 读写都拒 ──

it('NEVER 根（验收②）：判定后换链到假凭证目录 → read 拒（不读出内容）且 write 拒（不落文件）', async () => {
  const neverRoot = tmkdir('bot-p625f1-home-')
  cleanups.push(() => rmSync(neverRoot, { recursive: true, force: true }))
  const fakeCred = join(neverRoot, '.ssh')
  mkdirSync(fakeCred)
  writeFileSync(join(fakeCred, 'id_rsa'), 'FAKE-CRED-MARKER')
  const h = harness({ neverRoots: [fakeCred] })
  // read：判定后换链 → 执行层拒，不读出凭证内容
  const rd = await h.call('read', { file_path: 'sub/id_rsa' }, () => h.swapTo(fakeCred))
  expect(rd.decision).toBe(ALLOW)
  expect((rd.result as { isError?: boolean }).isError, 'NEVER 根读必须拒').toBe(true)
  expect(dump(rd)).not.toContain('FAKE-CRED-MARKER')
  // write：恢复真目录让判定看到区内，再换链 → fs 后端拒，凭证目录不落文件
  restore(h.ws)
  const wr = await h.call('write', { file_path: 'sub/newkey', content: 'x' }, () => {
    renameSync(join(h.ws, 'sub'), join(h.ws, 'sub.orig'))
    renameSync(join(h.ws, 'sub.link'), join(h.ws, 'sub'))
  })
  expect(wr.decision).toBe(ALLOW)
  expectWriteDenied(wr, 'never-root', 'NEVER write')
  expect(existsSync(join(fakeCred, 'newkey'))).toBe(false)
})

it.each([undefined, 'garbage'])('区外读获批后换链到假凭证目录仍拒（tiers=%s）', async (tiers) => {
  const home = tmkdir('bot-p625f1-home-')
  cleanups.push(() => rmSync(home, { recursive: true, force: true }))
  const fakeCred = join(home, '.ssh')
  mkdirSync(fakeCred)
  writeFileSync(join(fakeCred, 'id_rsa'), 'FAKE-CRED-APPROVED-READ')
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const h = harness({ neverRoots: [fakeCred], tiers })
    writeFileSync(join(h.outside, 'id_rsa'), 'APPROVED-OUTSIDE')
    const link = join(h.ws, 'approved-link')
    symlinkSync(h.outside, link)
    const rd = await h.call('read', { file_path: 'approved-link/id_rsa' }, () => {
      renameSync(link, join(h.ws, 'old-link'))
      symlinkSync(fakeCred, link)
    }, { approve: true })
    expect(rd.decision).toMatchObject({ kind: 'ask' })
    expect(rd.result?.isError).toBe(true)
    expect(dump(rd)).toContain('never-root')
    expect(dump(rd)).not.toContain('FAKE-CRED-APPROVED-READ')
  } finally {
    err.mockRestore()
  }
})

it('已批准区外读在执行期解析失败时拒绝，不能跳过 NEVER 校验', async () => {
  const h = harness()
  const rd = await h.call('read', { file_path: join(h.outside, 'a.txt') }, () => h.breakResolve(), { approve: true })
  expect(rd.decision).toMatchObject({ kind: 'ask' })
  expect(rd.error).toBeUndefined()
  expect(rd.result?.isError).toBe(true)
})

// ── Q2（REVIEW-B 已验证的判定无缓存，保持）：换链后下一次判定照常拒 ──

it('Q2 无缓存：第一次 write 放行后替换目录，第二次 write 重新判定 → deny（P6-25 不回退）', async () => {
  const h = harness()
  const first = await h.call('write', { file_path: 'sub/one.txt', content: '1' })
  expect(first.decision).toBe(ALLOW)
  expect(readFileSync(join(h.ws, 'sub', 'one.txt'), 'utf8')).toBe('1')
  h.swapTo(h.outside)
  const second = await h.call('write', { file_path: 'sub/two.txt', content: '2' })
  expect(second.decision).toEqual({ kind: 'deny', reason: WRITE_OUT })
  expect(existsSync(join(h.outside, 'two.txt'))).toBe(false)
  const again = await h.call('write', { file_path: 'sub/one.txt', content: '1b' })
  expect(again.decision).toEqual({ kind: 'deny', reason: WRITE_OUT })
})

it('执行期 fs 服务不可用时关闭文件调用；没有区域记录的内部调用不受影响', async () => {
  let execute!: (exec: object, next: () => symbol) => Promise<unknown>
  applyZoneRecheck({ on: (_event: string, fn: typeof execute) => { execute = fn }, get: () => null }, [])
  const internal = {}
  expect(await execute(internal, () => ALLOW)).toBe(ALLOW)
  const fileCall = { name: 'read', arguments: { file_path: 'a.txt' } }
  noteZoneVerdict(fileCall, { kind: 'workspace-read', allInside: true })
  expect(await execute(fileCall, () => ALLOW)).toMatchObject({ isError: true })
})

it('后端拒绝向模型保留 code 前缀和准确原因，不泄漏宿主路径或建议升权', async () => {
  const h = harness()
  const checkedTarget = ZoneCheckedFileSystem.prototype.checkedTarget
  const seam = vi.spyOn(ZoneCheckedFileSystem.prototype, 'checkedTarget').mockImplementationOnce(async function (target, policy) {
    h.swapTo(h.outside) // 包装层已判定区内，后端 fresh resolve 尚未执行。
    return checkedTarget.call(this, target, policy)
  })
  try {
    const r = await h.call('write', { file_path: 'sub/denied.txt', content: 'X' })
    expect(r.decision).toBe(ALLOW)
    expect(r.error?.message).toBe(`code: ${WRITE_OUT}`)
    expect(r.error?.message).not.toMatch(/escalation|sandbox_permissions|justification/i)
    expect(r.error?.message).not.toContain(h.root)
    expect(existsSync(join(h.outside, 'denied.txt'))).toBe(false)
  } finally {
    seam.mockRestore()
  }
})

// ── 后端直打格：钉 ZoneCheckedFileSystem.checkedTarget 本身（不经 tools/execute
//    包装——管线格里包装层先拒，本组证明第二层独立成立）──

it('后端直打：checkedTarget 对区外/NEVER 目标抛 FS_PERMISSION_DENIED，区内照常写入', async () => {
  const root = tmkdir('p625f1-backend-')
  cleanups.push(() => rmSync(root, { recursive: true, force: true }))
  const ws = join(root, 'ws')
  const outside = join(root, 'outside')
  const neverRoot = join(root, 'ssh')
  mkdirSync(join(ws, 'sub'), { recursive: true })
  mkdirSync(outside)
  mkdirSync(neverRoot)
  const fsBackend = Object.create(ZoneCheckedFileSystem.prototype) as ZoneCheckedFileSystem
  Object.assign(fsBackend, {
    config: { cwd: ws, diffBasisMaxBytes: 1 << 20, neverRoots: [neverRoot] },
    p2sdkNeverRoots: [neverRoot],
    internals: {},
    locks: new Map(),
    defaultMode: 'workspace-write',
  })
  const policy = (mode: string) => ({ mode, workspaceRoot: ws })
  const write = async (path: string, mode: string) =>
    fsBackend.writeText(await fsBackend.resolve(path, { cwd: ws }), 'X', undefined, undefined, policy(mode) as never)

  await write('sub/inside.txt', 'workspace-write')
  expect(readFileSync(join(ws, 'sub', 'inside.txt'), 'utf8')).toBe('X')

  await expect(write(join(outside, 'x.txt'), 'workspace-write'), '区外（含宿主 /tmp，fence 会放行）→ 后端拒')
    .rejects.toMatchObject({ code: 'FS_PERMISSION_DENIED', message: expect.stringContaining('write-outside-workspace') })
  await expect(fsBackend.writeText(await fsBackend.resolve(join(outside, 'extra.txt')), 'X', undefined, undefined,
    { ...policy('workspace-write'), additionalWritableRoots: [outside] } as never), '显式额外可写根也不能代替本会话工作区')
    .rejects.toMatchObject({ code: 'FS_PERMISSION_DENIED', message: expect.stringContaining('write-outside-workspace') })
  await expect(write(join(neverRoot, 'y.txt'), 'workspace-write'), 'NEVER 根 → 后端拒')
    .rejects.toMatchObject({ code: 'FS_PERMISSION_DENIED', message: expect.stringContaining('never-root') })
  await expect(write(join(outside, 'z.txt'), 'danger-full-access'), '升权档区外：P6-25 起不存在合法区外写（pre-execute 硬拒在先），fresh 区外只能是换链 → 拒')
    .rejects.toMatchObject({ code: 'FS_PERMISSION_DENIED', message: expect.stringContaining('write-outside-workspace') })
  await expect(write(join(neverRoot, 'z.txt'), 'danger-full-access'), '升权档也不写凭证根')
    .rejects.toMatchObject({ code: 'FS_PERMISSION_DENIED', message: expect.stringContaining('never-root') })
  await write('sub/escalated.txt', 'danger-full-access')
  expect(readFileSync(join(ws, 'sub', 'escalated.txt'), 'utf8'), '升权档区内照常').toBe('X')
  expect(existsSync(join(outside, 'x.txt'))).toBe(false)
  expect(existsSync(join(neverRoot, 'y.txt'))).toBe(false)
})
