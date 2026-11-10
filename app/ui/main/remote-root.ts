/**
 * 远端工作区判定（T11/T46d/T11c 单处定义）：handoff 有 ssh-mode 才读 remote-root
 * （T46d 起 Ubuntu 本机 serve 的 handoff 只有 remote-root 无 ssh-mode——本机桌面仍走本机分支）。
 * T46b 将在此加内存来源（Windows 侧不经 handoff 文件）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** T46b：Windows 远程模式直灌内存值（优先于 handoff 文件判定）。 */
let memRoot: string | undefined
export function setRemoteRoot(root: string | undefined): void { memRoot = root }

export function remoteRoot(): string | undefined {
  if (memRoot !== undefined) return memRoot
  const handoff = process.env.PBOTS_DSH_HANDOFF
  if (!handoff) return undefined
  try {
    if (!existsSync(join(handoff, 'ssh-mode'))) return undefined
    return readFileSync(join(handoff, 'remote-root'), 'utf8').trim() || undefined
  } catch {
    return undefined // 读失败按本机处理（fail 到原路径的 mkdir 会给出可见错误）
  }
}
