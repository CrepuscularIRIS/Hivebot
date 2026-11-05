// P5-02（PLAN p5-parity 0b，决策 2/3/7/13）：文件工具凭证 NEVER（默认拒）。
// 挂 dsh tools/pre-execute 扩展点（来源: deepseek-harness@ce7073d
// packages/core/tools/src/contracts.ts:358-361）。pre-execute 是 waterfall，
// shell-ask 返回 ask 不调 next() 时后面的插件不执行，NEVER 必须排最前——
// P5-04.f1 实测 insert 行加载顺序不可靠，本插件用 ctx.on 的 prepend 选项
// （第三参 true）钉在最外层（顺序证明格在 P5-04 ⑤）。
//
// 判定（决策 13，全部根来自 never-roots.mjs 单源，经 runtime patch 的 guard 行
// 传入；guard 行缺失 → 本插件加载失败，fail loud）：
// ① 硬 NEVER（读写都拒，任何例外不越过）：凭证实体（含工具链内登记的凭证）、
//    整个 /proc、/run/user/<uid>、DSH_HOME、handoff、非 HOME 数据 mask 根的顶层
//    条目（除 workspaces/）。
// ② 硬写保护（写拒、读放行）：策略代码根（PKG_ROOT、REPO_ROOT/.claude、.git）。
// ③ 软遮蔽（读写都拒）：每个 HOME 整棵 + 非 HOME 数据 mask 根整棵。例外只有
//    两种：会话创建时 header.cwd（sandboxPolicy.resolve 的 workspaceRoot，不可
//    被 working_directory 改动）子树；工具链白名单（只读）。例外不越过 ①②。
// 决策 7：目录类读入口的目标在任一 NEVER / 软遮蔽根之下 **或** 是其祖先 → 拒
// （grep path=$HOME、grep path=/ 因此被拒）。
//
// 路径规范化复用第 1 级运行时服务 ctx.fs.resolve(path, {cwd})（与上游 read /
// checkedTarget 同一入口，含 ~ 展开与符号链接 realpath），包含判定复制
// containment.mjs 的 isPathUnder。本插件内没有任何 approvalPolicy 分支。
export const name = 'p2sdk-fs-guard'

import { readdirSync } from 'node:fs'
import { isAbsolute, resolve as resolvePath } from 'node:path'
import { isPathUnder } from './containment.mjs'

/** guard 行 config.roots 的必需数组字段（全部 canonical 绝对路径）。 */
const REQUIRED_ROOT_KEYS = ['hardRoots', 'dataMaskRoots', 'homes', 'toolchainDirs', 'policyRoots']

/**
 * P5-03（0c，G1-r2 #2）：工具名硬 NEVER —— 第二道防线。approval.yml 按 id
 * 整 config 覆盖把 preset 行里的 tool-plugin-manager 禁用后，后层 --patch 仍
 * 可按 id 重新启用该行；重新启用也不放行：plugin_manager 能改 profile /
 * 装 bundle（宿主侧代码），在 pre-execute waterfall 最前直接 deny，不出卡。
 */
const NEVER_TOOLS = new Set(['plugin_manager'])

/**
 * P5-04（0d，G#5 前半，PLAN 决策 10）：拒绝裸升权。受控升权路径落地前，
 * 任何工具带 `sandbox_permissions === 'danger-full-access'` 的调用批准后都是
 * 无沙箱执行：bash 侧 mode===dfa 直接 super.execute 不进 wrapper（来源:
 * deepseek-harness@ce7073d packages/shell/bash-sandbox/src/index.ts:92-100），
 * dfa 是 WIDER_MODES 一切模式的升权终点（packages/sandbox/sandbox/src/
 * escalation.ts:30-31）；write/edit 同参数名（packages/fs/tool-fs/src/
 * sandbox.ts:22,90），该模式下不受 fs-sandbox 约束。受控路径出题在 §5 D-1 /
 * P5-22，落地前在这里 fail closed。原因字面串 v2.1 定死（P5-05 ② / P5-06 按
 * 此断言）。
 */
const DFA = 'danger-full-access'
const DFA_DENY = `p2sdk-fs-guard: escalation path not available (sandbox_permissions "${DFA}" is denied until the controlled escalation path lands; the call does not run)`

/**
 * P5-04.f1（PLAN P5-04 行 ④，决策 10 补）：会话级拒绝。部署侧
 * DSH_PERMISSION_MODE=danger-full-access（childEnv 透传 DSH_*）把整条链切到
 * dfa：sandbox-policy mode、approval policy=never、permission-presets 的 dfa
 * preset。bash 侧 shell-ask 已因 never 拒（P5-05），但 write / edit 不经
 * shell-ask，且该模式下 fs 工具不受 fs-sandbox 约束（来源:
 * deepseek-harness@ce7073d packages/fs/tool-fs/src/sandbox.ts:22,90）——按
 * 会话有效模式（ctx.get('sandboxPolicy').resolve，与 shell-ask 读
 * effectiveMode 同一暴露面）deny bash / write / edit，原因 v2.1 定死
 * （P5-05 ② 枚举集成员）。排在路径判定之前：dfa 会话里 write 的原因必须是
 * 本字面串而非 masked-area（P5-04 ② 的区分）。读不到服务 / resolve 抛错 →
 * 不 deny（证不出 dfa 就不拦；基础层恒组合 sandbox-policy，残缺组合才会
 * 走到这里，bash 仍有 shell-ask 兜底）。guard 内依旧没有 approvalPolicy
 * 分支——判的是沙箱模式，不是审批策略。
 */
const DFA_SESSION_TOOLS = new Set(['bash', 'write', 'edit'])
const DFA_SESSION_DENY = `p2sdk-fs-guard: danger-full-access session mode is not supported (deployments must not run sessions in "${DFA}"; bash / write / edit are denied and the call does not run)`

/** 本次调用所属会话的有效沙箱模式（sandboxPolicy.resolve 同一暴露面）；读不到 → undefined。 */
function sessionMode(ctx, exec) {
  const policy = typeof ctx.get === 'function' ? ctx.get('sandboxPolicy') : null
  if (policy === null || typeof policy !== 'object' || typeof policy.resolve !== 'function') return undefined
  try {
    const standing = policy.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
    return standing !== null && typeof standing === 'object' && typeof standing.mode === 'string' ? standing.mode : undefined
  } catch {
    return undefined
  }
}

/** resolveRoots 的产物：决策 13 判定序直接消费的三张表。 */
/** @returns {{hardRoots: string[], softRoots: string[], toolchainDirs: string[], policyRoots: string[]}} */

/**
 * 入口表 → 提取的原始路径候选。kind: 'read' | 'write'。glob 的 pattern 相对
 * 搜索根（path 参数，缺省 '.'）归一 —— 与上游 glob 工具同一相对基。
 */
export function extractPaths(toolName, args, cwd = process.cwd()) {
  if (args === null || typeof args !== 'object') return []
  if (toolName === 'read' || toolName === 'read_image') {
    return typeof args.file_path === 'string' && args.file_path.length > 0 ? [{ raw: args.file_path, kind: 'read' }] : []
  }
  if (toolName === 'write' || toolName === 'edit') {
    return typeof args.file_path === 'string' && args.file_path.length > 0 ? [{ raw: args.file_path, kind: 'write' }] : []
  }
  if (toolName === 'grep' || toolName === 'glob') {
    const base = typeof args.path === 'string' && args.path.trim().length > 0 ? args.path : '.'
    const out = [{ raw: base, kind: 'read' }]
    if (toolName === 'glob' && typeof args.pattern === 'string') {
      const cand = globPatternCandidate(args.pattern, base, cwd)
      if (cand !== null) out.push({ raw: cand, kind: 'read' })
    }
    return out
  }
  if (toolName === 'present' && Array.isArray(args.files)) {
    return args.files
      .filter((f) => f !== null && typeof f === 'object' && typeof f.path === 'string' && f.path.length > 0)
      .map((f) => ({ raw: f.path, kind: 'read' }))
  }
  return []
}

/**
 * glob pattern 的静态目录前缀候选：pattern 带 `..` 段或绝对前缀指向搜索根外
 * 时，归一出一个候选绝对路径（到第一个通配段为止）；纯相对 pattern 无候选
 * （覆盖由搜索根判定承担）。只做字面归一，不碰文件系统。
 * @returns {string | null}
 */
export function globPatternCandidate(pattern, base, cwd = process.cwd()) {
  const segs = pattern.split('/')
  const hasGlobSeg = (i) => /[*?[\]]/.test(segs[i] ?? '')
  if (!segs.slice(0, -1).some((s) => s === '..') && segs[0] !== '') return null
  let dir = segs[0] === '' ? '/' : resolvePath(cwd, base)
  let i = segs[0] === '' ? 1 : 0
  for (; i < segs.length - 1; i++) {
    const seg = segs[i]
    if (hasGlobSeg(i)) break
    if (seg === '' || seg === '.') continue
    if (seg === '..') dir = resolvePath(dir, '..')
    else dir = resolvePath(dir, seg)
  }
  return dir === '/' ? '/' : dir
}

/**
 * 决策 13 ①–③ 的单目标判定（纯函数，无 IO）。
 * @param {string} target ctx.fs.resolve 后的 canonical targetKey。
 * @param {{hardRoots: string[], softRoots: string[], toolchainDirs: string[], policyRoots: string[]}} resolved
 * @param {{isWrite?: boolean, workspaceRoot?: string}} opts
 * @returns {Promise<'ok' | {deny: 'never'|'mask'|'read-only', reason: string}>}
 */
export async function judgePath(target, resolved, opts = {}) {
  const isWrite = opts.isWrite === true
  // 决策 7：目标在根之下 **或** 是根的祖先（grep path=/ 、path=$HOME）都算命中。
  const covers = async (root) => (await isPathUnder(target, root)) || (await isPathUnder(root, target))
  const under = (root) => isPathUnder(target, root)

  for (const root of resolved.hardRoots) {
    if (await covers(root)) {
      return { deny: 'never', reason: `path "${target}" touches a hard-denied area (${root})` }
    }
  }
  if (isWrite) {
    for (const root of resolved.policyRoots) {
      if (await under(root)) {
        return { deny: 'read-only', reason: `path "${target}" is in the read-only policy area (${root})` }
      }
    }
  }
  for (const root of resolved.softRoots) {
    if (await covers(root)) {
      if (opts.workspaceRoot !== undefined && (await under(opts.workspaceRoot))) return 'ok'
      if (!isWrite) {
        for (const tool of resolved.toolchainDirs) {
          if (await under(tool)) return 'ok'
        }
      }
      return { deny: 'mask', reason: `path "${target}" is in a masked area (${root})` }
    }
  }
  return 'ok'
}

/**
 * 展开非 HOME 数据 mask 根的顶层直接子条目（决策 13 ①「每个 mask 根下除
 * workspaces/ 之外的全部条目」；名为 workspaces 的目录跳过，给 ③ 的
 * workspaceRoot 例外留出空间）。不存在的根跳过；启动后新建的顶层文件由
 * ③ 的整棵软遮蔽兜底（每次调用重判）。
 */
export function expandTopEntries(dataMaskRoots) {
  const out = []
  for (const root of dataMaskRoots) {
    let names
    try {
      names = readdirSync(root)
    } catch {
      continue
    }
    for (const name of names) {
      if (name === 'workspaces') continue
      out.push(resolvePath(root, name))
    }
  }
  return out
}

/** config.roots → 判定表（顶层条目在这里展开一次，apply 缓存）。 */
export function resolveRoots(roots) {
  const top = expandTopEntries(roots.dataMaskRoots)
  return {
    hardRoots: [...new Set([...roots.hardRoots, ...top])],
    softRoots: [...new Set([...roots.homes, ...roots.dataMaskRoots])],
    toolchainDirs: [...roots.toolchainDirs],
    policyRoots: [...roots.policyRoots],
  }
}

/** 决策 6：guard 行（runtime patch 写入的 config.roots）缺失或不合法 → 加载失败。 */
function requireRoots(config) {
  const roots = config !== null && typeof config === 'object' ? config.roots : null
  if (roots === null || typeof roots !== 'object') {
    throw new Error('p2sdk-fs-guard: config.roots is required — the launcher writes the guard row (roots from never-roots.mjs) into the runtime patch; a missing guard row is a misconfiguration')
  }
  for (const key of REQUIRED_ROOT_KEYS) {
    if (!Array.isArray(roots[key])) {
      throw new Error(`p2sdk-fs-guard: config.roots.${key} must be an array of canonical absolute paths`)
    }
  }
  for (const key of REQUIRED_ROOT_KEYS) {
    for (const p of roots[key]) {
      if (typeof p !== 'string' || !isAbsolute(p)) {
        throw new Error(`p2sdk-fs-guard: config.roots.${key} entries must be absolute paths (got ${JSON.stringify(p)})`)
      }
    }
  }
  return roots
}

/** 宿主平面注册一次，作用于全部 session（与 p2sdk-shell-ask 同一形态）。 */
export function apply(ctx, config) {
  const roots = requireRoots(config)
  const resolved = resolveRoots(roots)

  // P5-04.f1 ⑤ 实测：insert 行的加载顺序不可靠（探针证据：guard 列首位时仍
  // 收不到 bash exec，shell-ask 先注册先拦截）。用 cordis ctx.on 的 prepend
  // 选项（events.ts register：prepend → unshift 到 listeners 数组最前）把
  // guard 钉在最外层——deny 先于任何出卡，顺序证明在 P5-04 ⑤ 的 e2e。
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (NEVER_TOOLS.has(exec.name)) {
      return { kind: 'deny', reason: `p2sdk-fs-guard: tool "${exec.name}" is not available (plugin management is disabled by policy; overrides cannot re-enable it)` }
    }
    // P5-04：裸升权一律拒（NEVER_TOOLS 之后、路径判定之前；对任何工具，含
    // 不在 known 表里的 bash）。不带该参数的调用行为不变（④ 一致性格）。
    const escalationArgs = exec.arguments
    if (escalationArgs !== null && typeof escalationArgs === 'object' && escalationArgs.sandbox_permissions === DFA) {
      return { kind: 'deny', reason: DFA_DENY }
    }
    // P5-04.f1 ④⑤：会话有效模式 = dfa → bash / write / edit 一律拒（先于路径
    // 判定）。⑤ 的顺序证明靠它：guard 排 shell-ask 前，组合会话的普通 bash
    // 在 shell-ask 出卡前被这里拦下。
    if (DFA_SESSION_TOOLS.has(exec.name) && sessionMode(ctx, exec) === DFA) {
      return { kind: 'deny', reason: DFA_SESSION_DENY }
    }
    const known = new Set(['read', 'read_image', 'write', 'edit', 'grep', 'glob', 'present'])
    if (!known.has(exec.name)) return next()

    // 会话解析参数与 read-target.ts sessionResolveOptions 同款：cwd 取当前会话
    // 工作目录（可被 working_directory 改动）；例外用的是不可变的 header.cwd
    // 投影（sandboxPolicy.resolve 的 workspaceRoot，与 wrapper 重 bind 的工作区
    // 同源），cd 不扩大例外（P5-02 ④）。
    const fs = typeof ctx.get === 'function' ? ctx.get('fs') : null
    if (fs === null || typeof fs !== 'object' || typeof fs.resolve !== 'function') {
      // 决策 3：拿不到运行时服务就不自写规范化 —— fail closed，deny 并留原因。
      return { kind: 'deny', reason: 'p2sdk-fs-guard: filesystem resolution service unavailable' }
    }
    const opts = { signal: exec.signal }
    let cwd
    if (exec.agent !== undefined) {
      const wd = typeof ctx.get === 'function' ? ctx.get('workingDirectory') : null
      if (wd !== null && typeof wd === 'object' && typeof wd.ensure === 'function') {
        try {
          cwd = await wd.ensure(exec.agent, exec.signal)
          if (typeof cwd === 'string') opts.cwd = cwd
        } catch {
          /* ensure 失败 → 无 cwd，resolve 用 fs 缺省（runtime cwd），fail closed 方向 */
        }
      }
    }
    const candidates = extractPaths(exec.name, exec.arguments, cwd)
    if (candidates.length === 0) return next()
    let workspaceRoot
    const policy = typeof ctx.get === 'function' ? ctx.get('sandboxPolicy') : null
    if (policy !== null && typeof policy === 'object' && typeof policy.resolve === 'function') {
      try {
        const standing = policy.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
        if (typeof standing?.workspaceRoot === 'string') workspaceRoot = standing.workspaceRoot
      } catch {
        /* 读不到 workspaceRoot → 无例外，全部软遮蔽按拒处理 */
      }
    }

    for (const candidate of candidates) {
      // ponytail: TOCTOU —— resolve 与工具实际打开之间目标可被换成符号链接
      // （写路径由上游 checkedTarget 的重解析收口；读路径的窗口接受，bash 侧
      // 还有 wrapper 遮蔽兜底）。上限：需要更严时挂 inotify 重验或 LSM。
      let target
      try {
        target = await fs.resolve(candidate.raw, opts)
      } catch {
        return { kind: 'deny', reason: `p2sdk-fs-guard: cannot resolve "${candidate.raw}"` }
      }
      const verdict = await judgePath(target.targetKey, resolved, { isWrite: candidate.kind === 'write', workspaceRoot })
      if (verdict !== 'ok') {
        return { kind: 'deny', reason: `p2sdk-fs-guard: ${verdict.reason}` }
      }
    }
    return next()
  }, true)
}
