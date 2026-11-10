// T46b：remote.json 解析、connect 行解析、argv 钉死、sshBin——纯函数单测（先红：模块不存在）。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { readRemoteConfig, parseConnectLine, connectArgv, tunnelArgv, sshBin, waitPort, openRemote } from '../../../main/remote/ssh'

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


// T46b 任务C：waitPort——截止时间内轮询（隧道 -L 绑定是异步的，单次 connect 会在未绑定时立即 false）
describe('T46b waitPort 轮询', () => {
  it('端口 600ms 后才 listen → 3000ms 内 true（并发启动：先占端口再关，waitPort 与延迟 listen 赛跑）', async () => {
    const net = require('node:net') as typeof import('node:net')
    const s0 = net.createServer()
    await new Promise<void>((r) => { s0.listen(0, '127.0.0.1', () => r()) })
    const port = (s0.address() as { port: number }).port
    await new Promise<void>((r) => s0.close(() => r())) // 端口已定且无人 listen
    const s = net.createServer()
    setTimeout(() => { s.listen(port, '127.0.0.1') }, 600) // waitPort 等待期间才出现
    const ok = await waitPort(port, 3000)
    expect(ok, '600ms 后出现的端口能等到').toBe(true)
    s.close()
  }, 10_000)
  it('端口从不 listen → 800ms 后 false 且耗时 ≥700ms', async () => {
    // 占一个端口再关掉（无人 listen）
    const s = require('node:net').createServer() as import('node:net').Server
    await new Promise<void>((r) => { s.listen(0, '127.0.0.1', () => r()) })
    const port = (s.address() as { port: number }).port
    await new Promise<void>((r) => s.close(() => r()))
    const t0 = Date.now()
    const ok = await waitPort(port, 800)
    expect(ok).toBe(false)
    expect(Date.now() - t0, '轮询到截止（不是立即返回）').toBeGreaterThanOrEqual(700)
  }, 10_000)
})


// T46b 任务C(二)：openRemote 的隧道三态——慢绑定等得到、秒退不假活、ENOENT 不 uncaught
describe('T46b openRemote 隧道三态', () => {
  const uncaught: unknown[] = []
  const prevHandler = process.listenerCount('uncaughtException')
  beforeAll(() => { process.on('uncaughtException', (e) => { uncaught.push(e) }) })
  afterAll(() => { process.removeAllListeners('uncaughtException'); if (prevHandler > 0) process.on('uncaughtException', () => {}) })
  it('慢绑定（600ms 后才监听）→ openRemote 成功且 baseUrl 可连', async () => {
    const net = require('node:net') as typeof import('node:net')
    const fs = require('node:fs') as typeof import('node:fs')
    const os = require('node:os') as typeof import('node:os')
    const srv = net.createServer()
    await new Promise<void>((r) => { srv.listen(0, '127.0.0.1', () => r()) })
    const remotePort = (srv.address() as { port: number }).port
    const stub = fs.mkdtempSync(join(os.tmpdir(), 't46b-stub3-')) + '/ssh-stub.cjs'
    fs.writeFileSync(stub, [
      'const n = require("node:net")',
      `const LINE = 'HIVEBOT-CONNECT ' + JSON.stringify({ base_url: 'http://127.0.0.1:${remotePort}', token: 'abcdefABCDEF123456_-~x', remote_root: '/srv', version: 1 })`,
      'if (process.argv[2] === "-N") {',
      '  // 隧道：600ms 后在本地 -L 端口上起真监听，把连接双向桥到远端口',
      '  const lp = Number(process.argv[process.argv.indexOf("-L") + 1].split(":")[1])',
      '  setTimeout(() => {',
      `    n.createServer((c) => { const u = n.connect(${remotePort}, '127.0.0.1'); c.pipe(u); u.pipe(c); c.on('error', () => {}); u.on('error', () => c.destroy()) }).listen(lp, '127.0.0.1')`,
      '  }, 600)',
      '} else { console.log(LINE) }',
      '',
    ].join('\n'))
    const h = await openRemote({ host: 'h' }, { bin: 'node ' + stub })
    const lp = Number(new URL(h.baseUrl).port)
    const ok = await new Promise<boolean>((res) => { const s2 = net.connect(lp, '127.0.0.1', () => { s2.destroy(); res(true) }); s2.on('error', () => res(false)) })
    expect(ok, '转发口真可连').toBe(true)
    h.close()
    srv.close()
  }, 20_000)
  it('隧道秒退（-N 立即 exit 1）→ openRemote 抛固定错误（不返回死端口、不 uncaught）', async () => {
    const fs = require('node:fs') as typeof import('node:fs')
    const os = require('node:os') as typeof import('node:os')
    const stub = fs.mkdtempSync(join(os.tmpdir(), 't46b-stub4-')) + '/ssh-stub.cjs'
    fs.writeFileSync(stub, [
      `const LINE = 'HIVEBOT-CONNECT ' + JSON.stringify({ base_url: 'http://127.0.0.1:9', token: 'abcdefABCDEF123456_-~x', remote_root: '/srv', version: 1 })`,
      'if (process.argv[2] === "-N") process.exit(1)',
      'else console.log(LINE)',
      '',
    ].join('\n'))
    const before = uncaught.length
    await expect(openRemote({ host: 'h' }, { bin: 'node ' + stub })).rejects.toThrow(/remote: invalid/)
    expect(uncaught.length, '无 uncaught（回调 throw 洞）').toBe(before)
  }, 20_000)
  it('ENOENT（bin 不存在）→ openRemote 抛固定错误、不 uncaught', async () => {
    const before = uncaught.length
    await expect(openRemote({ host: 'h' }, { bin: 'node /nonexistent-ssh-stub-xyz.cjs' })).rejects.toThrow(/remote: invalid/)
    expect(uncaught.length, '无 uncaught').toBe(before)
  }, 20_000)
})
