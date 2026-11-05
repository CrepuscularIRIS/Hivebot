// P6-25.f1 verifier 独立探针（不是 builder 的 fs-zone.test.ts）。
// 底本：work/p6-orchestration/evidence/P6-25-rvw/toctou.test.mjs（REVIEW-B 确定性接缝）。
// 改动：①fs 后端换成 worktree 的 ZoneCheckedFileSystem（+ 构造器同款 applyZoneRecheck）；
// ②tools/execute 用真正的链式 waterfall；③三个接缝位置：
//   pre    = pre-execute 返回后、tools/execute 包装前（REVIEW-B 的接缝）
//   inner  = 区域包装放行后、tool.execute 前（读侧残余窗口）
//   lock   = checkedTarget 返回后、fs-local withLock 内 op 前（写侧残余窗口，上游已接受）
// 区外 / 假凭证目录全在本探针临时根下，不碰真实凭证；不 spawn 子进程。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SDK = '/tmp/bot-wt/P6-25f1/app/sdk'
const reqDsh = createRequire(createRequire(`${SDK}/package.json`).resolve('@deepseek-ai/dsh/package.json'))
const shellAsk = await import(`${SDK}/src/policy/shell-ask.mjs`)
const { ZoneCheckedFileSystem, applyZoneRecheck } = await import(`${SDK}/src/policy/fs-zone.mjs`)
const toolFs = await import(reqDsh.resolve('@deepseek-ai/dsh-tool-fs'))
const obsPolicy = await import(reqDsh.resolve('@deepseek-ai/dsh-fs-observation-policy'))
const { SandboxedFileSystem } = await import(reqDsh.resolve('@deepseek-ai/dsh-fs-sandbox'))

const BASE = '/tmp/bot-p625f1-vfy'
const ALLOW = Symbol('next')
const log = (...a) => console.log('[obs]', ...a)

function harness() {
  const root = mkdtempSync(join(BASE, 'run-'))
  const ws = join(root, 'ws'), outside = join(root, 'outside'), far = join(root, 'far')
  const fakeHome = join(root, 'fakehome'), cred = join(fakeHome, '.ssh')
  for (const d of [join(ws, 'sub'), outside, far, cred]) mkdirSync(d, { recursive: true })
  writeFileSync(join(cred, 'id_fake'), 'FAKE-CRED-MARKER\n')
  const policy = { mode: 'workspace-write', workspaceRoot: ws }
  const sandboxPolicy = { defaultMode: 'workspace-write', resolve: () => policy }
  const fs = Object.create(ZoneCheckedFileSystem.prototype)
  Object.assign(fs, { config: { cwd: ws, diffBasisMaxBytes: 1 << 20 }, internals: {}, locks: new Map(), defaultMode: 'workspace-write', p2sdkNeverRoots: [cred] })
  assert.ok(fs instanceof SandboxedFileSystem, '继承上游 SandboxedFileSystem')
  const listeners = new Map(); const tools = new Map()
  const ctx = {
    fs, sandboxPolicy,
    workingDirectory: { ensure: async () => ws },
    systemPrompt: { section() {}, getSectionOrder: () => 0 },
    tools: { register: (t) => tools.set(t.name, t), get: (n) => tools.get(n) },
    get: (n) => ({ fs, sandboxPolicy, workingDirectory: ctx.workingDirectory }[n]),
    on: (ev, fn) => listeners.set(ev, [...(listeners.get(ev) ?? []), fn]),
    effect() {}, inject() {},
    waterfall: async (ev, target, exec, fallback) => { const f = listeners.get(ev) ?? []; return f.length ? f[0](target, exec) : fallback() },
    emit: (ev, ...a) => (listeners.get(ev) ?? []).forEach((fn) => fn(...a)),
  }
  obsPolicy.apply(ctx)
  toolFs.apply(ctx, { read: true, readImage: false, write: true, edit: true, readLimit: 2000, readMaxLineLength: 2000, readMaxBytes: 1 << 20, readStreamMinSize: 1 << 20 })
  applyZoneRecheck(ctx, fs.p2sdkNeverRoots) // = ZoneCheckedFileSystem 构造器里的同一调用
  shellAsk.apply(ctx, { policyStatePaths: [join(root, 'state', 'policy-state.json')] })
  const preExecute = listeners.get('tools/pre-execute')[0]
  const agent = { session: { header: { id: 's1' } } }
  async function call(name, args, seams = {}) {
    const e = { name, arguments: args, agent, signal: new AbortController().signal }
    const decision = await preExecute(e, () => ALLOW)
    if (decision !== ALLOW && !seams.approve) return { decision }
    seams.pre?.()
    let restoreLock
    if (seams.lock) { const orig = fs.withLock; fs.withLock = function (k, op) { seams.lock(); fs.withLock = orig; return orig.call(this, k, op) }; restoreLock = () => { fs.withLock = orig } }
    const body = async () => { seams.inner?.(); return tools.get(name).execute(args, e) }
    const chain = listeners.get('tools/execute') ?? []
    const run = (i) => (i < chain.length ? chain[i](e, () => run(i + 1)) : body())
    try { return { decision, result: await run(0) } } catch (error) { return { decision, error } } finally { restoreLock?.() }
  }
  const swap = (target, dir = 'sub') => { renameSync(join(ws, dir), join(ws, `${dir}.orig`)); symlinkSync(target, join(ws, dir)) }
  return { root, ws, outside, far, cred, call, swap }
}
const text = (r) => JSON.stringify(r.result ?? r.error?.message ?? r.decision)
const denied = (r) => r.result?.isError === true || r.error?.code === 'FS_SANDBOX_DENIED'

test('对照：无替换 write/read 区内照常', async () => {
  const h = harness()
  const w = await h.call('write', { file_path: 'sub/a.txt', content: 'A' })
  assert.equal(w.decision, ALLOW); assert.equal(w.error, undefined); assert.notEqual(w.result?.isError, true)
  assert.equal(readFileSync(join(h.ws, 'sub', 'a.txt'), 'utf8'), 'A')
  const r = await h.call('read', { file_path: 'sub/a.txt' })
  assert.ok(!denied(r)); assert.match(text(r), /A/)
})

test('对照：判定前已是区外链 → shell-ask deny', async () => {
  const h = harness(); h.swap(h.outside)
  const r = await h.call('write', { file_path: 'sub/a.txt', content: 'A' })
  assert.equal(r.decision.kind, 'deny'); assert.equal(existsSync(join(h.outside, 'a.txt')), false)
})

test('B1 Q1 write（pre 接缝）→ 拒、区外无文件', async () => {
  const h = harness()
  const r = await h.call('write', { file_path: 'sub/race.txt', content: 'RACED' }, { pre: () => h.swap(h.outside) })
  log('Q1-write', r.decision === ALLOW, text(r).slice(0, 160))
  assert.equal(r.decision, ALLOW); assert.ok(denied(r))
  assert.equal(existsSync(join(h.outside, 'race.txt')), false)
})

test('B1 Q1 read→edit（先正常 read 建立观察，再 edit 时 pre 换链）→ edit 拒、区外文件不变', async () => {
  const h = harness()
  writeFileSync(join(h.outside, 'victim.txt'), 'hello\n'); writeFileSync(join(h.ws, 'sub', 'victim.txt'), 'hello\n')
  const rd = await h.call('read', { file_path: 'sub/victim.txt' })
  assert.ok(!denied(rd))
  const ed = await h.call('edit', { file_path: 'sub/victim.txt', old_string: 'hello', new_string: 'PWNED' }, { pre: () => h.swap(h.outside) })
  log('Q1-edit', text(ed).slice(0, 160))
  assert.equal(ed.decision, ALLOW); assert.ok(denied(ed))
  assert.equal(readFileSync(join(h.outside, 'victim.txt'), 'utf8'), 'hello\n')
  assert.equal(readFileSync(join(h.ws, 'sub.orig', 'victim.txt'), 'utf8'), 'hello\n')
})

test('B1 Q1 read（pre 换链到区外）→ 拒、无内容', async () => {
  const h = harness(); writeFileSync(join(h.outside, 'victim.txt'), 'OUTSIDE-hello\n'); writeFileSync(join(h.ws, 'sub', 'victim.txt'), 'decoy\n')
  const rd = await h.call('read', { file_path: 'sub/victim.txt' }, { pre: () => h.swap(h.outside) })
  assert.equal(rd.decision, ALLOW); assert.ok(denied(rd)); assert.doesNotMatch(text(rd), /OUTSIDE-hello/)
})

test('Q2 无缓存：第二次判定 deny', async () => {
  const h = harness()
  assert.equal((await h.call('write', { file_path: 'sub/one.txt', content: '1' })).decision, ALLOW)
  h.swap(h.outside)
  const s = await h.call('write', { file_path: 'sub/two.txt', content: '2' })
  assert.equal(s.decision.kind, 'deny'); assert.match(s.decision.reason, /write-outside-workspace denied/)
  assert.equal(existsSync(join(h.outside, 'two.txt')), false)
})

test('B2 旁支 read（pre 换链到非 /tmp 语义的任意区外目录）→ 拒', async () => {
  const h = harness(); writeFileSync(join(h.far, 'package.json'), '{"FAR":1}\n'); writeFileSync(join(h.ws, 'sub', 'package.json'), '{"decoy":true}\n')
  const rd = await h.call('read', { file_path: 'sub/package.json' }, { pre: () => h.swap(h.far) })
  log('side-read', text(rd).slice(0, 160))
  assert.equal(rd.decision, ALLOW); assert.ok(denied(rd)); assert.doesNotMatch(text(rd), /FAR/)
})

test('验收② 假凭证目录（pre 接缝）：read / write 都拒', async () => {
  const h = harness(); writeFileSync(join(h.ws, 'sub', 'id_fake'), 'decoy\n')
  const rd = await h.call('read', { file_path: 'sub/id_fake' }, { pre: () => h.swap(h.cred) })
  log('never-read', text(rd).slice(0, 160))
  assert.ok(denied(rd)); assert.match(text(rd), /never-root/); assert.doesNotMatch(text(rd), /FAKE-CRED-MARKER/)
  const h2 = harness()
  const wr = await h2.call('write', { file_path: 'sub/new_key', content: 'x' }, { pre: () => h2.swap(h2.cred) })
  log('never-write', text(wr).slice(0, 160))
  assert.ok(denied(wr)); assert.match(text(wr), /never-root/); assert.equal(existsSync(join(h2.cred, 'new_key')), false)
  const h3 = harness(); writeFileSync(join(h3.ws, 'sub', 'id_fake'), 'decoy\n')
  assert.ok(!denied(await h3.call('read', { file_path: 'sub/id_fake' })))
  const ed = await h3.call('edit', { file_path: 'sub/id_fake', old_string: 'FAKE', new_string: 'PWN' }, { pre: () => h3.swap(h3.cred) })
  assert.ok(denied(ed)); assert.equal(readFileSync(join(h3.cred, 'id_fake'), 'utf8'), 'FAKE-CRED-MARKER\n')
})

test('第二层独立：inner 接缝（包装已放行后换链）write → 后端 checkedTarget 拒（区外 / 假凭证）', async () => {
  const h = harness()
  const r = await h.call('write', { file_path: 'sub/inner.txt', content: 'X' }, { inner: () => h.swap(h.outside) })
  log('inner-write', text(r).slice(0, 160))
  // 区外目录在宿主 /tmp 下 = 上游 fence 可写根，能拒的只有 zoneGuard；tool-fs 把 FS_SANDBOX_DENIED 映射成通用 [sandbox: …] 标记
  assert.equal(r.error?.code, 'FS_SANDBOX_DENIED'); assert.match(String(r.error?.cause?.message), /write-outside-workspace/); assert.match(String(r.error?.cause?.stack), /zoneGuard/); assert.equal(existsSync(join(h.outside, 'inner.txt')), false); assert.equal(existsSync(join(h.ws, 'sub.orig', 'inner.txt')), false)
  const h2 = harness()
  const r2 = await h2.call('write', { file_path: 'sub/inner_key', content: 'X' }, { inner: () => h2.swap(h2.cred) })
  log('inner-write-cred cause=', r2.error?.cause?.message); assert.ok(denied(r2)); assert.match(String(r2.error?.cause?.message), /never-root/); assert.equal(existsSync(join(h2.cred, 'inner_key')), false)
})

// ── 以下为残余窗口观测格：断言的是「观察到的事实」，用于验收项 6 的判断 ──
test('残余（读侧）inner 接缝：包装放行后、tool 自己 resolve 前换链 → 观测', async () => {
  const h = harness(); writeFileSync(join(h.far, 'x.txt'), 'FAR-RESIDUAL\n'); writeFileSync(join(h.ws, 'sub', 'x.txt'), 'decoy\n')
  const rd = await h.call('read', { file_path: 'sub/x.txt' }, { inner: () => h.swap(h.far) })
  const leaked = /FAR-RESIDUAL/.test(text(rd))
  log('residual-read-far leaked=', leaked, text(rd).slice(0, 120))
  const h2 = harness(); writeFileSync(join(h2.ws, 'sub', 'id_fake'), 'decoy\n')
  const rc = await h2.call('read', { file_path: 'sub/id_fake' }, { inner: () => h2.swap(h2.cred) })
  const leakedCred = /FAKE-CRED-MARKER/.test(text(rc))
  log('residual-read-fakecred leaked=', leakedCred, text(rc).slice(0, 120))
  assert.equal(leaked, true, '读侧：区域复判的解析结果不绑定 tool 的解析 → 窗口跨越整段 dispatch')
  assert.equal(leakedCred, true)
})

test('残余（写侧）lock 接缝：checkedTarget 返回后、withLock op 前换链 → 观测（上游已接受的窗口）', async () => {
  const h = harness()
  const r = await h.call('write', { file_path: 'sub/late.txt', content: 'LATE' }, { lock: () => h.swap(h.outside) })
  const landed = existsSync(join(h.outside, 'late.txt'))
  log('residual-write-outside landed=', landed, text(r).slice(0, 120))
  const h2 = harness()
  await h2.call('write', { file_path: 'sub/late_key', content: 'LATE' }, { lock: () => h2.swap(h2.cred) })
  const landedCred = existsSync(join(h2.cred, 'late_key'))
  log('residual-write-fakecred landed=', landedCred)
  assert.equal(landed, true); assert.equal(landedCred, true)
})
