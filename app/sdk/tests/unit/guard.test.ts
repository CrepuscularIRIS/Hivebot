// P5-02（PLAN p5-parity 0b）：guard.mjs 判定核心单测。路径 resolve、审批联动、
// 差分在 tests/e2e/guard-fs.test.ts；本文件只测纯函数：config 校验（fail loud）、
// 决策 13 ①–③ 判定序、决策 7 祖先判定、例外（workspaceRoot 子树 / 工具链只读）、
// 工具参数提取与 glob pattern 候选。
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '../support/tmp-sweep.ts'
import { describe, expect, it } from 'vitest'
import * as plugin from '../../src/policy/guard.mjs'

/** 决策 13 的 resolved 骨架（guard 行 config.roots 经 resolveRoots 展开后的形态）。
 * /data 的顶层条目（grants.json、topfile）已并入 hardRoots —— expandTopEntries 的产物。 */
function resolved(over: Record<string, string[]> = {}) {
  return {
    hardRoots: ['/home/u/.ssh', '/home/u/miniconda3/.condarc', '/proc', '/run/user/1000', '/tmp/handoff-1', '/data/grants.json', '/data/topfile'],
    softRoots: ['/home/u', '/data'],
    toolchainDirs: ['/home/u/miniconda3'],
    policyRoots: ['/opt/sdk'],
    ...over,
  }
}

/** guard 行 config.roots（writeRuntimePatch 生成的形状）。 */
function configRoots(over: Record<string, string[]> = {}) {
  return {
    hardRoots: ['/home/u/.ssh', '/proc', '/run/user/1000', '/tmp/handoff-1'],
    dataMaskRoots: ['/data'],
    homes: ['/home/u'],
    toolchainDirs: ['/home/u/miniconda3'],
    policyRoots: ['/opt/sdk'],
    ...over,
  }
}

/** apply() 注册的 pre-execute listener。services 提供可选服务（如 sandboxPolicy）。 */
function listener(config?: object, services?: Record<string, unknown>): (exec: { name: string; agent?: unknown; arguments?: unknown }, next: () => unknown) => unknown {
  const listeners: Array<{ event: string; listener: (exec: never, next: () => unknown) => unknown }> = []
  const ctx = {
    on: (event: string, listener: (exec: never, next: () => unknown) => unknown) => { listeners.push({ event, listener }) },
    get: (name: string) => (services ?? {})[name],
  }
  plugin.apply(ctx as never, (config ?? { roots: configRoots() }) as never)
  expect(listeners, '挂一个 tools/pre-execute').toHaveLength(1)
  expect(listeners[0].event).toBe('tools/pre-execute')
  return listeners[0].listener as never
}

describe('config 校验（决策 6：guard 行缺失 → 加载失败）', () => {
  it('缺 config / 缺 roots → 抛错（fail loud）', () => {
    expect(() => plugin.apply({ on: () => {} } as never, undefined as never)).toThrow(/p2sdk-fs-guard/)
    expect(() => plugin.apply({ on: () => {} } as never, {} as never)).toThrow(/roots/)
  })

  it('roots 缺任一必需数组 → 抛错并点名', () => {
    for (const key of ['hardRoots', 'dataMaskRoots', 'homes', 'toolchainDirs', 'policyRoots']) {
      const bad = { ...configRoots(), [key]: undefined }
      expect(() => plugin.apply({ on: () => {} } as never, { roots: bad } as never), key).toThrow(new RegExp(key))
    }
  })

  it('合法 roots 正常注册', () => {
    expect(() => listener()).not.toThrow()
  })
})

describe('judgePath（决策 13 ①–④ + 决策 7）', () => {
  const judge = (target: string, over: Record<string, string[]> = {}, opts: { isWrite?: boolean; workspaceRoot?: string } = {}) =>
    plugin.judgePath(target, resolved(over), opts)

  it('① 硬 NEVER：目标在 hardRoot 下 / 相等 / 是其祖先 → deny（读写都拒）', async () => {
    await expect(judge('/home/u/.ssh/id_rsa')).resolves.toMatchObject({ deny: 'never' })
    await expect(judge('/home/u/.ssh')).resolves.toMatchObject({ deny: 'never' })
    // 决策 7：/ 是 /proc 等的祖先 → 拒
    await expect(judge('/')).resolves.toMatchObject({ deny: 'never' })
    await expect(judge('/', {}, { isWrite: true })).resolves.toMatchObject({ deny: 'never' })
    // 数据 mask 根顶层条目（expandTopEntries 产物）在 hardRoots 里
    await expect(judge('/data/topfile')).resolves.toMatchObject({ deny: 'never' })
    await expect(judge('/data/workspaces', {}, { isWrite: true })).resolves.not.toMatchObject({ deny: 'never' })
  })

  it('③ 软遮蔽：HOME 整棵 / 数据 mask 根整棵读写都拒，deny=mask', async () => {
    await expect(judge('/home/u/notes/x')).resolves.toMatchObject({ deny: 'mask' })
    await expect(judge('/home/u/.codex/auth.json')).resolves.toMatchObject({ deny: 'mask' })
    await expect(judge('/data/workspaces/other-bot/wm', {}, { isWrite: true })).resolves.toMatchObject({ deny: 'mask' })
    // 决策 7：目标为软根祖先 → 拒。/home 同时是硬根 .ssh 的祖先 → ① 先判（更严者赢）
    await expect(judge('/home')).resolves.toMatchObject({ deny: 'never' })
    await expect(judge('/data/workspaces')).resolves.toMatchObject({ deny: 'mask' })
  })

  it('③ 例外一：workspaceRoot 子树读写放行，只对本会话 header.cwd 子树', async () => {
    const ws = '/data/workspaces/x'
    await expect(judge('/data/workspaces/x/f.txt', {}, { workspaceRoot: ws })).resolves.toBe('ok')
    await expect(judge('/data/workspaces/x/f.txt', {}, { workspaceRoot: ws, isWrite: true })).resolves.toBe('ok')
    await expect(judge(`${ws}/`, {}, { workspaceRoot: ws })).resolves.toBe('ok')
    // 同级另一工作区不放行（跨 bot 隔离）；例外的祖先（mask 根）不放行
    await expect(judge('/data/workspaces/y/f', {}, { workspaceRoot: ws })).resolves.toMatchObject({ deny: 'mask' })
    await expect(judge('/data', {}, { workspaceRoot: ws })).resolves.toMatchObject({ deny: expect.stringMatching(/never|mask/) })
  })

  it('例外不越过 ①：workspaceRoot 覆盖凭证目录时实体仍 deny', async () => {
    await expect(judge('/home/u/.ssh/id_rsa', {}, { workspaceRoot: '/home/u/.ssh' })).resolves.toMatchObject({ deny: 'never' })
  })

  it('③ 例外二：工具链白名单只读 —— read 放行、write 拒', async () => {
    await expect(judge('/home/u/miniconda3/lib/libz.so')).resolves.toBe('ok')
    await expect(judge('/home/u/miniconda3/lib/libz.so', {}, { isWrite: true })).resolves.toMatchObject({ deny: 'mask' })
  })

  it('工具链白名单内登记的凭证（hardRoots 实体）read 也 deny', async () => {
    await expect(judge('/home/u/miniconda3/.condarc')).resolves.toMatchObject({ deny: 'never' })
  })

  it('② 硬写保护：policyRoots 写拒（例外不越过 ②）、读放行', async () => {
    await expect(judge('/opt/sdk/src/policy/guard.mjs', {}, { isWrite: true, workspaceRoot: '/opt/sdk' })).resolves.toMatchObject({ deny: 'read-only' })
    await expect(judge('/opt/sdk/src/policy/guard.mjs', {}, { workspaceRoot: '/opt/sdk' })).resolves.toBe('ok')
    await expect(judge('/opt/sdk/README')).resolves.toBe('ok')
  })

  it('无命中 → ok（read /etc/hostname 型）', async () => {
    await expect(judge('/etc/hostname')).resolves.toBe('ok')
    await expect(judge('/var/tmp/plain', {}, { isWrite: true })).resolves.toBe('ok')
  })
})

describe('expandTopEntries + resolveRoots（① 的数据 mask 根顶层条目，除 workspaces）', () => {
  it('展开顶层直接子条目，跳过名为 workspaces 的目录，缺失根跳过', async () => {
    const base = tmkdir('bot-p5-02-top-')
    mkdirSync(join(base, 'workspaces'), { recursive: true })
    mkdirSync(join(base, 'sub'), { recursive: true })
    writeFileSync(join(base, 'grants.json'), '{}')
    try {
      const out = plugin.expandTopEntries([base, '/nonexistent-p5-02-root'])
      expect(out).toEqual([join(base, 'grants.json'), join(base, 'sub')])
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('resolveRoots：hardRoots ∪ 顶层条目，softRoots = homes ∪ dataMaskRoots', async () => {
    const base = tmkdir('bot-p5-02-resolve-')
    writeFileSync(join(base, 'topfile'), 'x')
    try {
      const r = plugin.resolveRoots(configRoots({ dataMaskRoots: [base] }))
      expect(r.hardRoots).toContain('/proc')
      expect(r.hardRoots).toContain(join(base, 'topfile'))
      expect(r.hardRoots.map((p: string) => p.startsWith(base))).not.toContain(undefined)
      expect(r.softRoots).toEqual(expect.arrayContaining(['/home/u', base]))
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})

describe('extractPaths（入口 × 参数形态）', () => {
  const paths = (name: string, args: unknown) => plugin.extractPaths(name, args)

  it('read/read_image/write/edit 取 file_path', () => {
    for (const name of ['read', 'read_image', 'write', 'edit']) {
      const kind = name === 'write' || name === 'edit' ? 'write' : 'read'
      expect(paths(name, { file_path: '/a/b' })).toEqual([{ raw: '/a/b', kind }])
    }
  })

  it('grep/glob：path 缺省回落 "."，kind=read', () => {
    expect(paths('grep', { pattern: 'x' })).toEqual([{ raw: '.', kind: 'read' }])
    expect(paths('glob', { pattern: '*.ts', path: '/w' })).toEqual([{ raw: '/w', kind: 'read' }])
  })

  it('present：files[].path，kind=read', () => {
    expect(paths('present', { files: [{ path: '/a' }, { path: '/b', description: 'd' }] }))
      .toEqual([{ raw: '/a', kind: 'read' }, { raw: '/b', kind: 'read' }])
  })

  it('glob pattern 候选：../ 形态与绝对前缀指向根外', () => {
    expect(paths('glob', { pattern: '../.ssh/*', path: '/w/sub' }))
      .toEqual([{ raw: '/w/sub', kind: 'read' }, { raw: '/w/.ssh', kind: 'read' }])
    expect(paths('glob', { pattern: '/home/u/.ssh/**', path: '/w' }))
      .toEqual([{ raw: '/w', kind: 'read' }, { raw: '/home/u/.ssh', kind: 'read' }])
    expect(paths('glob', { pattern: 'src/**/*.ts', path: '/w' })).toEqual([{ raw: '/w', kind: 'read' }])
  })

  it('非文件工具 / 坏参数 → 空（放行到下一个 listener）', () => {
    expect(paths('bash', { command: 'x' })).toEqual([])
    expect(paths('read', null)).toEqual([])
    expect(paths('read', {})).toEqual([])
  })
})

describe('apply 的 listener 行为', () => {
  it('bash 与未知工具直接 next（guard 内无 approvalPolicy 分支）', async () => {
    const l = listener()
    const nextResult = Symbol('next')
    await expect(l({ name: 'bash', arguments: { command: 'cat /etc/ppp/chap-secrets' } }, () => nextResult)).resolves.toBe(nextResult)
    await expect(l({ name: 'web_fetch', arguments: {} }, () => nextResult)).resolves.toBe(nextResult)
  })

  // P5-04.f1（PLAN P5-04 ④）：会话有效模式 = danger-full-access → bash /
  // write / edit deny（v2.1 定死字面串，先于路径判定）。
  it('会话模式 dfa → bash / write / edit deny（会话级字面串）', async () => {
    const l = listener(undefined, { sandboxPolicy: { resolve: () => ({ mode: 'danger-full-access' }) } })
    for (const name of ['bash', 'write', 'edit']) {
      const args = name === 'bash' ? { command: 'x' } : { file_path: '/w/f.txt' }
      await expect(l({ name, arguments: args }, () => 'should-not-run'), `${name} deny`).resolves.toMatchObject({
        kind: 'deny',
        reason: expect.stringContaining('danger-full-access session mode is not supported'),
      })
    }
  })

  it('会话模式非 dfa / resolve 抛错 / 无 sandboxPolicy 服务 → 不拦（next）', async () => {
    const nextResult = Symbol('next')
    const l = listener(undefined, { sandboxPolicy: { resolve: () => ({ mode: 'workspace-write' }) } })
    await expect(l({ name: 'bash', arguments: { command: 'x' } }, () => nextResult), 'workspace-write 不拦').resolves.toBe(nextResult)
    const throwing = listener(undefined, { sandboxPolicy: { resolve: () => { throw new Error('projection unreadable') } } })
    await expect(throwing({ name: 'bash', arguments: { command: 'x' } }, () => nextResult), 'resolve 抛错不拦').resolves.toBe(nextResult)
    const bare = listener()
    await expect(bare({ name: 'bash', arguments: { command: 'x' } }, () => nextResult), '无服务不拦').resolves.toBe(nextResult)
  })
})

// T9a：extraNeverTools（ssh 模式 glob/grep 工具名拒）
describe('T9a extraNeverTools', () => {
  it('配了 grep → deny 原因含 not available in ssh mode', async () => {
    const l = listener({ roots: configRoots(), extraNeverTools: ['grep'] })
    const outcome = await l({ name: 'grep', arguments: { pattern: 'x' } }, async () => ({ kind: 'allow' })) as { kind: string; reason: string }
    expect(outcome.kind).toBe('deny')
    expect(outcome.reason).toContain('not available in ssh mode')
  })
  it('不配 → grep 不因 ssh mode 被拒（正对照；无 fs 服务时可能因别的原因 deny）', async () => {
    const l = listener()
    const outcome = await l({ name: 'grep', arguments: { pattern: 'x' } }, async () => ({ kind: 'allow' })) as { kind: string; reason?: string }
    if (outcome.kind === 'deny') expect(outcome.reason).not.toContain('ssh mode')
  })
  it('非数组 → 加载抛错', () => {
    expect(() => listener({ roots: configRoots(), extraNeverTools: 'grep' })).toThrow(/extraNeverTools/)
  })

  it('T9af 后一次 apply 不改写先前实例（两个方向）', async () => {
    const grep = { name: 'grep', arguments: { pattern: 'x' } }
    const allow = async () => ({ kind: 'allow' })
    const a = listener({ roots: configRoots(), extraNeverTools: ['grep'] })
    listener({ roots: configRoots() })
    const oa = await a(grep, allow) as { kind: string; reason?: string }
    expect(oa.kind, 'ssh 实例 A 在本机实例 B apply 之后仍拒 grep').toBe('deny')
    expect(oa.reason).toContain('not available in ssh mode')
    const c = listener({ roots: configRoots() })
    listener({ roots: configRoots(), extraNeverTools: ['grep'] })
    const oc = await c(grep, allow) as { kind: string; reason?: string }
    expect(oc.reason ?? '', '本机实例 C 不因 ssh 实例 D 的 apply 按 ssh 拒').not.toContain('ssh mode')
  })
})
