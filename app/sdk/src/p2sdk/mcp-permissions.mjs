// B45：per-tool MCP 四档权限存储——0.78.1/1.1.0 同构锚 RE-TOOL-PERMS-1.1.0 §1。
// 档位枚举（原版 Gx/MYe schema）：auto_review | always_allow | needs_approval | blocked。
// 与 standing-grants（bot×连接器）互补：本表按 serverId×tool 粒度，优先级高于
// grants 门（shell-ask mcp 分支先 judge 本表）。文件 <dataDir>/mcp-permissions.json，
// 损坏/缺省一律视为空表（fail-closed：无记录走默认 ask 链）。
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const name = 'p2sdk-mcp-permissions'

const TIERS = new Set(['auto_review', 'always_allow', 'needs_approval', 'blocked'])
const SCHEMA = { version: 1, servers: {} }

/** @param {string} p */
function readPerms(p) {
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'))
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ...SCHEMA, servers: {} }
    if (raw.version !== 1) return { ...SCHEMA, servers: {} }
    if (raw.servers === null || typeof raw.servers !== 'object' || Array.isArray(raw.servers)) {
      return { ...SCHEMA, servers: {} }
    }
    return raw
  } catch (e) {
    if (e?.code !== 'ENOENT') console.error('p2sdk mcp-permissions: unreadable mcp-permissions.json — treating as empty')
    return { ...SCHEMA, servers: {} }
  }
}

/**
 * @param {string} p 目标 json 路径
 * @param {{version:number, servers:Record<string,{tools:Record<string,string>}>}} data
 */
function writePerms(p, data) {
  mkdirSync(dirname(p), { recursive: true })
  const tmp = join(dirname(p), `.${randomUUID()}.mcp-perms.tmp`)
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8')
  renameSync(tmp, p)
}

function okShape(serverId, tool) {
  return typeof serverId === 'string' && serverId.length > 0 && typeof tool === 'string' && tool.length > 0
}

const shared = new Map()

/**
 * @param {{path: string}} opts mcp-permissions.json 绝对路径
 */
export function createMcpPermissions(opts) {
  const existing = shared.get(opts.path)
  if (existing !== undefined) return existing
  const made = makeMcpPermissions(opts)
  shared.set(opts.path, made)
  return made
}

function makeMcpPermissions(opts) {
  const path = opts.path
  return {
    /** 四档判定：有记录回档位字面量；无记录/形状坏回 null（走默认链，fail-closed）。 */
    judge(serverId, tool) {
      if (!okShape(serverId, tool)) return null
      const data = readPerms(path)
      const tier = data.servers?.[serverId]?.tools?.[tool]
      return typeof tier === 'string' && TIERS.has(tier) ? tier : null
    },
    /** 写单工具档位（UI setMcpToolPermissions 的落点）。未知档位拒绝。 */
    set(serverId, tool, tier) {
      if (!okShape(serverId, tool)) return { ok: false, reason: 'invalid-shape' }
      if (!TIERS.has(tier)) return { ok: false, reason: 'invalid-tier' }
      try {
        const data = readPerms(path)
        const servers = data.servers ?? {}
        const entry = servers[serverId] ?? { tools: {} }
        entry.tools = entry.tools ?? {}
        entry.tools[tool] = tier
        servers[serverId] = entry
        data.servers = servers
        writePerms(path, data)
      } catch (e) {
        return { ok: false, reason: `write-failed:${e?.code ?? 'unknown'}` }
      }
      return { ok: true }
    },
    /** 整 server 读取（桥 listMcpServerTools 的数据源）。回 {serverId: {tool: tier}} 平铺。 */
    list(serverId) {
      const data = readPerms(path)
      const tools = data.servers?.[serverId]?.tools
      if (tools === null || typeof tools !== 'object' || Array.isArray(tools)) return {}
      const out = {}
      for (const [t, tier] of Object.entries(tools)) {
        if (TIERS.has(tier)) out[t] = tier
      }
      return out
    },
  }
}
