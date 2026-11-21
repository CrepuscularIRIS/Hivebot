// P5-21：pre-execute 侧的会话目标解析（shell-ask 的 workspace 档共用）。
// 与 guard.mjs 内联的解析块同一暴露面（ctx.fs.resolve + workingDirectory.ensure
// + sandboxPolicy.resolve 的 workspaceRoot），但只做解析不判定——guard 逐候选
// 出 deny 原因，这里只要 canonical 目标集 + 工作区根。不搬进 guard 是为了不动
// 已验收的 guard 判定路径（ponytail：两处 ~15 行的取服务样板，换 guard 零回归）。
// extractPaths 复用 guard 的导出（含 ~ 展开、glob pattern 归一、present files）。
import { extractPaths } from './guard.mjs'

// P6-25.f1：pre-execute 判定结果的执行期交接。shell-ask 在算完 allInside 后按
// exec 对象记一条（noteZoneVerdict）；fs-zone 的 tools/execute 复判读同一条
// （zoneVerdictOf）。exec 对象从 pre-execute waterfall 到 tools/execute 是同一
// 引用（dsh-tools pipeline.js：prepare 创建一次，dispatch 复用），WeakMap 即可。
// allInside=false 的读档 = pre-execute 已按「区外读」出卡，批准后到达执行层——
// 复判放行（Q-013 语义保持）；allInside=true 而执行时在区外 = 判定与执行之间被
// 换链（B2），复判拒。
const zoneVerdicts = new WeakMap()

/**
 * 记录一次文件档位调用的 pre-execute 判定结果（shell-ask 侧调用）。
 * @param {object} exec 工具调用对象（tools/pre-execute 与 tools/execute 同引用）。
 * @param {{kind: 'workspace-read'|'workspace-write', allInside: boolean, targets?: string[]}} verdict canonical targets 为此次审批的精确路径，不授权其他区外目标。
 */
export function noteZoneVerdict(exec, verdict) {
  zoneVerdicts.set(exec, verdict)
}

/**
 * 读取该调用的 pre-execute 判定记录；无记录（非文件档位 / shell-ask 未挂载）返回
 * undefined，调用方按「不归执行层管」处理。
 */
export function zoneVerdictOf(exec) {
  return zoneVerdicts.get(exec)
}

/**
 * 解析一次工具调用的全部路径候选。
 * @param {object} ctx 宿主 ctx（fs / workingDirectory / sandboxPolicy）
 * @param {{name: string, arguments?: unknown, agent?: unknown, signal?: unknown}} exec
 * @param {{resolve(raw: string, opts?: object): Promise<{targetKey: string}>}} fs ctx.get('fs') 的服务实例
 * @returns {Promise<{targets: string[], total: number, workspaceRoot?: string}>}
 * targets 为 ctx.fs.resolve 后的 canonical targetKey（total 是候选总数——
 * targets.length < total 即有候选解析失败，调用方按 fail-closed 处理）；
 * workspaceRoot 是会话创建时 header.cwd 的投影（不可被 working_directory
 * 改动，与 wrapper 重 bind 的工作区同源）。
 */
export async function resolveTargets(ctx, exec, fs) {
  const opts = { signal: exec.signal }
  let cwd
  if (exec.agent !== undefined) {
    const wd = typeof ctx.get === 'function' ? ctx.get('workingDirectory') : null
    if (wd !== null && typeof wd === 'object' && typeof wd.ensure === 'function') {
      try {
        cwd = await wd.ensure(exec.agent, exec.signal)
        if (typeof cwd === 'string') opts.cwd = cwd
      } catch {
        /* ensure 失败 → 无 cwd，resolve 用 fs 缺省（runtime cwd） */
      }
    }
  }
  let workspaceRoot
  const policy = typeof ctx.get === 'function' ? ctx.get('sandboxPolicy') : null
  if (policy !== null && typeof policy === 'object' && typeof policy.resolve === 'function') {
    try {
      const standing = policy.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
      if (typeof standing?.workspaceRoot === 'string') workspaceRoot = standing.workspaceRoot
    } catch {
      /* 读不到 workspaceRoot → undefined，调用方按 fail-closed 处理 */
    }
  }
  const targets = []
  const candidates = extractPaths(exec.name, exec.arguments, cwd)
  for (const candidate of candidates) {
    try {
      const resolved = await fs.resolve(candidate.raw, opts)
      if (resolved !== null && typeof resolved === 'object' && typeof resolved.targetKey === 'string') targets.push(resolved.targetKey)
    } catch {
      /* 单候选解析失败 → targets 少于 total，调用方 fail-closed */
    }
  }
  return { targets, total: candidates.length, workspaceRoot }
}
