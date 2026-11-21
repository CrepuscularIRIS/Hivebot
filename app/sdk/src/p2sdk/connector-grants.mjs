// T73b：连接器用时准入门——standing-grants 存储 + 判定 + 记住/清空。
// 原版锚：RE-CONNECTOR-GRANT-0.78.1.md §2.2（默认 always_this_bot、粒度 user×bot
// ——单用户本机即 bot×连接器）、§2.3（偏好持久 + 一键 Clear 回 {clearedCount}）。
//
// 安全三保（对应单测 ③④⑤⑥⑧）：
//  ① 粒度 = (botId, serverName) 精确对——不外溢到别的 bot / 别的连接器；
//  ② 授权只能来自「一张正在等答复的卡」：remember 只在未过期待答存在时写入——
//     renderer 被注入 / bot 自己直接调 RPC 都造不出授权（文件本身是 guard 硬
//     NEVER，never-roots.mjs 把 <dataDir>/standing-grants.json 列入，bot 文件
//     工具读写全拒——双保险）；
//  ③ 存储坏（非法 JSON / 版本不符）→ 当空 → 回出卡（fail closed）。
//
// 接线：shell-ask 的 mcp 分支先 judge——allow 直放；ask 先 markPending 再出卡。
// 路径由 start.ts 的 shell-ask 行 config（standingGrantsPath）传入（同
// policyStatePaths 推导）。本模块无 dsh 依赖（纯 fs），RPC 注册在 p2sdk 层
// （workspace.mjs 同款——由 start.ts 装配，见 m1 白名单对侧）。
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

export const name = 'p2sdk-connector-grants'

/** serverName 同 wrapper 的确定性命名口径（mcp__<serverName>__* 中段）。 */
const SERVER_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/
/** botId：session-<uuid> 形态（orchestrate 以 ws.botId 建 session）；同宽拒绝路径/空白。 */
const BOT_ID_RE = /^[\w-]{1,64}$/

const GRANTS_VERSION = 1
// 活卡窗：出卡到作答的真实挂屏期（原版卡即答即走）。结局由 shell-ask 的
// approval/request 中间件（prepend 外层）在 finally 里 consumePending——批准/拒绝/
// 取消/不可用都清（T73b2，Q-057=B）。TTL 90s 仅兜底（审批服务卸载、结局永不到来）。
const PENDING_TTL_MS = 90_000

const okShape = (botId, serverName) =>
  typeof botId === 'string' && typeof serverName === 'string'
  && BOT_ID_RE.test(botId) && SERVER_NAME_RE.test(serverName)

/** 读存储：坏/版本不符当空（fail closed = 回出卡），记一行 console.error。 */
function readGrants(path) {
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed?.version !== GRANTS_VERSION || parsed?.connectors === null || typeof parsed.connectors !== 'object') {
      console.error('p2sdk connector-grants: unrecognized standing-grants.json (version mismatch?) — treating as empty')
      return {}
    }
    return parsed.connectors
  } catch (e) {
    if (e?.code !== 'ENOENT') console.error('p2sdk connector-grants: standing-grants.json unreadable — treating as empty')
    return {}
  }
}

/** 原子写：临时文件 + rename（0600）。写失败抛给调用方（remember 转 refused）。 */
function writeGrants(path, connectors) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = join(dirname(path), `.${randomUUID()}.standing-grants.tmp`)
  writeFileSync(tmp, `${JSON.stringify({ version: GRANTS_VERSION, connectors }, null, 1)}\n`, { mode: 0o600 })
  renameSync(tmp, path)
}

/** 同 path 单例：shell-ask 与 RPC service 两个插件实例必须共享同一张待答表
 * （markPending 在 shell-ask 的 ask 路径、remember 在 RPC——不同实例就互看不见）。 */
const shared = new Map()

/**
 * @param {object} opts
 * @param {string} opts.path standing-grants.json 绝对路径
 * @param {number} [opts.pendingTtlMs] 待答有效期（默认 10 分钟；测试注入短值）
 */
export function createGrants(opts) {
  const existing = shared.get(opts.path)
  if (existing !== undefined) return existing
  const made = makeGrants(opts)
  shared.set(opts.path, made)
  return made
}

function makeGrants(opts) {
  const path = opts.path
  const ttl = Number.isFinite(opts.pendingTtlMs) && opts.pendingTtlMs > 0 ? opts.pendingTtlMs : PENDING_TTL_MS
  /** 待答表：`botId\u0000serverName` → 登记时刻（ms）。只有 ask 路径登记。 */
  const pending = new Map()
  const key = (botId, serverName) => `${botId}\u0000${serverName}`
  const pendingLive = (k) => {
    const at = pending.get(k)
    return at !== undefined && Date.now() - at <= ttl
  }

  return {
    /** 门判定：'allow' = 有 standing grant 直放；'ask' = 出卡（shell-ask 接）。 */
    judge(botId, serverName) {
      if (!okShape(botId, serverName)) return 'ask'
      const conns = readGrants(path)
      const list = conns[botId]
      return Array.isArray(list) && list.includes(serverName) ? 'allow' : 'ask'
    },
    /** 出卡前登记待答（同键刷新时刻）。remember 只认未过期待答。 */
    markPending(botId, serverName) {
      if (!okShape(botId, serverName)) return
      pending.set(key(botId, serverName), Date.now())
    },
    /** 消费待答（不放行、不写文件）——shell-ask 的 approval/request 中间件在结局
     *  finally 里调用：有结局的卡不再是活卡，此后 remember 拒绝（T73b2 全结局闭环）。 */
    consumePending(botId, serverName) {
      if (!okShape(botId, serverName)) return
      pending.delete(key(botId, serverName))
    },
    /** 活卡作答「始终允许」→ 写入并清待答；无待答/过期/形状坏 → refused（文件不动）。 */
    remember(botId, serverName) {
      if (!okShape(botId, serverName)) return { ok: false, reason: 'invalid-shape' }
      const k = key(botId, serverName)
      if (!pendingLive(k)) return { ok: false, reason: 'no-live-pending' }
      try {
        const conns = readGrants(path)
        const list = Array.isArray(conns[botId]) ? conns[botId] : []
        if (!list.includes(serverName)) list.push(serverName)
        conns[botId] = list
        writeGrants(path, conns)
      } catch (e) {
        return { ok: false, reason: `write-failed:${e?.code ?? 'unknown'}` }
      }
      pending.delete(k)
      return { ok: true }
    },
    /** 一键清空（设置域 Clear）。回被清条数（bot×连接器对数，§2.3 {clearedCount}）。 */
    clear() {
      const conns = readGrants(path)
      let clearedCount = 0
      for (const list of Object.values(conns)) clearedCount += Array.isArray(list) ? list.length : 0
      try {
        writeGrants(path, {})
      } catch {
        // 清不掉（只读 fs 等）也把计数如实回——文件留在原状，下一次启动仍读到旧偏好
        return { clearedCount: 0 }
      }
      return { clearedCount }
    },
  }
}

/** 形状校验导出（M1 白名单 checkArgs 与 RPC 同口径）。 */
export const shapesOk = okShape


// ── RPC service（workspace.mjs 同款）：p2sdk/connector_grants_remember|clear ──
// start.ts insert 行挂载（本机模式），config.standingGrantsPath 与 shell-ask 行
// 同一推导——单例（shared）保证两插件共享待答表。
const require_ = createRequire(import.meta.url)
// p610-inspect/workspace 同款：typert-protocol 经 dsh-plugin-market 的 require 域解析
const fromMarket = createRequire(require_.resolve('@deepseek-ai/dsh-plugin-market'))
const { TypertRemoteService, RemoteError } = await import(pathToFileURL(fromMarket.resolve('@deepseek-ai/dsh-typert-protocol')))

export default class ConnectorGrantsService extends TypertRemoteService {
  constructor(ctx, config = {}) {
    super(ctx, 'p2sdkConnectorGrants', { namespace: 'p2sdk' })
    if (typeof config.standingGrantsPath !== 'string' || config.standingGrantsPath.length === 0) {
      throw new Error('p2sdk/connector-grants: config.standingGrantsPath is required (start.ts 注入)')
    }
    this.grants = createGrants({ path: config.standingGrantsPath })
  }

  /** 活卡作答「始终允许」——只认 shell-ask 登记的未过期待答（单测 ⑤⑥）。 */
  async connector_grants_remember(request) {
    const botId = String(request?.botId ?? '')
    const serverName = String(request?.serverName ?? '')
    if (!shapesOk(botId, serverName)) {
      throw new RemoteError('p2sdk/connector-grants/bad-shape', `shape rejected: ${JSON.stringify({ botId, serverName })}`, {})
    }
    const r = this.grants.remember(botId, serverName)
    if (!r.ok) throw new RemoteError('p2sdk/connector-grants/refused', `no live pending card: ${JSON.stringify({ botId, serverName })}`, { reason: r.reason })
    return { ok: true }
  }

  /** 一键清空（设置域 Clear）。 */
  async connector_grants_clear() {
    return this.grants.clear()
  }
}


// 方法路由按 remoteMethods marker 扫（workspace.mjs 同款：.mjs 裸 node 无装饰器，
// 照 dsh-api-gateway lib:449-468 的 descriptor 形态程序化注册——缺这个 gateway
// 方法表没有这两法，RPC 404）。
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'
Object.defineProperty(ConnectorGrantsService.prototype, REMOTE_METHOD_DESCRIPTOR, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([
      Object.freeze({ method: 'connector_grants_remember', invocation: Object.freeze({ kind: 'direct' }) }),
      Object.freeze({ method: 'connector_grants_clear', invocation: Object.freeze({ kind: 'direct' }) }),
    ]),
  }),
})
