// P5-22 单测：受控升权 ⑤ 的签发侧（src/policy/request-net.mjs）。
// 覆盖：hashArgv 与 wrapper 侧 python json 规范跨语言一致（对拍真实
// python3 计算值）；issuePermit 的目录自动创建、0600、字段、随机名、O_EXCL
// 不覆盖；参数校验（reason/command 形状与长度）；缺 permitDir fail loud。
// 联网执行面（wrapper supervisor、slirp、探针差分）在 e2e
// tests/e2e/request-network.test.ts。
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { claimLivePermit, hashArgv, issuePermit, validateRequest, PERMIT_VERSION } from '../../src/policy/request-net.mjs'

const tmkdir = () => mkdtempSync(join(tmpdir(), 'p5-22-unit-'))

describe('hashArgv（与 bwrap-wrap.py 的 json 规范跨语言一致）', () => {
  it('对真实 python3 json.dumps 的值对拍一致（含 unicode 与转义）', () => {
    const argv = ['bash', '-c', 'echo "héllo wörld \\ $var `x` \'q\'\ttab']
    const py = spawnSync('/usr/bin/python3', ['-I', '-c',
      'import hashlib,json,sys; a=json.loads(sys.argv[1]); print(hashlib.sha256(json.dumps(a, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest())',
      JSON.stringify(argv)], { encoding: 'utf8' })
    expect(py.status, py.stderr).toBe(0)
    expect(hashArgv(argv)).toBe(py.stdout.trim())
  })

  it('空串与多元素 argv 均为 64 位 hex', () => {
    for (const argv of [['bash', '-c', ''], ['bash', '-c', 'a'], ['x', 'y', 'z', 'w']]) {
      expect(hashArgv(argv)).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('不同 command 不同 hash', () => {
    expect(hashArgv(['bash', '-c', 'a'])).not.toBe(hashArgv(['bash', '-c', 'b']))
  })
})

describe('issuePermit', () => {
  it('自动创建目录、0600、字段齐全、TTL = ttlMs', () => {
    const dir = join(tmkdir(), 'network-permits')
    const p = issuePermit({ dir, session: 'sess-a', command: 'curl example.com', ttlMs: 60_000 })
    expect(readdirSync(dir)).toEqual([p.name])
    const st = statSync(p.file)
    expect(st.mode & 0o777).toBe(0o600)
    const permit = JSON.parse(readFileSync(p.file, 'utf8'))
    expect(permit.version).toBe(PERMIT_VERSION)
    expect(permit.session).toBe('sess-a')
    expect(permit.argvHash).toBe(hashArgv(['bash', '-c', 'curl example.com']))
    expect(permit.expiresAt - permit.issuedAt).toBe(60_000)
    expect(typeof permit.nonce).toBe('string')
  })

  it('随机文件名不碰撞（同参数两次签发两个文件）', () => {
    const dir = join(tmkdir(), 'network-permits')
    const a = issuePermit({ dir, session: 's', command: 'c', ttlMs: 1000 })
    const b = issuePermit({ dir, session: 's', command: 'c', ttlMs: 1000 })
    expect(a.name).not.toBe(b.name)
    expect(readdirSync(dir)).toHaveLength(2)
  })
})

describe('validateRequest', () => {
  it('拒绝缺失 / 非字符串 / 超长 command', () => {
    expect(validateRequest({ reason: 'r', command: 'c' })).toBeNull()
    expect(validateRequest({ reason: '', command: 'c' })).toMatch(/reason/)
    expect(validateRequest({ reason: 'r', command: '' })).toMatch(/command/)
    expect(validateRequest({ reason: 'r' })).toMatch(/command/)
    expect(validateRequest({ command: 'c' })).toMatch(/reason/)
    expect(validateRequest({ reason: 'r', command: 'x'.repeat(8193) })).toMatch(/too long|length|8192/i)
    expect(validateRequest(null)).toMatch(/arguments/)
  })
})

describe('apply fail loud（缺 permitDir 不加载，fail closed）', () => {
  it('config 无 permitDir → apply 抛错', async () => {
    const mod = await import('../../src/policy/request-net.mjs')
    expect(() => mod.apply({}, {})).toThrow(/permitDir/)
  })
})

// ── L-8 R4（P5-W3.f3）：一次性联网许可的原子抢占（原 hasLivePermit 只读 → 多个
// 后台 bash 共享一次许可重复执行本地副作用）。抢占 = rename permit-*.json →
// claim-*.json：本侧与后续 pre-execute 不再命中；wrapper 侧按 *.json + session/
// argvHash 认领（联网授权不失）。
describe('claimLivePermit（L-8 R4：原子抢占，单次授权语义）', () => {
  it('命中即抢占（permit-* 改名消失）；同一许可只赢一次；非本会话/非本命令不消耗', () => {
    const dir = tmkdir()
    try {
      issuePermit({ dir, session: 's1', command: 'curl a.example' })
      issuePermit({ dir, session: 's2', command: 'curl b.example' })
      expect(claimLivePermit(dir, 's1', 'curl other.example'), '命令不匹配：不抢占').toBe(false)
      expect(readdirSync(dir).filter((n) => n.startsWith('permit-'))).toHaveLength(2)
      expect(claimLivePermit(dir, 's1', 'curl a.example'), '命中并抢占').toBe(true)
      expect(claimLivePermit(dir, 's1', 'curl a.example'), '同一许可只授权一次').toBe(false)
      expect(claimLivePermit(dir, 's2', 'curl b.example'), '另一会话的许可不受影响').toBe(true)
      expect(readdirSync(dir).filter((n) => n.startsWith('permit-')), '原许可全部移走').toHaveLength(0)
      expect(readdirSync(dir).filter((n) => n.endsWith('.json')), '抢占产物以 claim-*.json 存活').toHaveLength(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('抢占产物可被 wrapper 的 claim_permit 认领联网（真 python3 dry-run 对拍）', () => {
    const dir = tmkdir()
    try {
      issuePermit({ dir, session: 'sw', command: 'curl w.example' })
      expect(claimLivePermit(dir, 'sw', 'curl w.example')).toBe(true)
      const py = spawnSync('/usr/bin/python3', ['-I', '-B', '-c', `
import importlib.util, json, os, sys
spec = importlib.util.spec_from_file_location('bw', sys.argv[1])
bw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bw)
os.environ['DSH_SESSION_ID'] = 'sw'
got = bw.claim_permit(sys.argv[2], ['bash', '-c', 'curl w.example'], False)
print(json.dumps({'matched': got is not None, 'session': (got or {}).get('session')}))
`,
        join(dirname(fileURLToPath(import.meta.url)), '../../sandbox/bwrap-wrap.py'), dir], { encoding: 'utf8' })
      expect(py.status, py.stderr).toBe(0)
      expect(JSON.parse(py.stdout), 'wrapper dry-run 仍认领改名后的许可（联网授权不失）').toEqual({ matched: true, session: 'sw' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
