// P6-10 主 bot 身份（PLAN §7「主 bot 身份 = M3 bots.json，读文件」；决策 4）。
// 权威 mainBotId 只在 main 写的 bots.json（CONTRACT M3）；SDK 侧按
// when 每 step + execute 每次读（S2 §3.4），身份未知 fail closed。
//
// 数据根解析：P2SDK_ORCH_DATA_DIR（P2SDK_ 前缀能穿过 start.ts childEnv 的
// allowlist）→ PBOTS_DATA_DIR（生产 dsh 子进程拿不到——launcher 有意不透传，
// 见 start.ts childEnv 注；留着兜测试直启）→ $HOME/.config/pbots-ui
// （main 侧 dataDir 缺省布局，app.getPath('userData')）。
// ponytail: main 显式设了自定义 PBOTS_DATA_DIR 时 SDK 子进程看不到该值，
// 身份会读错文件 → fail closed（工具不可见），注入待 P6-14b（开放闸 owns
// start.ts）。
/** Authoritative main-bot identity read from the M3 bots.json (P6-10). */

import { homedir } from 'node:os'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** M3 侧 dataDir 缺省布局（store 落盘文件名 BOTS_JSON = 'bots.json'）。 */
export const DEFAULT_DATA_SUBDIR = join('.config', 'pbots-ui')
export const BOTS_JSON = 'bots.json'

/**
 * Resolve the bots.json directory the same way the UI main does.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function orchDataDir(env = process.env) {
  const explicit = env.P2SDK_ORCH_DATA_DIR
  if (explicit !== undefined && explicit !== '') return explicit
  const pbots = env.PBOTS_DATA_DIR
  if (pbots !== undefined && pbots !== '') return pbots
  const home = env.HOME ?? homedir()
  return join(home, DEFAULT_DATA_SUBDIR)
}

/**
 * Read the authoritative mainBotId.
 * @param {string} [dir] data dir (default orchDataDir()).
 * @returns {Promise<string | null | undefined>} sessionId of the main bot;
 *   null = definitively none (missing file / null field);
 *   undefined = unreadable (corrupt / wrong version) → callers fail closed.
 */
export async function readMainBotId(dir = orchDataDir()) {
  let text
  try {
    text = await readFile(join(dir, BOTS_JSON), 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null
    return undefined
  }
  try {
    const meta = JSON.parse(text)
    if (typeof meta !== 'object' || meta === null || meta.version !== 1) return undefined
    return typeof meta.mainBotId === 'string' && meta.mainBotId !== '' ? meta.mainBotId : null
  } catch {
    return undefined
  }
}
