// B45b：per-tool MCP 四档权限的 main 侧文件面（UI 读写 → sdk shell-ask 同文件先裁）。
// 链路：renderer（market 已装区四档下拉）→ pbots:mcp-permissions → 本 handler →
// <PBOTS_DATA_DIR>/mcp-permissions.json；sdk start.ts 的 mcpPermissionsPath 注入同一
// 文件（P5-01 决策 15：两侧同根）。schema 与 sdk p2sdk/mcp-permissions.mjs 一致：
// {version:1, servers:{<serverId>:{tools:{<tool>: auto_review|always_allow|needs_approval|blocked}}}}。
// 损坏/缺省读回空表（fail-closed：无记录走默认链，与 sdk 侧语义对齐）。
import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const TIERS = new Set(['auto_review', 'always_allow', 'needs_approval', 'blocked'])

type PermFile = { version: number, servers: Record<string, { tools: Record<string, string> }> }

function readPerms(path: string): PermFile {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as PermFile
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { version: 1, servers: {} }
    if (raw.version !== 1) return { version: 1, servers: {} }
    if (raw.servers === null || typeof raw.servers !== 'object' || Array.isArray(raw.servers)) {
      return { version: 1, servers: {} }
    }
    return raw
  } catch {
    return { version: 1, servers: {} } // ENOENT 首启 / 损坏 → 空表
  }
}

function writePerms(path: string, data: PermFile): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = join(dirname(path), `.${randomUUID()}.mcp-perms.tmp`)
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8')
  renameSync(tmp, path)
}

/** main/index.ts 启动时注册。dataDir = process.env.PBOTS_DATA_DIR ?? app.getPath('userData')。 */
export function registerMcpPermissions(dataDir: string): void {
  const file = resolve(dataDir, 'mcp-permissions.json')
  ipcMain.handle('pbots:mcp-permissions', (_event, req: unknown) => {
    const r = req as { op?: string, serverId?: string, tool?: string, tier?: string } | null
    if (r === null || typeof r !== 'object' || typeof r.op !== 'string') {
      return { ok: false, code: 'pbots/invalid-args' }
    }
    if (r.op === 'get') {
      // 回全表平铺（UI 初始化渲染用）——PbotsApiResult 壳：{ok, value:{servers}}（skills/botsMeta 同款）
      const data = readPerms(file)
      const flat: Record<string, Record<string, string>> = {}
      for (const [sid, entry] of Object.entries(data.servers)) {
        const tools: Record<string, string> = {}
        for (const [t, tier] of Object.entries(entry?.tools ?? {})) {
          if (TIERS.has(tier)) tools[t] = tier
        }
        flat[sid] = tools
      }
      return { ok: true, value: { servers: flat } }
    }
    if (r.op === 'set') {
      if (typeof r.serverId !== 'string' || r.serverId.length === 0 || typeof r.tool !== 'string' || r.tool.length === 0) {
        return { ok: false, code: 'pbots/invalid-args' }
      }
      if (typeof r.tier !== 'string' || !TIERS.has(r.tier)) {
        return { ok: false, code: 'pbots/invalid-tier' }
      }
      try {
        const data = readPerms(file)
        const entry = data.servers[r.serverId] ?? { tools: {} }
        entry.tools = entry.tools ?? {}
        entry.tools[r.tool] = r.tier
        data.servers[r.serverId] = entry
        writePerms(file, data)
        return { ok: true }
      } catch {
        return { ok: false, code: 'pbots/write-failed' }
      }
    }
    return { ok: false, code: 'pbots/invalid-args' }
  })
}
