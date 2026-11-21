// P5-51.f2 取证②：用真实 runnerCommand argv + dsh bwrapProfileArgs 真实形状跑 wrapper。
import { readFileSync, mkdirSync } from 'node:fs'
// a) BWRAP_WRAP_DRY_RUN=1 → 打印最终 bwrap argv，实证 --tmpfs /tmp 与工作区 --bind 的先后；
// b) 真实 exec → 工作区内 touch 成功、工作区外（e2e 的 ws=/tmp/bot-p551-ws-*）touch ENOENT。
import { spawnSync } from 'node:child_process'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { argv } = JSON.parse(readFileSync('/tmp/bot-P5-51f2/runner-argv.json', 'utf8'))
const py = ['-I', argv[2]] // python3 -I bwrap-wrap.py（spawnSync 的 args 部分）
const wrapper = argv.slice(3) // wrapper 选项（--home/--mask/...）
const shellHome = mkdtempSync(join(tmpdir(), 'bot-U-00-'))          // e2e launchShell 的临时 HOME
const dataDir = join(shellHome, 'data')                              // shellChildEnv 的 PBOTS_DATA_DIR
const botWs = join(dataDir, 'workspaces', 'session-aaaa')            // P5-25 强制工作区（在 /tmp 下）
rmSync(botWs, { recursive: true, force: true })
mkdirSync(botWs, { recursive: true })
const e2eWs = mkdtempSync(join(tmpdir(), 'bot-p551-ws-'))            // grok-shim e2e 的 ws（runtime cwd）
mkdirSync(join(e2eWs), { recursive: true })

// dsh-sandbox-local 0.2.2-alpha.2 bwrapProfileArgs(policy) 的真实顺序（lib/index.js:22-38）
const profile = [
  '--ro-bind', '/', '/',
  '--dev', '/dev',
  '--unshare-pid',
  '--proc', '/proc',
  '--die-with-parent',
  '--tmpfs', '/tmp',
  '--bind', botWs, botWs,
]
const cmd = (c) => [...wrapper, ...profile, '--', '/bin/bash', '-c', c]

// a) dry-run：打印最终 argv
const dry = spawnSync('/usr/bin/python3', [...py, ...cmd('true')], { env: { ...process.env, BWRAP_WRAP_DRY_RUN: '1', DSH_SESSION_ID: 'session-aaaa' }, encoding: 'utf8' })
if (dry.status !== 0) throw new Error('dry-run failed: ' + dry.stderr)
const lines = dry.stdout.trim().split('\n')
console.log('== 最终 bwrap argv（dry-run，每行一元素）==')
lines.forEach((l, i) => console.log(String(i).padStart(3), l))
const tmpfsAt = lines.indexOf('/tmp')
const bindAt = lines.findIndex((_, i) => lines[i - 1] === '--bind' && lines[i] === botWs)
console.log(`\ntmpfs /tmp 参数位=${lines.lastIndexOf('--tmpfs')}（值位 ${tmpfsAt}）；工作区 --bind 参数位=${lines.indexOf('--bind')}（值位 ${bindAt}）`)
console.log(bindAt > tmpfsAt ? '>> 工作区 bind 在 --tmpfs /tmp 之后（后挂载者可见）' : '>> !!! bind 在 tmpfs 之前（会被遮）')

// b) 真实 exec
const r1 = spawnSync('/usr/bin/python3', [...py, ...cmd(`touch ${join(botWs, 'inside-ok')}`)], { encoding: 'utf8' })
console.log(`\n== 真实执行：touch 工作区内 ${join(botWs, 'inside-ok')} → rc=${r1.status} ${r1.stderr.trim()}`)
console.log('   宿主可见:', existsSync(join(botWs, 'inside-ok')))
const r2 = spawnSync('/usr/bin/python3', [...py, ...cmd(`touch ${join(e2eWs, 'p551-ok')}`)], { encoding: 'utf8' })
console.log(`== 真实执行：touch 工作区外(e2e 的 ws) ${join(e2eWs, 'p551-ok')} → rc=${r2.status} stderr=${r2.stderr.trim().slice(0, 120)}`)
console.log('   宿主可见:', existsSync(join(e2eWs, 'p551-ok')))
