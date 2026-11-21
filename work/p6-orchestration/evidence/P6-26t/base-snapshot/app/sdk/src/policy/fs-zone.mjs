// 来源: https://github.com/deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447:packages/fs/fs-sandbox/src/index.ts
// P6-25.f1：继承已安装的 dsh-fs-sandbox（第 2 级集成），不复制上游存储实现。
// 写操作在 fresh resolve 后加工作区/NEVER 校验；模型侧读操作在 tools/execute 复判。
// 共享 fs 的内部读取（技能等）不受模型审批语义影响；已批准的区外读保持 Q-013。
// start.ts 禁用 stock fs-sandbox 并插入本后端，NEVER 清单与 guard 同源。
// ponytail: 残余窗口是执行时解析路径 → 实际系统调用之间；读侧工具层会再解析一次，
// 两次解析不比对，身份未绑定；写侧锁队列可拉长窗口。赢得竞态可读写本用户可达的
// 任意宿主路径（含 NEVER 根），ptc run_code 可作无卡并发行动方。升级路径：文件 I/O
// 改到与 bash 相同的 bwrap 命名空间内执行；另立跟进任务，本次不扩范围。
import { createRequire } from 'node:module'
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
    if (inside) return next()
    if (record.kind === 'workspace-read' && record.allInside === false) return next() // 区外读已出卡并获批准（Q-013 语义保持）
    return denied(record.kind === 'workspace-write' ? WRITE_OUT : READ_OUT)
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
