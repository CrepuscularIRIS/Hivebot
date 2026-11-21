// B45：per-tool MCP 四档权限表（RE-TOOL-PERMS-1.1.0 §1 锚）。
// 观察 shell-ask mcp 分支：blocked→deny、always_allow→直放、auto_review/needs_approval/无记录→原链 ask。
// 数据面 createMcpPermissions：set/judge/list 往返+损坏回退空+单例。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as plugin from '../../src/policy/shell-ask.mjs'

const nextResult = Symbol('next')
const next = (): unknown => nextResult

function fakeCtx() {
  const listeners: { event: string; listener: unknown }[] = []
  return { listeners, on: (event: string, listener: unknown) => { listeners.push({ event, listener }) }, get: () => null }
}

function listenerWith(config: object) {
  const ctx = fakeCtx()
  plugin.apply(ctx as never, config as never)
  return (ctx.listeners[0] as { listener: (e: object, n: typeof next) => unknown }).listener
}

function tmpPath(name = 'mcp-permissions.json') {
  const dir = mkdtempSync(join(tmpdir(), 'b45-'))
  return { path: join(dir, name), dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('B45 数据面：createMcpPermissions', () => {
  it('set→judge 往返四档；list 平铺；未知档位拒绝', async () => {
    const { path, cleanup } = tmpPath()
    cleanups.push(cleanup)
    const { createMcpPermissions } = await import('../../src/p2sdk/mcp-permissions.mjs') as never as {
      createMcpPermissions: (o: { path: string }) => { set(a: string, b: string, c: string): { ok: boolean; reason?: string }; judge(a: string, b: string): string | null; list(a: string): Record<string, string> }
    }
    const perms = createMcpPermissions({ path })
    for (const tier of ['auto_review', 'always_allow', 'needs_approval', 'blocked']) {
      expect(perms.set('srv1', 'search', tier)).toEqual({ ok: true })
      expect(perms.judge('srv1', 'search')).toBe(tier)
    }
    expect(perms.set('srv1', 'search', 'yolo')).toEqual({ ok: false, reason: 'invalid-tier' })
    expect(perms.set('', 'x', 'blocked')).toEqual({ ok: false, reason: 'invalid-shape' })
    expect(perms.judge('srv1', 'nope')).toBeNull()
    expect(perms.judge('nope', 'nope')).toBeNull()
    expect(perms.list('srv1')).toEqual({ search: 'blocked' })
    expect(perms.list('missing')).toEqual({})
  })

  it('损坏文件（非法 JSON / 错 version / servers 非对象）→ 空表回退（fail-closed：无记录走默认链）', async () => {
    const { path, cleanup } = tmpPath()
    cleanups.push(cleanup)
    writeFileSync(path, '{ not json', 'utf8')
    const { createMcpPermissions } = await import('../../src/p2sdk/mcp-permissions.mjs') as never as {
      createMcpPermissions: (o: { path: string }) => { judge(a: string, b: string): string | null }
    }
    expect(createMcpPermissions({ path }).judge('s', 't')).toBeNull()
    writeFileSync(path, JSON.stringify({ version: 99, servers: { s: { tools: { t: 'blocked' } } } }), 'utf8')
    expect(createMcpPermissions({ path: path + '#v99' }).judge('s', 't')).toBeNull()
    writeFileSync(path, JSON.stringify({ version: 1, servers: [1, 2] }), 'utf8')
    expect(createMcpPermissions({ path: path + '#arr' }).judge('s', 't')).toBeNull()
  })
})

describe('B45 门接线：shell-ask mcp 分支四档先裁', () => {
  it('blocked → deny（reason mcpBlocked，不执行）', async () => {
    const { path, cleanup } = tmpPath()
    cleanups.push(cleanup)
    const { createMcpPermissions } = await import('../../src/p2sdk/mcp-permissions.mjs') as never as {
      createMcpPermissions: (o: { path: string }) => { set(a: string, b: string, c: string): { ok: boolean } }
    }
    createMcpPermissions({ path }).set('srv', 'dangerous', 'blocked')
    const listener = listenerWith({ mode: 'workspace-write', mcpPermissionsPath: path })
    const r = await listener({ name: 'mcp__srv__dangerous', arguments: {} }, next)
    expect(r).toMatchObject({ kind: 'deny', reason: 'p2sdk policy: connector tool blocked by per-tool permissions' })
  })

  it('always_allow → 直放（next 结果）', async () => {
    const { path, cleanup } = tmpPath()
    cleanups.push(cleanup)
    const { createMcpPermissions } = await import('../../src/p2sdk/mcp-permissions.mjs') as never as {
      createMcpPermissions: (o: { path: string }) => { set(a: string, b: string, c: string): { ok: boolean } }
    }
    createMcpPermissions({ path }).set('srv', 'search', 'always_allow')
    const listener = listenerWith({ mode: 'workspace-write', mcpPermissionsPath: path })
    expect(await listener({ name: 'mcp__srv__search', arguments: {} }, next)).toBe(nextResult)
  })

  it('auto_review / needs_approval / 无记录 → 原链 ask 出卡（语义不变）', async () => {
    const { path, cleanup } = tmpPath()
    cleanups.push(cleanup)
    const { createMcpPermissions } = await import('../../src/p2sdk/mcp-permissions.mjs') as never as {
      createMcpPermissions: (o: { path: string }) => { set(a: string, b: string, c: string): { ok: boolean } }
    }
    createMcpPermissions({ path }).set('srv', 'a', 'auto_review')
    createMcpPermissions({ path }).set('srv', 'b', 'needs_approval')
    const listener = listenerWith({ mode: 'workspace-write', mcpPermissionsPath: path })
    expect(await listener({ name: 'mcp__srv__a', arguments: {} }, next)).toMatchObject({ kind: 'ask' })
    expect(await listener({ name: 'mcp__srv__b', arguments: {} }, next)).toMatchObject({ kind: 'ask' })
    expect(await listener({ name: 'mcp__srv__unknown', arguments: {} }, next)).toMatchObject({ kind: 'ask' })
  })

  it('无 mcpPermissionsPath config → 门不启用，行为同改前（ask）', async () => {
    const listener = listenerWith({ mode: 'workspace-write' })
    expect(await listener({ name: 'mcp__srv__x', arguments: {} }, next)).toMatchObject({ kind: 'ask' })
  })
})

const cleanups: (() => void)[] = []
import { afterEach } from 'vitest'
afterEach(() => { while (cleanups.length) cleanups.pop()!() })
