// T10（DESIGN-ssh-composition D4 r2）：ssh 模式的 sandbox runner 收口。
// 上游 SshSandboxProvider.confine() 返回远端 helper 组的 argv
// [<bwrap>, …profile…, --, cmd]（读不设防——helper 无配置挂 LocalSandboxProvider，
// profile 以只读宿主根起头，复审核实本机测试 bot 能 cat 宿主 ~/.ssh）。本类把
// argv[0] 换成宿主 wrapper 调用：参数集 = wrapperArgv(cfg)（宿主全套）∪ 远端根
// （--home/--mask <remoteHome>、--never <远端硬根>、--policy <remoteRuntimeDir>），
// 原 argv 的 `--` 后段（真正的命令）原样保留。坏 wrapper → python/bwrap 报错 →
// bash 执行失败（shell-ask 第 1 行档位「wrapper 坏则必失败」的前提，D3）。
// danger-full-access 时上游绕过 confine()，与本机同语义。
// ponytail: 两次 confine 之间远端可换 profile——与本机 fs 写侧窗口同类（fs-zone.mjs:6-7），
// 读遮蔽由 wrapper 在 exec 时刻一次性生效，窗口内换的 profile 同样被 wrapper 参数罩住。
import { createRequire } from 'node:module'

const requireFromDsh = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const { default: SshSandboxProvider } = await import(requireFromDsh.resolve('@deepseek-ai/dsh-sandbox-ssh'))
const { SandboxUnavailableError } = await import(requireFromDsh.resolve('@deepseek-ai/dsh-sandbox'))
const { basename } = await import('node:path')

export class ZoneCheckedSshSandboxProvider extends SshSandboxProvider {
  /** @type {string[]} 宿主 wrapper 完整参数集（start.ts wrapperArgv 注入，含 python3 -I 前缀）。 */
  p2sdkWrapperArgv = []
  /** @type {string|undefined} 远端 HOME（追加 --home/--mask）。 */
  p2sdkRemoteHome = undefined
  /** @type {string[]} 远端硬 NEVER 根（追加 --never）。 */
  p2sdkRemoteNever = []
  /** @type {string|undefined} 远端 helper 安装目录（追加 --policy；缺省不传——
   * helper 的 Hello.root socket 临时目录绝不当 --policy 传：bwrap-wrap.py:345-353
   * 会把 /tmp/dsh-ssh-* endpoint 露回沙箱）。 */
  p2sdkRemoteRuntimeDir = undefined

  constructor(ctx, config = {}) {
    super(ctx)
    if (Array.isArray(config.wrapperArgv)) this.p2sdkWrapperArgv = config.wrapperArgv.filter((x) => typeof x === 'string')
    if (typeof config.remoteHome === 'string' && config.remoteHome.length > 0) this.p2sdkRemoteHome = config.remoteHome
    if (Array.isArray(config.remoteNever)) this.p2sdkRemoteNever = config.remoteNever.filter((x) => typeof x === 'string' && x.length > 0)
    if (typeof config.remoteRuntimeDir === 'string' && config.remoteRuntimeDir.length > 0) this.p2sdkRemoteRuntimeDir = config.remoteRuntimeDir
  }

  async confine(argv, policy, signal) {
    const plan = await super.confine(argv, policy, signal)
    if (basename(plan.argv[0]) !== 'bwrap' || plan.enforcement !== 'full') {
      throw new SandboxUnavailableError(`p2sdk sandbox-zone-ssh: unexpected remote sandbox plan (argv0=${plan.argv[0]}, enforcement=${plan.enforcement}); refusing an unguarded run`)
    }
    const sep = plan.argv.indexOf('--')
    const tail = sep >= 0 ? plan.argv.slice(sep + 1) : []
    const extra = []
    if (this.p2sdkRemoteHome !== undefined) extra.push('--home', this.p2sdkRemoteHome, '--mask', this.p2sdkRemoteHome)
    for (const r of this.p2sdkRemoteNever) extra.push('--never', r)
    if (this.p2sdkRemoteRuntimeDir !== undefined) extra.push('--policy', this.p2sdkRemoteRuntimeDir)
    // wrapper 形态 = 「python3 -I wrap.py …参数… -- 命令」（bwrap-wrap.py:6-9）：
    // wrapperArgv 已含 [python3, -I, wrap, …宿主参数]，远端根插在 -- 前。
    return { ...plan, argv: [...this.p2sdkWrapperArgv, ...extra, '--', ...tail] }
  }
}

export default ZoneCheckedSshSandboxProvider
