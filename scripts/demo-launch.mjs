// 人类模拟测试拉起器 v2：真模型（litellm glm-5.3-flash）+ CDP 端口 + 固定可复用目录。
// 用法：env -u ELECTRON_RUN_AS_NODE node /tmp/demo-launch.mjs
// 关键改进（对 v1）：
//  - P2SDK_LLM_API_KEY/BASE_URL 从 app/ui/.env 注入（v1 漏传 key，runtime 静默落 mock）
//  - Electron 加 --remote-debugging-port=9224（v1 无 CDP，ego/脚本看不见 UI 内部）
//  - 固定 /tmp/hsim-{home,handoff,shell-home}（不 tmkdir，便于重复测试与状态检查）
import { spawn } from 'node:child_process'
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const UI = '/home/lingxufeng/bot/app/ui'
const SDK = join(UI, '..', 'sdk')
const ROOT = '/tmp/hsim'

// .env 解析（只取 LITELLM_*，凭证不落本文件不回显）
const envLines = readFileSync(join(UI, '.env'), 'utf8').split('\n')
const MASTER_KEY = (envLines.find((l) => l.startsWith('LITELLM_MASTER_KEY=')) ?? '').slice('LITELLM_MASTER_KEY='.length).trim()
if (!MASTER_KEY) { console.error('FATAL: LITELLM_MASTER_KEY missing in app/ui/.env'); process.exit(1) }
const LLM_BASE = 'http://127.0.0.1:4001'

// 目录（复用前清）
for (const d of ['fake', 'home', 'handoff']) rmSync(join(ROOT, d), { recursive: true, force: true })  // shell-home 保留：主 bot 状态跨重启
mkdirSync(join(ROOT, 'fake'), { recursive: true })

// patches
const pluginUrl = pathToFileURL(join(SDK, 'tests', 'support', 'fake', 'plugin.mjs')).href
// 真模型：不叠 fake overlay（v2 教训：agent-default-model→p2fake 会把会话钉死到 fake provider，
// P2SDK_LLM_API_KEY 传了也无效——症状 turn/end 无 assistant/message + 'no scripted call'）
const overlay = join(ROOT, 'fake', 'noop.yml')
writeFileSync(overlay, '# no-op: real-model run keeps only the superagent patch\n')
const saPatch = join(ROOT, 'fake', 'superagent.yml')
writeFileSync(saPatch, `- insert:
    - id: dsh-superagent
      name: '${pathToFileURL(join(UI, '..', 'superagent', 'lib', 'index.js')).href}'
      config:
        stateDir: '${join(ROOT, 'sa-state')}'
        dataDir: '${join(ROOT, 'shell-home/.config/Electron')}'
`)

// runtime（真模型）
const home = join(ROOT, 'home'), handoff = join(ROOT, 'handoff')
const runtime = spawn(process.execPath, [join(SDK, 'scripts', 'start.mjs')], {
  env: {
    ...process.env,
    P2SDK_PROVIDER: 'litellm',
    P2SDK_LLM_API_KEY: MASTER_KEY,
    P2SDK_LLM_BASE_URL: LLM_BASE,
    P2SDK_HOME: home, P2SDK_HANDOFF: handoff, P2SDK_PORT: '0',
    P2SDK_PATCH: `${saPatch}`, P2SDK_READY_TIMEOUT_MS: '120000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let out = ''
runtime.stdout.on('data', (c) => { out += c })
runtime.stderr.on('data', (c) => { out += c; if (process.env.HSIM_VERBOSE) process.stderr.write('[rt!] ' + c) })
await new Promise((res, rej) => {
  const t = setInterval(() => { if (/\[p2sdk\] ready http/.test(out)) { clearInterval(t); res() } }, 200)
  setTimeout(() => { clearInterval(t); rej(new Error('runtime not ready: ' + out.slice(-400))) }, 120000)
})
console.log('runtime-ready handoff=' + handoff)

// Electron 壳（CDP 9224 + 真显示器）
const shellHome = join(ROOT, 'shell-home')
mkdirSync(join(shellHome, '.config', 'Electron', 'workspaces'), { recursive: true })  // 会话 cwd 的父链：竞态修复（首条消息 working-directory does not exist）
const { createRequire } = await import('node:module')
const require = createRequire(join(UI, 'package.json'))
const electron = require('electron')
const shell = spawn(electron, [join(UI, 'out', 'main', 'index.js'), '--disable-gpu', '--remote-debugging-port=9224', '--remote-allow-origins=*'], {
  cwd: UI,
  env: { ...process.env, HOME: shellHome, PBOTS_DSH_HANDOFF: handoff, ELECTRON_RUN_AS_NODE: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
shell.stdout.on('data', (c) => { if (process.env.HSIM_VERBOSE) process.stdout.write('[ui] ' + c) })
shell.stderr.on('data', (c) => { if (process.env.HSIM_VERBOSE) process.stderr.write('[ui!] ' + c) })
console.log('shell-launched pid=' + shell.pid + ' cdp=http://127.0.0.1:9224')
process.on('SIGINT', () => { runtime.kill(); shell.kill(); process.exit(0) })
setInterval(() => {}, 60000)
