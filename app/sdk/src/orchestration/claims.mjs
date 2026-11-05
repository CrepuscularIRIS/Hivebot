// P6-24 写入责任按文件划分（PLAN p6-orchestration P6-24；panels/D3-r1.md 必须回应
// ③；Q-024 A「按任务自适应」）：create_bot 可声明产物路径（artifacts，相对 worker
// cwd）与可选 subdir；SDK 在进程内记「在跑 worker → 声明产物集」，同主 bot 下新
// create 的声明与在跑声明交叉 → 拒 pbots/busy（划分不了就换 subdir 或等它跑完）。
// 描述符 = <subdir|·>/<相对路径>（posix 归一）：所有 worker 共用同一共享根（主 bot
// cwd，决策 36），相对比较即精确；键含 mainId，换主后旧主 worker 的声明不拦新主。
// 声明级而非强制级（ponytail:）：未声明 artifacts 的 worker 不受限——结果带 advisory
// 提醒分区；两个都不声明的 worker 仍可能互踩，与原版一致，残余记入用户告知
// （panels/D3-r1.md 第 3 条的「划分不了」档）。释放 = 该 worker 任一 turn/end
// （create.mjs 的 session/event 监听，与容量占位同粒度：并发写窗口就是并发回合）。
/** Per-file write-responsibility claims for concurrent workers (P6-24, D-3-3). */

import { posix } from 'node:path'

/** subdir 上限：与 main 侧 orchestrate.ts subdirProblem 同口径。 */
const SUBDIR_MAX = 128
/** artifacts 数量上限（防清单轰炸；正常任务产物远少于此）。 */
const ARTIFACTS_MAX = 32

/**
 * create_bot 的可选 subdir 校验：单段路径（无分隔符、非 "."/".."、trim 后非空）。
 * @param {unknown} subdir
 * @returns {string | null} 问题串；null = 合法（或缺省）。
 */
export function subdirProblem(subdir) {
  if (subdir === undefined) return null
  if (typeof subdir !== 'string') return 'subdir must be a string (a single path segment under the main bot workspace)'
  const value = subdir.trim()
  if (value === '' || value === '.' || value === '..') return 'subdir must be a non-empty single path segment (not "." or "..")'
  if (value.length > SUBDIR_MAX) return `subdir is too long (max ${SUBDIR_MAX} characters)`
  if (/[\\/]/.test(value)) return 'subdir must be a single path segment (no path separators)'
  if (/[\0\u0001-\u001f]/.test(value)) return 'subdir must not contain control characters'
  return null
}

/**
 * create_bot 的可选 artifacts 校验：字符串数组，每项是相对 worker cwd 的相对路径
 * （trim 后非空、非绝对、无 ".." 段）。
 * @param {unknown} artifacts
 * @returns {string | null} 问题串；null = 合法（或缺省）。
 */
export function artifactsProblem(artifacts) {
  if (artifacts === undefined) return null
  if (!Array.isArray(artifacts)) return 'artifacts must be an array of relative paths this worker will write'
  if (artifacts.length > ARTIFACTS_MAX) return `artifacts lists too many paths (max ${ARTIFACTS_MAX})`
  for (const raw of artifacts) {
    if (typeof raw !== 'string') return 'artifacts entries must be strings (relative paths)'
    const value = raw.trim()
    if (value === '') return 'artifacts entries must be non-empty relative paths'
    if (value.startsWith('/') || value.startsWith('\\') || value.startsWith('~')) return 'artifacts entries must be relative (no absolute or home paths)'
    if (value.split(/[\\/]/).includes('..')) return 'artifacts entries must not traverse upward ("..")'
    if (/[\0\u0001-\u001f]/.test(value)) return 'artifacts entries must not contain control characters'
    if (value.length > 512) return 'artifacts entries are too long (max 512 characters)'
  }
  return null
}

/**
 * 声明描述符（posix 归一）：subdir 归一进每个产物路径，同名同 subdir 才相同。
 * @param {unknown} subdir 已过校验的 subdir（可缺省）。
 * @param {unknown} artifacts 已过校验的 artifacts（可缺省 / 空数组）。
 * @returns {string[]}
 */
export function claimDescriptors(subdir, artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) return []
  const base = typeof subdir === 'string' && subdir.trim() !== '' ? subdir.trim() : '.'
  return artifacts.map((raw) => posix.normalize(posix.join(base, String(raw).trim().split('\\').join('/'))))
}

/**
 * @param {Map<string, { mainId: string, paths: Set<string> }>} claims
 * @param {string} mainId @param {string} sessionId @param {string[]} descriptors
 */
export function registerClaims(claims, mainId, sessionId, descriptors) {
  if (descriptors.length === 0) return
  const prev = claims.get(sessionId)
  const paths = new Set([...(prev?.paths ?? []), ...descriptors])
  claims.set(sessionId, { mainId, paths })
}

/**
 * 新声明的描述符是否与同主 bot 在跑 worker 的声明交叉。
 * @param {Map<string, { mainId: string, paths: Set<string> }>} claims
 * @param {string} mainId @param {string[]} descriptors
 * @returns {{ descriptor: string, holder: string } | null}
 */
export function claimsConflict(claims, mainId, descriptors) {
  if (descriptors.length === 0) return null
  for (const [sessionId, { mainId: owner, paths }] of claims) {
    if (owner !== mainId) continue
    for (const descriptor of descriptors) {
      if (paths.has(descriptor)) return { descriptor, holder: sessionId }
    }
  }
  return null
}

/** 该 worker 的任一 turn/end 调用；幂等。 @param {Map<unknown, unknown>} claims */
export function dropClaims(claims, sessionId) {
  claims.delete(sessionId)
}
