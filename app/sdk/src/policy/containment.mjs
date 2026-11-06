// 来源: https://github.com/deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447:packages/fs/fs-sandbox/src/containment.ts
// 仅复制 isPathUnder（REUSE.md「路径包含判定」行，第 3 级复制改造）：已装包
// @deepseek-ai/dsh-fs-sandbox 的入口不导出它（lib/index.js:169）。MIT，私用不分发。
// 上游要求输入已 canonical：guard 侧的目标一律先经 ctx.fs.resolve（决策 3）。
// 改动：TypeScript → 本仓 .mjs 风格（去类型、注释中文化），逻辑保持原样。
import { stat } from 'node:fs/promises'
import { dirname, sep } from 'node:path'

const MISSING_CODES = new Set(['ENOENT', 'ENOTDIR'])

const isMissing = (error) => MISSING_CODES.has(error?.code)

const comparablePath = (path, caseSensitive) => (caseSensitive ? path : path.toLowerCase())

const isLexicallyUnder = (path, root, caseSensitive) => {
  const comparableTarget = comparablePath(path, caseSensitive)
  const comparableRoot = comparablePath(root, caseSensitive)
  if (comparableTarget === comparableRoot) return true
  const prefix = comparableRoot.endsWith(sep) ? comparableRoot : comparableRoot + sep
  return comparableTarget.startsWith(prefix)
}

const statIfPresent = async (path) => {
  try {
    return await stat(path, { bigint: true })
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
}

const sameIdentity = (left, right) => left.dev === right.dev && left.ino === right.ino

/**
 * canonical 目标是否等于 root 或在其之下（决策 13 判定用）。
 * lexical 快路径处理常规拼写；不一致时沿现存祖先比对文件系统身份
 * （别名 / 大小写等价根），不放宽到文本近似。
 * @param {string} path canonical 目标键（可带缺失后缀）。
 * @param {string} root canonical 根。
 * @param {boolean} [caseSensitive=true] 词法比较是否保留大小写。
 * @returns {Promise<boolean>} 目标是 root 或其后代。
 */
export async function isPathUnder(path, root, caseSensitive = process.platform !== 'win32') {
  if (isLexicallyUnder(path, root, caseSensitive)) return true

  // T9b（D2 词法化）：ssh 模式下宿主 stat 对远端路径无意义（stat 到的是宿主同名
  // 路径，身份比对反而是错的）——调用时读 P2SDK_SSH_MODE（launcher 的
  // childEnv 在 ssh 模式设它；本机模式未设行为逐字不变）。
  if (process.env.P2SDK_SSH_MODE === '1') return false

  const rootInfo = await statIfPresent(root)
  if (!rootInfo) return false

  let ancestor = path
  while (true) {
    const ancestorInfo = await statIfPresent(ancestor)
    if (ancestorInfo && sameIdentity(ancestorInfo, rootInfo)) return true
    const parent = dirname(ancestor)
    if (parent === ancestor) return false
    ancestor = parent
  }
}
