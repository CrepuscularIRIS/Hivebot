// 字面跨进程重启核查：phase1 = 首进程 provision→触发标记→删状态→退出（模拟 kill）；
// phase2 = 全新进程仅凭磁盘伴生标记判定门。
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as plugin from '/tmp/bot-wt/P5-W3f3/app/sdk/src/policy/shell-ask.mjs'
const phase = process.argv[2]
const root = process.argv[3]
const TIERS = { default: 'allow', bash: 'sandbox-allow', read: 'workspace-read', read_image: 'workspace-read', glob: 'workspace-read', grep: 'workspace-read', present: 'workspace-read', write: 'workspace-write', edit: 'workspace-write', web_fetch: 'allow', web_search: 'allow', mcp: 'ask' }
const WS = '/tmp/p5w3f3-vfy-ws'
const fakeCtx = () => { const listeners = []; return { listeners, on(e, l) { listeners.push({ event: e, listener: l }) }, get(n) { if (n === 'sandboxPolicy') return { resolve: () => ({ mode: 'workspace-write', workspaceRoot: WS }) }; if (n === 'fs') return { resolve: async (raw) => ({ targetKey: raw.startsWith('/') ? raw : join(WS, raw) }) }; return undefined } } }
const nextResult = Symbol('next'); const next = () => nextResult
const listenerOf = (config) => { const ctx = fakeCtx(); plugin.apply(ctx, config); return ctx.listeners[0].listener }
const envAt = (root) => { const statePath = join(root, 'data', 'policy-state.json'); return { statePath, config: { handoff: join(root, 'handoff'), policyStatePaths: [statePath], tiers: TIERS } } }
if (phase === 'setup') {
  const root = mkdtempSync(join(tmpdir(), 'p5w3f3-restart-'))
  mkdirSync(join(root, 'handoff')); mkdirSync(join(root, 'data'))
  writeFileSync(join(root, 'handoff', 'launch-token'), 'unit-token\n')
  const { statePath, config } = envAt(root)
  writeFileSync(statePath, JSON.stringify({ version: 1, paused: true, instance: plugin.instanceOf('unit-token') }))
  const l = listenerOf(config)
  const r = await l({ name: 'read', arguments: { file_path: 'a.txt' } }, next)
  rmSync(statePath) // 会话中途状态文件被删；进程随即退出（模拟 kill SDK）
  console.log(root, r?.kind ?? r)
} else {
  const { config } = envAt(root)
  const l = listenerOf(config) // 全新进程：latch 全新，只能凭磁盘
  const r = await l({ name: 'read', arguments: { file_path: 'a.txt' } }, next)
  const w = await l({ name: 'write', arguments: { file_path: 'a.txt', content: 'x' } }, next)
  console.log('phase2 read:', r?.kind ?? r, '| write:', w?.kind ?? w, '| data dir:', readdirSync(join(root, 'data')).join(','))
  process.exit(r?.kind === 'ask' && w?.kind === 'ask' ? 0 : 1)
}
