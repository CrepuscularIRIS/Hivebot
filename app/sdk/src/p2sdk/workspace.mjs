// T11（DESIGN-ssh-composition D5）：main 侧远端工作区 RPC。
// p2sdk/workspace_ensure（TypertRemoteService：namespace 'p2sdk'，方法
// workspace_ensure；p610/control 同款机制）：经 ctx.subprocess.spawn 跑
// `mkdir -p -- <path>`（ssh 下=远端执行；固定 argv、无 shell、不经模型），
// 执行前词法校验；返回远端 canonical 路径（readlink -f ——P2 收口：guard 判定
// 用 canonical，替代「每调用重 resolve」的错误修法，见审查 P2 经理核实）。
// 挂载：ssh 模式的 runtime patch 行（start.ts sshRows insert，config 注入
// remoteRoot）；本机模式不挂（mintWorkspace 本机分支逐字不变）。
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require_ = createRequire(import.meta.url)
// p610-inspect 同款：经 dsh-plugin-market 的 require 域解析 typert-protocol
const fromMarket = createRequire(require_.resolve('@deepseek-ai/dsh-plugin-market'))
const { TypertRemoteService, RemoteError } = await import(pathToFileURL(fromMarket.resolve('@deepseek-ai/dsh-typert-protocol')))

const BOT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/

export default class WorkspaceService extends TypertRemoteService {
  static inject = ['subprocess']

  constructor(ctx, config = {}) {
    super(ctx, 'p2sdkWorkspace', { namespace: 'p2sdk' })
    if (typeof config.remoteRoot !== 'string' || config.remoteRoot.length === 0) {
      throw new Error('p2sdk/workspace: config.remoteRoot is required (start.ts sshRows 注入)')
    }
    this.p2sdkRemoteRoot = config.remoteRoot
  }

  /** 词法校验：<remoteRoot>/workspaces/<botId>（末段 botId 形状；拒绝 .. 与越界）。 */
  p2sdkValidate(botId) {
    if (!BOT_ID_RE.test(botId)) throw new RemoteError('p2sdk/workspace/bad-bot-id', `botId shape rejected: ${JSON.stringify(botId)}`, {})
    return `${this.p2sdkRemoteRoot.replace(/\/+$/, '')}/workspaces/${botId}`
  }

  async p2sdkRun(argv) {
    const handle = this.ctx.subprocess.spawn({ argv, cwd: this.p2sdkRemoteRoot, stdio: { stdin: 'ignore', stdout: { maxBytes: 4096 }, stderr: { maxBytes: 4096 } }, graceMs: 15_000 })
    // subprocess-ssh 的 handle.done resolve 值即 {exitCode, signal}（waitForExit
    // 无参时返回 boolean——T11diag2 实测踩坑）
    const outcome = await handle.done
    const out = handle.collected.stdout?.readFrom(0).text ?? ''
    if (outcome.exitCode !== 0) {
      throw new RemoteError('p2sdk/workspace/exec-failed', `argv failed: ${JSON.stringify(argv)}`, { exitCode: outcome.exitCode, stderr: handle.collected.stderr?.readFrom(0).text ?? '' })
    }
    return out.trim()
  }

  /**
   * 建（或确认）远端工作区，返回 canonical 路径。
   * @param {{ botId: string }} request
   */
  async workspace_ensure(request) {
    const path = this.p2sdkValidate(String(request?.botId ?? ''))
    await this.p2sdkRun(['mkdir', '-p', '--', path])
    // T7d：skill 根预建（远端）——wrapper 的 ro-bind 只挂已存在目录（bwrap-wrap.py 从
    // binds 派生）；预建后 bash 写 .dsh/skills/.agents/skills 必撞只读挂载点（与
    // write/edit 出卡同语义）。mkdir -p 幂等，重复 ensure 无害。
    for (const sub of ['.dsh/skills', '.agents/skills']) {
      await this.p2sdkRun(['mkdir', '-p', '--', `${path}/${sub}`])
    }
    const canonical = await this.p2sdkRun(['readlink', '-f', '--', path])
    if (canonical !== path) {
      // P2 收口：链接后的真实路径回传给 main 存档（header.cwd 不可变，存 canonical）
      // ——canonical 必须仍在 <remoteRoot>/workspaces/ 下（防 link 出区）。
      const base = `${this.p2sdkRemoteRoot.replace(/\/+$/, '')}/workspaces/`
      if (!canonical.startsWith(base)) throw new RemoteError('p2sdk/workspace/canonical-outside', `canonical ${canonical} escaped ${base}`, {})
    }
    return { path, canonical }
  }
}

// typert-protocol 的方法路由按 remoteMethods marker 扫（dsh-api-gateway lib:936
// claims.add(endpointOf(namespace, candidate.exportName ?? candidate.method))）；
// mark() 不导出、@Remote 装饰器在 .mjs 裸 node 不可用——照 lib:449-468 的
// descriptor 形态程序化注册（version 1 / method / direct invocation）。
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'
Object.defineProperty(WorkspaceService.prototype, REMOTE_METHOD_DESCRIPTOR, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([Object.freeze({
      method: 'workspace_ensure',
      invocation: Object.freeze({ kind: 'direct' }),
    })]),
  }),
})
