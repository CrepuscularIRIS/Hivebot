// T9b（DESIGN-ssh-composition D1 r3）：ssh 模式的执行层写收口。
// 继承已装 dsh-fs-ssh 的 SshFileSystem（第 2 级集成，与本机 ZoneCheckedFileSystem
// 同一写法）。SshFileSystem 没有上游统一收口 checkedTarget（五个写方法各自把
// target 直接发给远端 helper resolve 并写入），所以子类逐入口做
// 「先 this.resolve()（一次 RPC）→ zoneGuard → super.*（远端再 resolve 一次）」。
// ponytail: 两次 RPC 之间有换链窗口——与本机 fs-zone.mjs 已接受的写侧窗口同类
//（fs-zone.mjs:6-7）；上游给 SshFileSystem 加 checkedTarget 时改为覆盖它一处。
// 不用本机 workspaceWritableRoots：它经宿主 canonicalPath 规范化根，远端拼写
// 不能在宿主 realpath——这里取 resolve 过的会话 ws 根做词法比较，语义保持
//「不含 /tmp」（远端 helper 围栏 writableRoots 含 /tmp，正是本类要收掉的洞，
// ssh-fs-zone.test.ts ①b 先红段证明）。
// NEVER 判定用 isPathUnder（containment.mjs）——ssh 模式（P2SDK_SSH_MODE=1）
// 下它切纯词法，不落宿主 stat。
import { createRequire } from 'node:module'
import { isPathUnder } from './containment.mjs'
import { applyZoneRecheck } from './fs-zone.mjs'

const requireFromDsh = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const { default: SshFileSystem } = await import(requireFromDsh.resolve('@deepseek-ai/dsh-fs-ssh'))
const { FsError } = await import(requireFromDsh.resolve('@deepseek-ai/dsh-fs'))

const WRITE_OUT = 'p2sdk policy: write-outside-workspace denied (the target is outside this session workspace; the call does not run)'
const NEVER = 'p2sdk policy: never-root denied at execution time (credential or masked root; the call does not run)'
const denyFs = (message) => new FsError(`code: ${message}`, 'FS_PERMISSION_DENIED')

const underAny = async (targetKey, roots) => {
  for (const root of roots) {
    if (await isPathUnder(targetKey, root)) return true
  }
  return false
}

/**
 * ssh 版 zoneGuard：NEVER 根任意 mode 拒；可写档（workspace-write /
 * danger-full-access）目标须在会话 ws 或显式追加根下。ws 根在构造时经
 * this.resolve 规范化一次（远端口径），判定纯词法。
 */
async function zoneGuardSsh(fresh, { neverRoots, writableRoots }) {
  if (await underAny(fresh.targetKey, neverRoots)) throw denyFs(NEVER)
  if (writableRoots.length === 0 || !(await underAny(fresh.targetKey, writableRoots))) throw denyFs(WRITE_OUT)
}

export class ZoneCheckedSshFileSystem extends SshFileSystem {
  /** @type {string[]} */
  p2sdkNeverRoots = []
  /** @type {Map<string, string>} 原串 ws 根 → resolve 过的 targetKey。
   * ponytail: Map 缓存按原串键——T11 一 bot 一远端 ws 时各会话各键互不污染；
   * 上游 resolve 结果对同一拼写稳定（helper 远端 realpath）。 */
  p2sdkRootCache = new Map()

  // FileSystem 基类构造器是 super(ctx, 'fs')——只收 ctx；cordis loader 的 config
  // 作第二参进本构造器，neverRoots/additionalWritableRoots 从这里读，不传 super。
  constructor(ctx, config = {}) {
    super(ctx)
    const roots = Array.isArray(config.neverRoots) ? config.neverRoots.filter((p) => typeof p === 'string' && p.length > 0) : []
    this.p2sdkNeverRoots = [...new Set(roots)]
    // T9b2（DESIGN D1 第三点）：读侧执行期复判与本机孪生同款——审批卡等待
    // 期间换链由 NEVER 复判兜底（fs-zone.mjs:45-73，只用 ctx.get('fs').resolve，
    // fs-ssh 下自动远端规范化）。
    applyZoneRecheck(this.ctx, this.p2sdkNeverRoots)
  }

  /** 每调用按 policy.workspaceRoot 解析可写根（与本机孪生 checkedTarget 同写法：
   * per-call sandboxPolicy 优先，缺省全局 resolve；T11 一 bot 一 ws 的前提）。
   * Map 按原串缓存 resolve 结果。 */
  async p2sdkWritableRootsOf(policy, signal) {
    const raw = policy.workspaceRoot
    if (typeof raw !== 'string' || raw.length === 0) return []
    let key = this.p2sdkRootCache.get(raw)
    if (key === undefined) {
      try {
        key = (await this.resolve(raw, { signal })).targetKey
        this.p2sdkRootCache.set(raw, key)
      } catch {
        return [] // 解析失败 → 空根表 → 一律 WRITE_OUT（fail closed）
      }
    }
    return [key]
  }

  /** per-call policy 归一（本机孪生 fs-zone.mjs checkedTarget 同款）。 */
  p2sdkPolicy(sandboxPolicy) {
    return sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()
  }

  async writeText(target, content, expected, signal, sandboxPolicy) {
    const fresh = await this.resolve(target.displayPath, { signal })
    const policy = this.p2sdkPolicy(sandboxPolicy)
    await zoneGuardSsh(fresh, { neverRoots: this.p2sdkNeverRoots, writableRoots: await this.p2sdkWritableRootsOf(policy, signal) })
    return super.writeText(target, content, expected, signal, sandboxPolicy)
  }

  async editText(target, edit, expected, signal, sandboxPolicy) {
    const fresh = await this.resolve(target.displayPath, { signal })
    const policy = this.p2sdkPolicy(sandboxPolicy)
    await zoneGuardSsh(fresh, { neverRoots: this.p2sdkNeverRoots, writableRoots: await this.p2sdkWritableRootsOf(policy, signal) })
    return super.editText(target, edit, expected, signal, sandboxPolicy)
  }

  async patchText(target, hunks, expected, signal, sandboxPolicy) {
    const fresh = await this.resolve(target.displayPath, { signal })
    const policy = this.p2sdkPolicy(sandboxPolicy)
    await zoneGuardSsh(fresh, { neverRoots: this.p2sdkNeverRoots, writableRoots: await this.p2sdkWritableRootsOf(policy, signal) })
    return super.patchText(target, hunks, expected, signal, sandboxPolicy)
  }

  async deleteFile(target, expected, signal, sandboxPolicy) {
    const fresh = await this.resolve(target.displayPath, { signal })
    const policy = this.p2sdkPolicy(sandboxPolicy)
    await zoneGuardSsh(fresh, { neverRoots: this.p2sdkNeverRoots, writableRoots: await this.p2sdkWritableRootsOf(policy, signal) })
    return super.deleteFile(target, expected, signal, sandboxPolicy)
  }

  async moveFile(source, destination, options, signal, sandboxPolicy) {
    const fs_ = await this.resolve(source.displayPath, { signal })
    const fd_ = await this.resolve(destination.displayPath, { signal })
    const policy = this.p2sdkPolicy(sandboxPolicy)
    const guard = { neverRoots: this.p2sdkNeverRoots, writableRoots: await this.p2sdkWritableRootsOf(policy, signal) }
    await zoneGuardSsh(fs_, guard)
    await zoneGuardSsh(fd_, guard)
    return super.moveFile(source, destination, options, signal, sandboxPolicy)
  }
}

export default ZoneCheckedSshFileSystem
