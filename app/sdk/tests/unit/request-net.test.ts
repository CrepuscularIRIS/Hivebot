// P5-22 单测：受控升权 ⑤ 的签发侧（src/policy/request-net.mjs）。
// 覆盖：hashArgv 与 wrapper 侧 python json 规范跨语言一致（对拍真实
// python3 计算值）；issuePermit 的目录自动创建、0600、字段、随机名、O_EXCL
// 不覆盖；参数校验（reason/command 形状与长度）；缺 permitDir fail loud。
// 联网执行面（wrapper supervisor、slirp、探针差分）在 e2e
// tests/e2e/request-network.test.ts。
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hashArgv, issuePermit, validateRequest, PERMIT_VERSION } from '../../src/policy/request-net.mjs'

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
