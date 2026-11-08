// P5-01 ⑤ 及挂载序证明：app/sdk/sandbox/bwrap-wrap.py 直测（不经 runtime）。
// 覆盖：wrapper 文件缺失的 python3 加载失败诊断（无前缀、退出码 2）；wrapper 自身
// 错误的 `bwrap: ` 前缀 + 非零退出 + 不 exec；挂载序（dry-run）；HOME 祖先拒绝；
// 再遮（目录 --tmpfs / 文件 --ro-bind /dev/null）；真实 exec 冒烟（遮蔽生效）。
// 决策 4：解释器 /usr/bin/python3 -I；PLAN P5-01 ⑤ 的两格在 sandbox-hardened.test.ts
// 里再经真实 launcher + fake bash 各证一遍。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmkdir } from '../support/tmp-sweep.ts'
import { issuePermit } from '../../src/policy/request-net.mjs'
import { describe, expect, it } from 'vitest'

const WRAPPER = join(fileURLToPath(import.meta.url), '..', '..', '..', 'sandbox', 'bwrap-wrap.py')
const PY = '/usr/bin/python3'

/** dsh sandbox-local 0.2.2-alpha.2 bwrapProfileArgs 的固定形状（workspace-write 档）。 */
function profileArgs(workspace: string): string[] {
  return ['--ro-bind', '/', '/', '--dev', '/dev', '--unshare-pid', '--proc', '/proc', '--die-with-parent',
    '--tmpfs', '/tmp', '--bind', workspace, workspace]
}

function runWrapper(args: string[], env: Record<string, string> = {}) {
  return spawnSync(PY, ['-I', WRAPPER, ...args], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, ...env } })
}

/** dry-run 输出 → 最终 bwrap argv（每行一个元素，首行是标记）。 */
function dryRun(args: string[]): string[] {
  const res = runWrapper(args, { BWRAP_WRAP_DRY_RUN: '1' })
  expect(res.status, `dry-run must succeed:\n${res.stderr}`).toBe(0)
  return res.stdout.trim().split('\n')
}

describe('⑤ wrapper 文件缺失（v2.1 唯一例外：无前缀、退出码 2）', () => {
  it('python3 -I 在加载脚本前报 Errno 2 诊断，退出码 2', () => {
    const res = spawnSync(PY, ['-I', '/tmp/p5-01-no-such-dir/bwrap-wrap.py', '--home', '/tmp'], { encoding: 'utf8' })
    expect(res.status).toBe(2)
    expect(res.stderr).toContain("can't open file")
    expect(res.stderr).toContain('bwrap-wrap.py')
    expect(res.stderr).toContain('[Errno 2]')
  })
})

describe('⑤ wrapper 内部错误（一切错误 bwrap: 前缀、非零、不 exec）', () => {
  it('未知 flag → bwrap: 前缀、非零退出', () => {
    const res = runWrapper(['--wat', 'x', ...profileArgs('/tmp'), '--', '/bin/true'])
    expect(res.status).not.toBe(0)
    expect(res.stderr).toContain('bwrap: ')
  })

  it('--home 缺值 → bwrap: 前缀（内部 IndexError 不裸抛）', () => {
    const res = runWrapper(['--home', ...profileArgs('/tmp'), '--', '/bin/true'])
    expect(res.status).not.toBe(0)
    expect(res.stderr).toContain('bwrap: ')
  })

  it('缺 -- 分隔符 → bwrap: 前缀', () => {
    const res = runWrapper(['--home', '/tmp'])
    expect(res.status).not.toBe(0)
    expect(res.stderr).toContain('bwrap: ')
  })

  it('profile 出现未知参数（上游形状漂移）→ bwrap: 前缀', () => {
    const res = runWrapper(['--home', '/tmp', '--chdir', '/x', '--', '/bin/true'])
    expect(res.status).not.toBe(0)
    expect(res.stderr).toContain('bwrap: ')
  })
})

describe('挂载序（dry-run，PLAN P5-01 挂载顺序逐段）', () => {
  it('base → --unshare-net → 遮蔽 → 工具链挂回 → 工作区重 bind → 策略根 → 再遮 → 命令', () => {
    const ws = tmkdir('p5-01-ws-')
    const maskDir = tmkdir('p5-01-mask-')
    const tool = tmkdir('p5-01-tool-')
    const policy = tmkdir('p5-01-policy-')
    const neverUnderTool = join(tool, '.condarc')
    writeFileSync(neverUnderTool, 'x')
    const argv = dryRun(['--home', '/tmp/p5-01-nohome', '--mask', maskDir, '--never', neverUnderTool, '--tool', tool, '--policy', policy,
      ...profileArgs(ws), '--', '/bin/sh', '-c', 'true'])
    expect(argv[0]).toBe('/usr/bin/bwrap')
    // base 段原样在前（ro-bind / / … 共 9 个元素，占 argv[1..9]）
    expect(argv.slice(1, 10)).toEqual(['--ro-bind', '/', '/', '--dev', '/dev', '--unshare-pid', '--proc', '/proc', '--die-with-parent'])
    // 断网紧跟 base
    expect(argv[10]).toBe('--unshare-net')
    // 遮蔽（目录 tmpfs）在工具链之前
    const maskAt = argv.indexOf(maskDir)
    const toolAt = argv.indexOf(tool)
    expect(maskAt).toBeGreaterThan(10)
    expect(maskAt).toBeLessThan(toolAt)
    // 工具链 ro-bind 在工作区重 bind 之前
    expect(argv[toolAt - 1]).toBe('--ro-bind')
    expect(toolAt).toBeLessThan(argv.indexOf(ws))
    // 策略根在工作区之后
    expect(argv.indexOf(policy)).toBeGreaterThan(argv.indexOf(ws))
    // 再遮垫底：never(工具链内文件)用空普通文件覆盖（f2：--ro-bind-data）
    const remaskAt = argv.indexOf(neverUnderTool)
    expect(remaskAt).toBeGreaterThan(argv.indexOf(policy))
    expect(argv[remaskAt - 4]).toBe('--perms')
    expect(argv[remaskAt - 3]).toBe('0644')
    expect(argv[remaskAt - 2]).toBe('--ro-bind-data')
    expect(argv[remaskAt - 1]).toMatch(/^\d+$/)
    // 末尾 -- 与命令
    expect(argv.at(-1)).toBe('true')
    expect(argv.includes('--')).toBe(true)
  })
})

describe('T7d/T7db：skill 根 ro-bind（binds 派生——bash 写 skill 根必败；父目录自绑防改名）', () => {
  it('挂载序：ws 重 bind < 父目录自绑 < 根 ro-bind < 再遮；缺根 fail-closed 补建（真跑）', () => {
    const ws = tmkdir('t7d-ws-')
    mkdirSync(join(ws, '.dsh/skills'), { recursive: true })
    mkdirSync(join(ws, '.agents/skills'), { recursive: true })
    const never = join(ws, '.condarc')
    writeFileSync(never, 'x')
    const argv = dryRun(['--home', '/tmp/t7d-nohome', '--never', never, ...profileArgs(ws), '--', '/bin/sh', '-c', 'true'])
    const dsh = join(ws, '.dsh/skills')
    const ag = join(ws, '.agents/skills')
    const wsAt = argv.indexOf(ws)
    const dshAt = argv.indexOf(dsh)
    const agAt = argv.indexOf(ag)
    expect(dshAt).toBeGreaterThan(wsAt) // 后挂载覆盖 --bind 写权限
    expect(agAt).toBeGreaterThan(wsAt)
    expect(argv[dshAt - 1]).toBe('--ro-bind')
    expect(argv[agAt - 1]).toBe('--ro-bind')
    const remaskAt = argv.indexOf(never)
    expect(dshAt).toBeLessThan(remaskAt)
    expect(agAt).toBeLessThan(remaskAt)
    // T7db 挂载序：--bind ws < --bind ws/.dsh < --ro-bind ws/.dsh/skills < 再遮（.agents 同）
    const dshDirAt = argv.indexOf(join(ws, '.dsh'))
    expect(dshDirAt).toBeGreaterThan(wsAt)
    expect(dshDirAt).toBeLessThan(dshAt)
    expect(argv[dshDirAt - 1]).toBe('--bind')
    expect(dshAt).toBeLessThan(remaskAt)
    // review 高1（fail-closed）+ T7db：目录缺失也追加（真跑先补建；dry-run 报完整形状且不落盘）
    const bare = tmkdir('t7d-bare-')
    const argv2 = dryRun(['--home', '/tmp/t7d-nohome', ...profileArgs(bare), '--', '/bin/sh', '-c', 'true'])
    expect(argv2.includes(join(bare, '.dsh/skills'))).toBe(true)
    expect(argv2.includes(join(bare, '.agents/skills'))).toBe(true)
    expect(existsSync(join(bare, '.dsh')), 'dry-run 不落盘（.dsh 不建）').toBe(false)
    // 真跑（非 dry）：目录被补建
    const res2 = runWrapper(['--home', '/tmp/t7d-nohome', ...profileArgs(bare), '--', '/bin/true'])
    expect(res2.status, `real run succeeds:\n${res2.stderr}`).toBe(0)
    expect(existsSync(join(bare, '.dsh/skills')), '真跑补建 .dsh/skills').toBe(true)
    expect(existsSync(join(bare, '.agents/skills')), '真跑补建 .agents/skills').toBe(true)
  })
  it('T7db：.dsh 是指向别处的符号链接 → 退出非零、bwrap: 前缀、目标下不建 skills', () => {
    const ws = tmkdir('t7db-sym-')
    const outside = tmkdir('t7db-outside-')
    symlinkSync(join(outside, '.dsh'), join(ws, '.dsh'))
    const res = runWrapper(['--home', '/tmp/t7d-nohome', ...profileArgs(ws), '--', '/bin/true'])
    expect(res.status, 'symlink 拒绝退出非零').not.toBe(0)
    expect(res.stderr.startsWith('bwrap: '), 'bwrap: 前缀').toBe(true)
    expect(existsSync(join(outside, '.dsh', 'skills')), '链接目标下没建 skills').toBe(false)
  })
})

describe('⑧④ 前置：HOME 祖先拒绝（决策 13 ④）与再遮闭合', () => {
  it('工作区等于/是任一 HOME 的祖先 → bwrap: 拒绝、不 exec；工作区在 HOME 之下放行', () => {
    const home = tmkdir('p5-01-home-')
    const inside = join(home, 'ws')
    mkdirSync(inside)
    // 等值 → 拒
    const eq = runWrapper(['--home', home, ...profileArgs(home), '--', '/bin/true'])
    expect(eq.status).not.toBe(0)
    expect(eq.stderr).toContain('bwrap: ')
    // 祖先（HOME 的父目录）→ 拒
    const anc = runWrapper(['--home', home, ...profileArgs(join(home, '..')), '--', '/bin/true'])
    expect(anc.status).not.toBe(0)
    expect(anc.stderr).toContain('bwrap: ')
    // 工作区在 HOME 之下（生产 ~/.config/<app>/workspaces/X 布局）→ 放行
    const ok = runWrapper(['--home', home, ...profileArgs(inside), '--', '/bin/true'])
    expect(ok.status, `bind under HOME must run (stderr: ${ok.stderr})`).toBe(0)
    rmSync(home, { recursive: true, force: true })
  })

  it('再遮：mask 根 == 工作区 → 整根 tmpfs 垫底（⑨ 的再遮一步）', () => {
    const dataDir = tmkdir('p5-01-data-')
    writeFileSync(join(dataDir, 'standing-grants.json'), '{}')
    const argv = dryRun(['--home', '/tmp/p5-01-nohome', '--mask', dataDir, '--never', join(dataDir, 'standing-grants.json'),
      ...profileArgs(dataDir), '--', '/bin/true'])
    // bind 对（src==dst 各一次）之后还有一次 --tmpfs dataDir（再遮整根）
    const bindAt = argv.indexOf('--bind')
    expect(argv[bindAt + 1]).toBe(dataDir)
    expect(argv[bindAt + 2]).toBe(dataDir)
    const remaskAt = argv.lastIndexOf(dataDir)
    expect(argv[remaskAt - 1]).toBe('--tmpfs')
    expect(remaskAt).toBeGreaterThan(bindAt)
    // 更深的 never（standing-grants.json）被顶层 dataDir 覆盖，不再单独出现
    expect(argv).not.toContain(join(dataDir, 'standing-grants.json'))
    rmSync(dataDir, { recursive: true, force: true })
  })
})

describe('真实 exec 冒烟（不经 dry-run）', () => {
  it('f2：文件根遮蔽 = 空普通文件——cat rc=0 且空、类型普通文件、宿主内容不变', () => {
    // 秘密放 /var/tmp（ro-bind 自宿主、不被 --tmpfs /tmp 吸收）——/tmp 下的文件根由
    // 既有 tmpfs 遮蔽（hardened ④），测不到 f2 原语本身
    const secDir = mkdtempSync('/var/tmp/bot-p5-01f2-sec-')
    const secret = join(secDir, 'token')
    writeFileSync(secret, 'TOPSECRET')
    const ws = tmkdir('bot-p5-01f2-ws-')
    const res = runWrapper(['--home', '/tmp/p5-01f2-h', '--mask', secret, ...profileArgs(ws), '--',
      '/bin/sh', '-c', `o=$(cat '${secret}' 2>/dev/null); echo "rc=$? bytes=\${#o}"; test -f '${secret}'; echo "type_f=$?"; test -s '${secret}'; echo "size_s=$?"`])
    expect(res.status, `stderr: ${res.stderr}`).toBe(0)
    // 钉死不变量（P5-01.f2）：rc 与内容双断言 + 类型断言。
    // 旧原语 --ro-bind /dev/null 在 bwrap 0.9.0 用户 bind 强制 MS_NODEV 下
    // cat 必 EACCES rc=1（跨版本漂移），空普通文件的 open 只走 DAC，rc 恒 0。
    expect(res.stdout).toContain('rc=0 bytes=0')
    expect(res.stdout).toContain('type_f=0')
    expect(res.stdout).toContain('size_s=1')
    expect(readFileSync(secret, 'utf8')).toBe('TOPSECRET')
    for (const d of [secDir, ws]) rmSync(d, { recursive: true, force: true })
  })

  it('遮蔽目录内哨兵不可见、命令退出码透传', () => {
    const secret = tmkdir('p5-01-secret-')
    writeFileSync(join(secret, 'sentinel'), 'x')
    const ws = tmkdir('p5-01-ws-')
    const res = runWrapper(['--home', '/tmp/p5-01-nohome', '--mask', secret, ...profileArgs(ws), '--',
      '/bin/sh', '-c', 'test -e ' + join(secret, 'sentinel')])
    expect(res.status, `遮蔽后哨兵不可见（stderr: ${res.stderr}）`).toBe(1)
    // 未遮路径正常执行：命令自身退出码 7 透传
    const ok = runWrapper(['--home', '/tmp/p5-01-nohome', ...profileArgs(ws), '--', '/bin/sh', '-c', 'exit 7'])
    expect(ok.status).toBe(7)
    for (const d of [secret, ws]) rmSync(d, { recursive: true, force: true })
  })
})

// ── P5-22：受控升权 ⑤ 的 wrapper 侧（许可命中 → 宿主侧 supervisor 联网 argv）──
// dry-run 证明：命中的 argv 形状（--unshare-net 保留 + info/block fd + 专用
// resolv.conf ro-bind）；不命中（session/argv/TTL 不符）→ 断网 argv 原样；
// 跨语言对拍：本测试用 mjs issuePermit 签发（JSON.stringify 规范），wrapper
// python json.dumps 规范命中即两侧一致。真跑一例证过期清理（fail-closed 方向：
// 过期许可删掉且命令照常断网执行）。
describe('P5-22 许可命中 → 联网 argv（dry-run）', () => {
  const CMD = 'python3 -I /tmp/p5-22-probe.py --lan 192.0.2.1:1'

  function grantFile(dir: string, session: string, over: Record<string, unknown> = {}): string {
    const p = issuePermit({ dir, session, command: CMD, ttlMs: 60_000, ...over })
    return p.file
  }

  it('命中：--unshare-net 保留 + info/block fd + resolv.conf ro-bind，stderr 有标记，许可不删（dry-run）', () => {
    const dir = tmkdir('bot-p5-22-permits-')
    const file = grantFile(dir, 'sess-hit')
    const res = runWrapper(
      ['--permit-root', dir, '--slirp', '/nonexistent-slirp', ...profileArgs('/tmp'), '--', 'bash', '-c', CMD],
      { DSH_SESSION_ID: 'sess-hit', BWRAP_WRAP_DRY_RUN: '1' })
    expect(res.status, `stderr: ${res.stderr}`).toBe(0)
    const argv = res.stdout.trim().split('\n')
    expect(argv).toContain('--unshare-net') // D1-r1：绝不去掉 --unshare-net
    expect(argv).toContain('--info-fd')
    expect(argv).toContain('--block-fd')
    const ri = argv.indexOf('<RESOLV-CONF>')
    expect(ri, 'resolv ro-bind present').toBeGreaterThan(-1)
    expect(argv[ri + 1]).toBe("/etc/resolv.conf") // 专用只读 resolv.conf 覆盖 base
    expect(res.stderr).toContain('network permit matched')
    expect(existsSync(file)).toBe(true) // dry-run 不消耗
    rmSync(dir, { recursive: true, force: true })
  })

  it('不命中三态：session 不符 / argv 不符 / 过期 → 断网 argv（无 info-fd）', () => {
    const dir = tmkdir('bot-p5-22-permits-')
    grantFile(dir, 'sess-a')
    // session 不符（bash 收到 sess-b）
    for (const [env, cmd, label] of [
      [{ DSH_SESSION_ID: 'sess-b' }, CMD, 'session mismatch'],
      [{ DSH_SESSION_ID: 'sess-a' }, 'echo other', 'argv mismatch'],
    ] as Array<[Record<string, string>, string, string]>) {
      const res = runWrapper(
        ['--permit-root', dir, '--slirp', '/nonexistent-slirp', ...profileArgs('/tmp'), '--', 'bash', '-c', cmd],
        { BWRAP_WRAP_DRY_RUN: '1', ...env })
      expect(res.status, label).toBe(0)
      expect(res.stdout).not.toContain('--info-fd')
    }
    // 过期：wrapper 真跑（断网路径执行 true）→ 许可被清理
    const ws = tmkdir('bot-p5-22-ws-')
    const stale = issuePermit({ dir, session: 'sess-a', command: CMD, ttlMs: -1000 })
    const run = runWrapper(
      ['--permit-root', dir, '--slirp', '/nonexistent-slirp', ...profileArgs(ws), '--', '/bin/true'],
      { DSH_SESSION_ID: 'sess-a' })
    expect(run.status, `stderr: ${run.stderr}`).toBe(0)
    expect(existsSync(stale.file)).toBe(false)
    rmSync(dir, { recursive: true, force: true })
    rmSync(ws, { recursive: true, force: true })
  })

  it('无 --permit-root：行为与断网现状完全一致（无 info-fd）', () => {
    const res = runWrapper([...profileArgs('/tmp'), '--', 'bash', '-c', CMD], { BWRAP_WRAP_DRY_RUN: '1', DSH_SESSION_ID: 'x' })
    expect(res.status).toBe(0)
    expect(res.stdout).not.toContain('--info-fd')
    expect(res.stdout).not.toContain('/etc/resolv.conf')
  })
})
