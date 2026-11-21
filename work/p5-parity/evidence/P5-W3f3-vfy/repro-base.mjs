// 验收员独立复现：L-8 R1 / R4 在 base(92cb6af) 的失败路径。
// 纯 node 驱动，真实 apply + 真实 fs，不用 vitest。
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as plugin from './base-policy/shell-ask.mjs'
import { issuePermit } from './base-policy/request-net.mjs'

const WS = join(tmpdir(), 'p5w3f3-vfy-ws')
mkdirSync(WS, { recursive: true })

function fakeCtx(effectiveMode, approval, withFs) {
  const listeners = []
  return {
    listeners,
    on(event, listener) { listeners.push({ event, listener }) },
    get(name) {
      if (name === 'sandboxPolicy' && effectiveMode !== undefined) return { resolve: () => ({ mode: effectiveMode, workspaceRoot: WS }) }
      if (name === 'approval' && approval !== undefined) return approval
      if (name === 'fs' && withFs) return { resolve: async (raw) => ({ targetKey: raw.startsWith('/') ? raw : join(WS, raw) }) }
      return undefined
    },
  }
}
const nextResult = Symbol('next')
const next = () => nextResult
const listenerOf = (opts) => {
  const ctx = fakeCtx(opts.mode, opts.approval, opts.fs)
  plugin.apply(ctx, opts.config)
  return ctx.listeners[0].listener
}
const root = mkdtempSync(join(tmpdir(), 'p5w3f3-base-'))
const handoff = join(root, 'handoff'); const data = join(root, 'data')
mkdirSync(handoff); mkdirSync(data)
writeFileSync(join(handoff, 'launch-token'), 'unit-token\n')
const statePath = join(data, 'policy-state.json')
const INSTANCE = plugin.instanceOf('unit-token')
const config = { handoff, policyStatePaths: [statePath], tiers: {"default": "allow", "bash": "sandbox-allow", "read": "workspace-read", "read_image": "workspace-read", "glob": "workspace-read", "grep": "workspace-read", "present": "workspace-read", "write": "workspace-write", "edit": "workspace-write", "web_fetch": "allow", "web_search": "allow", "mcp": "ask"} }
const neverApproval = { overrideOf: () => 'never', config: {} }
const fmt = (d) => (d === nextResult ? 'NEXT(放行)' : JSON.stringify(d))

// ── R1 base ──
writeFileSync(statePath, JSON.stringify({ version: 1, paused: true, instance: INSTANCE }))
const ask1 = listenerOf({ mode: 'workspace-write', fs: true, config })
const before = await ask1({ name: 'read', arguments: { file_path: 'a.txt' } }, next)
rmSync(statePath)
const afterAsk = await ask1({ name: 'read', arguments: { file_path: 'a.txt' } }, next)
const afterWrite = await ask1({ name: 'write', arguments: { file_path: 'a.txt', content: 'x' } }, next)
console.log(`R1 base ask 会话: 删除前 read=${fmt(before)} 删除后 read=${fmt(afterAsk)} write=${fmt(afterWrite)}`)
console.log(`R1 base ask 判定: ${before?.kind === 'ask' && afterAsk === nextResult && afterWrite === nextResult ? 'BUG 复现（静默放行）' : '未复现'}`)

// never 会话（委派子代理）文件工具复活
writeFileSync(statePath, JSON.stringify({ version: 1, paused: true, instance: INSTANCE }))
const never1 = listenerOf({ mode: 'workspace-write', approval: neverApproval, fs: true, config })
const neverBefore = await never1({ name: 'read', agent: { session: {} }, arguments: { file_path: 'a.txt' } }, next)
rmSync(statePath)
const neverAfter = await never1({ name: 'read', agent: { session: {} }, arguments: { file_path: 'a.txt' } }, next)
console.log(`R1 base never 会话: 删除前=${fmt(neverBefore)} 删除后=${fmt(neverAfter)}`)
console.log(`R1 base never 判定: ${neverBefore?.kind === 'deny' && neverAfter === nextResult ? 'BUG 复现（never 文件工具复活）' : '未复现'}`)

// 从未 provision（missing 语义，Q-013）base 行为对照
const root2 = mkdtempSync(join(tmpdir(), 'p5w3f3-base2-'))
mkdirSync(join(root2, 'handoff')); mkdirSync(join(root2, 'data'))
writeFileSync(join(root2, 'handoff', 'launch-token'), 'unit-token\n')
const miss = listenerOf({ mode: 'workspace-write', fs: true, config: { handoff: join(root2, 'handoff'), policyStatePaths: [join(root2, 'data', 'policy-state.json')], tiers: {"default": "allow", "bash": "sandbox-allow", "read": "workspace-read", "read_image": "workspace-read", "glob": "workspace-read", "grep": "workspace-read", "present": "workspace-read", "write": "workspace-write", "edit": "workspace-write", "web_fetch": "allow", "web_search": "allow", "mcp": "ask"} } })
const missRead = await miss({ name: 'read', arguments: { file_path: 'a.txt' } }, next)
console.log(`R1 base missing 语义对照: read=${fmt(missRead)}（应 NEXT）`)
rmSync(root2, { recursive: true, force: true })

// ── R4 base：hasLivePermit 只读 → 两次同命令 bash 都放行 ──
const permitDir = mkdtempSync(join(tmpdir(), 'p5w3f3-permit-'))
const CMD = 'printf x >> log.txt; curl https://example.com'
issuePermit({ dir: permitDir, session: 'vfy-r4', command: CMD })
const bashL = listenerOf({ mode: 'workspace-write', config: { permitDir, tiers: {"default": "allow", "bash": "sandbox-allow", "read": "workspace-read", "read_image": "workspace-read", "glob": "workspace-read", "grep": "workspace-read", "present": "workspace-read", "write": "workspace-write", "edit": "workspace-write", "web_fetch": "allow", "web_search": "allow", "mcp": "ask"} } })
const b1 = await bashL({ name: 'bash', agent: { session: { header: { id: 'vfy-r4' } } }, arguments: { command: CMD, description: 'x' } }, next)
const b2 = await bashL({ name: 'bash', agent: { session: { header: { id: 'vfy-r4' } } }, arguments: { command: CMD, description: 'x' } }, next)
console.log(`R4 base: 第1次=${fmt(b1)} 第2次=${fmt(b2)} 目录=${readdirSync(permitDir)}`)
console.log(`R4 base 判定: ${b1 === nextResult && b2 === nextResult ? 'BUG 复现（同一许可授权两次）' : '未复现'}`)
rmSync(root, { recursive: true, force: true }); rmSync(permitDir, { recursive: true, force: true })
