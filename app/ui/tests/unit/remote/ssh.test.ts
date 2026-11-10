// T46b：remote.json 解析、connect 行解析、argv 钉死、sshBin——纯函数单测（先红：模块不存在）。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readRemoteConfig, parseConnectLine, connectArgv, tunnelArgv, sshBin } from '../../../main/remote/ssh'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'bot-t46b-unit-'))
const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

describe('T46b readRemoteConfig', () => {
  it('缺文件 → undefined', () => {
    expect(readRemoteConfig(join(tmp(), 'nope'))).toBeUndefined()
  })
  it('正常 {"host":"mybox"} → {host}', () => {
    const d = tmp(); dirs.push(d)
    writeFileSync(join(d, 'remote.json'), '{"host":"mybox"}')
    expect(readRemoteConfig(d)).toEqual({ host: 'mybox' })
  })
  it('首字符 - → 拒（ssh 选项注入面）', () => {
    const d = tmp(); dirs.push(d)
    writeFileSync(join(d, 'remote.json'), '{"host":"-Fevil"}')
    expect(readRemoteConfig(d)).toBeUndefined()
  })
  it('含空格 → 拒；含 = → 拒', () => {
    const d = tmp(); dirs.push(d)
    writeFileSync(join(d, 'remote.json'), '{"host":"a b"}')
    expect(readRemoteConfig(d)).toBeUndefined()
    const d2 = tmp(); dirs.push(d2)
    writeFileSync(join(d2, 'remote.json'), '{"host":"a=b"}')
    expect(readRemoteConfig(d2)).toBeUndefined()
  })
  it('多余键 → 拒（免得用户以为 port/command 生效）', () => {
    const d = tmp(); dirs.push(d)
    writeFileSync(join(d, 'remote.json'), '{"host":"a","port":22}')
    expect(readRemoteConfig(d)).toBeUndefined()
  })
  it('非对象 → 拒；host 非字符串 → 拒', () => {
    const d = tmp(); dirs.push(d)
    writeFileSync(join(d, 'remote.json'), '["a"]')
    expect(readRemoteConfig(d)).toBeUndefined()
    const d2 = tmp(); dirs.push(d2)
    writeFileSync(join(d2, 'remote.json'), '{"host":1}')
    expect(readRemoteConfig(d2)).toBeUndefined()
  })
  it('超长（>253）→ 拒', () => {
    const d = tmp(); dirs.push(d)
    writeFileSync(join(d, 'remote.json'), JSON.stringify({ host: 'a'.repeat(254) }))
    expect(readRemoteConfig(d)).toBeUndefined()
  })
})

describe('T46b parseConnectLine', () => {
  const ok = 'HIVEBOT-CONNECT {"base_url":"http://127.0.0.1:45678","token":"abcdefABCDEF123456_-~.","remote_root":"/srv/box","version":1}'
  it('正常行 → 三值', () => {
    expect(parseConnectLine(`${ok}\n`)).toMatchObject({ baseUrl: 'http://127.0.0.1:45678', token: 'abcdefABCDEF123456_-~.', remoteRoot: '/srv/box' })
  })
  it('非回环地址 → 拒；https → 拒；端口越界 → 拒', () => {
    const mk = (url: string): string => `HIVEBOT-CONNECT {"base_url":"${url}","token":"abcdefABCDEF123456_-~.","remote_root":"/srv","version":1}`
    expect(() => parseConnectLine(mk('http://10.0.0.1:1234') + '\n')).toThrow()
    expect(() => parseConnectLine(mk('https://127.0.0.1:1234') + '\n')).toThrow()
    expect(() => parseConnectLine(mk('http://127.0.0.1:99999') + '\n')).toThrow()
  })
  it('token 坏字符 → 拒；过短 → 拒', () => {
    const mk = (t: string): string => `HIVEBOT-CONNECT {"base_url":"http://127.0.0.1:1234","token":"${t}","remote_root":"/srv","version":1}`
    expect(() => parseConnectLine(mk('short') + '\n')).toThrow()
    expect(() => parseConnectLine(mk('has space in token xxx') + '\n')).toThrow()
  })
  it('remote_root 相对路径 / 含 .. → 拒', () => {
    const mk = (r: string): string => `HIVEBOT-CONNECT {"base_url":"http://127.0.0.1:1234","token":"abcdefABCDEF123456_-~.","remote_root":"${r}","version":1}`
    expect(() => parseConnectLine(mk('srv/rel') + '\n')).toThrow()
    expect(() => parseConnectLine(mk('/a/../b') + '\n')).toThrow()
  })
  it('前面有杂行（含可能的垃圾）→ 仍取 HIVEBOT-CONNECT 行；没有该行 → 拒', () => {
    expect(parseConnectLine(`some noise\n${ok}\n`)).toMatchObject({ token: 'abcdefABCDEF123456_-~.' })
    expect(() => parseConnectLine('nothing here\n')).toThrow()
  })
  it('带 token 的坏行：错误消息不含 token', () => {
    const bad = 'HIVEBOT-CONNECT {"base_url":"http://10.0.0.1:1","token":"SECRETtoken1234567890","remote_root":"/srv","version":1}'
    try { parseConnectLine(bad + '\n'); throw new Error('should throw') }
    catch (e) { expect(String(e.message)).not.toContain('SECRETtoken') }
  })
})

describe('T46b argv 钉死', () => {
  it('connectArgv：host 在 -- 后、写死项逐项相等', () => {
    expect(connectArgv('mybox')).toEqual(['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '--', 'mybox', '~/.local/bin/hivebot serve --connect'])
  })
  it('tunnelArgv：-N + 保活 + -L 在 -- 前、host 最后', () => {
    expect(tunnelArgv('mybox', 45555, 37761)).toEqual(['-N', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', '-L', '127.0.0.1:45555:127.0.0.1:37761', '--', 'mybox'])
  })
  it('sshBin：win32 用 SystemRoot 绝对路径；其他走 PATH 的 ssh', () => {
    expect(sshBin('win32', { SystemRoot: 'C:\\Windows' })).toBe('C:\\Windows\\System32\\OpenSSH\\ssh.exe')
    expect(sshBin('linux', {})).toBe('ssh')
  })
})
