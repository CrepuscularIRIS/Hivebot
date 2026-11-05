// 来源: https://github.com/deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447:packages/fs/fs-sandbox/src/index.ts
// P6-25.f1：继承已安装的 dsh-fs-sandbox（第 2 级集成），不复制上游存储实现。
// 写操作在 fresh resolve 后加工作区/NEVER 校验；模型侧读操作在 tools/execute 复判。
// 共享 fs 的内部读取（技能等）不受模型审批语义影响；已批准的区外读保持 Q-013。
// start.ts 禁用 stock fs-sandbox 并插入本后端，NEVER 清单与 guard 同源。
// ponytail: 模型读侧已用 Linux fd 绑定对象；写侧与 rg 搜索仍按宿主路径操作，
// 残余窗口由 P6-27 的 bash 同一 bwrap 视图关闭，不重写上游 I/O。
import { AsyncLocalStorage } from 'node:async_hooks'
import { constants } from 'node:fs'
import { open, readlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { sep } from 'node:path'
import { isPathUnder } from './containment.mjs'
import { resolveTargets, zoneVerdictOf } from './resolve.mjs'

const requireFromDsh = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const { default: SandboxedFileSystem } = await import(requireFromDsh.resolve('@deepseek-ai/dsh-fs-sandbox'))
const { workspaceWritableRoots, canonicalPath } = await import(requireFromDsh.resolve('@deepseek-ai/dsh-sandbox'))
const { FsError } = await import(requireFromDsh.resolve('@deepseek-ai/dsh-fs'))

/** 执行层写拒：与 shell-ask 的 P6-25 writeOut 同一固定字面串（code 前缀，不回显宿主路径）。 */
const WRITE_OUT = 'p2sdk policy: write-outside-workspace denied (the target is outside this session workspace; the call does not run)'
/** 执行层读拒（判定时在区内、执行时在区外 = 绕过了出卡语义 → 拒，不静默放行）。 */
const READ_OUT = 'p2sdk policy: read-outside-workspace denied (execute-time zone re-check; the call does not run)'
/** 执行层 NEVER 拒（凭证/遮蔽根，读写都拒，与 guard 同一清单语义）。 */
const NEVER = 'p2sdk policy: never-root denied at execution time (credential or masked root; the call does not run)'

// 硬拒不可升权：沿用上游权限错误码，避免 tool-fs 将 sandbox 拒绝改写为升权提示。
const denyFs = (message) => new FsError(`code: ${message}`, 'FS_PERMISSION_DENIED')

const underAny = async (targetKey, roots) => {
  for (const root of roots) {
    if (await isPathUnder(targetKey, root)) return true
  }
  return false
}

/**
 * 执行期区域复判（读侧 + NEVER；写侧由 ZoneCheckedFileSystem.checkedTarget 承担）。
 * 挂在 tools/execute（around-dispatch，包着 tool.execute）。无 shell-ask 判定记录的
 * 调用（非文件档位 / shell-ask 未挂载）不归本层管，直接放行给下一环。
 * @param {object} ctx 宿主 ctx（fs / workingDirectory / sandboxPolicy）
 * @param {string[]} neverRoots guard 同源的硬 NEVER 根（canonical）。
 */
export function applyZoneRecheck(ctx, neverRoots) {
  ctx.on('tools/execute', async (exec, next) => {
    const record = zoneVerdictOf(exec)
    if (record === undefined) return next()
    const fs = typeof ctx.get === 'function' ? ctx.get('fs') : null
    if (fs === null || typeof fs !== 'object' || typeof fs.resolve !== 'function') return denied(NEVER)
    const { targets, total, workspaceRoot } = await resolveTargets(ctx, exec, fs)
    if (total === 0) return next()
    // 已批准区外读也必须完成路径解析，不能带未知目标跳过 NEVER 检查。
    if (targets.length !== total) return denied(NEVER)
    for (const target of targets) {
      if (await underAny(target, neverRoots)) return denied(NEVER)
    }
    const inside = workspaceRoot !== undefined
      && targets.length === total
      && (await Promise.all(targets.map((t) => isPathUnder(t, workspaceRoot)))).every(Boolean)
    if (!inside && !(record.kind === 'workspace-read' && record.allInside === false)) {
      return denied(record.kind === 'workspace-write' ? WRITE_OUT : READ_OUT)
    }
    // 每个后端实例独立持有作用域；内部读没有记录，不套用模型调用的审批语义。
    fs.p2sdkReadScope ??= new AsyncLocalStorage()
    // 根与写侧同用 canonicalPath，在 next/open 前固定。审批 targets 已由 shell-ask
    // 的 resolveTargets 规范化；不能再次解析，否则换链会把旧审批重授给新目标。
    return fs.p2sdkReadScope.run({
      record,
      workspaceRoot: typeof workspaceRoot === 'string' ? canonicalPath(workspaceRoot) : undefined,
      neverRoots: neverRoots.map(canonicalPath),
    }, next)
  })
}

/** tools/execute 的 authored 拒绝结果（pipeline.normalizeDispatchResult 认 isError 结果）。 */
function denied(reason) {
  return {
    isError: true,
    error: { message: reason },
    content: [{ type: 'text', text: `Error: ${reason}` }],
  }
}

/**
 * p2sdk 的 fs 后端：继承上游 SandboxedFileSystem，在其 fence 之上加执行期工作区
 * 判定。config 透传上游（cwd / diffBasisMaxBytes），另收 neverRoots（start.ts 运行
 * 时行注入；schemastery 对未知键透传，故不需重述上游 Config schema——上游 resolve
 * 后构造器原样收到）。
 */
export class ZoneCheckedFileSystem extends SandboxedFileSystem {
  /** @type {string[]} */
  p2sdkNeverRoots = []

  constructor(ctx, config = {}) {
    super(ctx, config)
    const roots = Array.isArray(config.neverRoots) ? config.neverRoots.filter((p) => typeof p === 'string' && p.length > 0) : []
    this.p2sdkNeverRoots = [...new Set(roots)]
    applyZoneRecheck(this.ctx, this.p2sdkNeverRoots)
  }

  /** Linux readlink 返回内核解析的绝对路径；不能再按可被换链的祖先 stat 判身份。 */
  async openReadTarget(target, signal, scope) {
    if (signal?.aborted) throw new FsError('read aborted', 'FS_ABORTED')
    const fresh = await this.resolve(target.targetKey, { signal })
    // NONBLOCK 避免模型把末级换成 FIFO 后卡死 open；上游仍负责常规文件类型检查。
    const handle = await open(fresh.targetKey, constants.O_RDONLY | constants.O_NONBLOCK)
    try {
      const key = `/proc/self/fd/${handle.fd}`
      const actual = await readlink(key)
      const under = (root) => typeof root === 'string' && (actual === root || actual.startsWith(root.endsWith(sep) ? root : root + sep))
      if (scope.neverRoots.some(under)) throw denyFs(NEVER)
      const approved = scope.record.kind === 'workspace-read' && scope.record.allInside === false
        && scope.record.targets?.includes(actual)
      if (actual.endsWith(' (deleted)') || (!under(scope.workspaceRoot) && !approved)) throw denyFs(READ_OUT)
      if (signal?.aborted) throw new FsError('read aborted', 'FS_ABORTED')
      return { handle, target: { ...target, targetKey: key } }
    } catch (error) {
      await handle.close()
      throw error
    }
  }

  /** fd 路径不进入模型错误；原 displayPath 保留，上游错误码保持。 */
  readError(error, target) {
    const code = typeof error?.code === 'string' && error.code.startsWith('FS_') ? error.code
      : ['ENOENT', 'ENOTDIR'].includes(error?.code) ? 'FS_NOT_FOUND' : 'FS_PERMISSION_DENIED'
    const message = typeof error?.message === 'string' && error.code?.startsWith('FS_')
      ? error.message.replace(/\/proc\/self\/fd\/\d+/g, () => target.displayPath)
      : `cannot read "${target.displayPath}": ${code === 'FS_NOT_FOUND' ? 'not found' : 'file access failed'}`
    return new FsError(message, code)
  }

  async withReadTarget(target, signal, read) {
    const scope = this.p2sdkReadScope?.getStore()
    if (!scope) return read(target)
    let bound
    try {
      bound = await this.openReadTarget(target, signal, scope)
      return await read(bound.target)
    } catch (error) {
      throw this.readError(error, target)
    } finally {
      await bound?.handle.close()
    }
  }

  async readText(target, signal) {
    return this.withReadTarget(target, signal, (bound) => super.readText(bound, signal))
  }

  async readBytes(target, signal, maxBytes) {
    return this.withReadTarget(target, signal, (bound) => super.readBytes(bound, signal, maxBytes))
  }

  async readByteRange(target, range, signal) {
    return this.withReadTarget(target, signal, (bound) => super.readByteRange(bound, range, signal))
  }

  async listDir(target, signal) {
    return this.withReadTarget(target, signal, (bound) => super.listDir(bound, signal))
  }

  // present 只调用 stat，不读内容；同样不能发布未经批准的区外目标。
  async stat(target, signal) {
    try {
      return await this.withReadTarget(target, signal, (bound) => super.stat(bound, signal))
    } catch (error) {
      if (error?.code === 'FS_NOT_FOUND') return undefined
      throw error
    }
  }

  async streamText(target, signal) {
    const scope = this.p2sdkReadScope?.getStore()
    if (!scope) return super.streamText(target, signal)
    const fs = this
    const read = (bound) => super.streamText(bound, signal)
    // 延迟到首次迭代才打开：未消费的 iterable 不持有 fd；scope 跨出 tools/execute 仍有效。
    return (async function* () {
      let bound
      let closeError
      const abort = () => { void bound.handle.close().catch((error) => { closeError = error }) }
      try {
        bound = await fs.openReadTarget(target, signal, scope)
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) throw new FsError('read aborted', 'FS_ABORTED')
        yield* await read(bound.target)
      } catch (error) {
        throw fs.readError(error, target)
      } finally {
        signal?.removeEventListener('abort', abort)
        await bound?.handle.close()
        if (closeError) throw fs.readError(closeError, target)
      }
    })()
  }

  /**
   * 上游 fence 之上再判一次（writeText/editText 的唯一收口；见类头 B1）。
   * read-only 由上游抛；workspace-write 走上游 fresh resolve + fence（fence 放行
   * 宿主 /tmp 的场景由本层收掉）；danger-full-access（用户逐调用批准的升权）上游
   * 不判，本层自行 fresh resolve 使「判定的身份 = 写入的身份」，并按会话工作区判
   * 定——P6-25 起 pre-execute 对区外写一律硬拒，不存在「合法落在区外的升权写」，
   * 区外 fresh 目标只能是换链（升权审批卡上的路径形似区内，批的是区内路径）。
   */
  async checkedTarget(target, sandboxPolicy) {
    const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()
    const fresh = policy.mode === 'danger-full-access'
      ? await this.resolve(target.displayPath)
      : await super.checkedTarget(target, sandboxPolicy)
    await this.zoneGuard(fresh, policy)
    return fresh
  }

  /** NEVER 根任意 mode 拒；可写档（workspace-write / danger-full-access）按会话工作区拒区外。 */
  async zoneGuard(fresh, policy) {
    if (await underAny(fresh.targetKey, this.p2sdkNeverRoots)) throw denyFs(NEVER)
    const roots = policy.mode === 'workspace-write'
      ? workspaceWritableRoots({ mode: policy.mode, workspaceRoot: policy.workspaceRoot })
      : typeof policy.workspaceRoot === 'string' ? [canonicalPath(policy.workspaceRoot)] : []
    if (roots.length === 0 || !(await underAny(fresh.targetKey, roots))) throw denyFs(WRITE_OUT)
  }
}

export default ZoneCheckedFileSystem
