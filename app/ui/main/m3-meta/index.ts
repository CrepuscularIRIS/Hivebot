// M3 `pbots:bots-meta`（U-13）：get 返回 BotsMetaView（live = 未过滤 #1 含该 id，
// C:92，不写盘）；patch 只接受 mainBotId 且须在 #9 列表（其余 invalid-args）。
// 存储与队列见 store.ts；#4 编排/恢复编排见 orchestrate.ts / restore.ts（U-11/U-14 消费）。
import type { ConnectionRpcResult } from '../dsh/connect'
import type { DshLike } from './orchestrate'
import { BotsMetaStore, type BotsMeta, type Recipe } from './store'

export interface BotsMetaView extends BotsMeta {
  recipes: Record<string, Recipe & { live: boolean }>
}

export type M3Result =
  | { ok: true; value: BotsMetaView }
  | { ok: false; error: { code: string; message: string; details: {} } }

export interface M3Deps {
  /** dsh 连接（未配置时 get/patch 返回 pbots/unavailable）。 */
  dsh?: DshLike
  /** bots.json 所在目录（$PBOTS_DATA_DIR；生产 = env ?? app.getPath('userData')）。 */
  dataDir?: string
  /** 复用外部 store（U-14 restoreRecipes / U-11 #4 编排要与 handler 同一实例）；不传则自建。 */
  store?: BotsMetaStore
  /** 恢复编排（U-14 restoreRecipes）写入的失败集合；get 的 live 计算并入。 */
  failed?: Set<string>
  /** U-28 R6：#21 restore 是否已 settle（main 注入 ready.status()）。未 settle 时 get
   * 返回 pbots/restore-pending 而非误导性 live=false —— renderer loadRoster 的 500ms
   * 重试循环会消化该错误，settle 后拿到正确视图；不挂起（不卡 renderer）。缺省 = 已
   * settle（行为与 U-13 一致，dsh 未配置等场景）。 */
  restoreSettled?: () => boolean
}

/** 注册句柄：main/index.ts 用 handler 注册 IPC；U-11/U-14 消费 store/failed/init。 */
export interface M3Handle {
  handler: (req: unknown) => Promise<M3Result>
  store: BotsMetaStore
  failed: Set<string>
  /** 首次读盘（init 时启动）；U-14 restore 前等待它，避免读到未初始化的空态。 */
  init: Promise<void>
}

const invalidArgs = (message: string): M3Result => ({ ok: false, error: { code: 'pbots/invalid-args', message, details: {} } })

const stepFailed = (step: string, error: { code: string; message: string }): M3Result => ({
  ok: false,
  error: { code: 'pbots/unavailable', message: `${step} failed: ${error.code} ${error.message}`, details: {} },
})

/**
 * R7（REVIEW-P4终审；U-28 R2 同覆盖）：DshLike 只承诺「不 ok 时返回 {ok:false}」，但 rpcRaw 的
 * fetch / res.json 网络层异常会以 rejection 逃出该契约（socket 活着而 HTTP 瞬断/截断）。
 * ipcMain.handle 直接 return handler()，rejection 会变成 renderer 的 ipcRenderer.invoke
 * reject —— 在此兜成普通 {ok:false}，由调用点现成的 stepFailed 链统一包装（单层语义；
 * renderer 侧 metaApi 的 .catch 是最后一道，双保险）。
 */
async function safeRpc(dsh: DshLike, method: string, args: unknown): Promise<ConnectionRpcResult> {
  try {
    return await dsh.rpc(method, args)
  } catch (error) {
    return {
      ok: false,
      error: { code: 'pbots/unavailable', message: `rpc failed: ${error instanceof Error ? error.message : String(error)}`, details: {} },
    }
  }
}

export function registerM3Meta(deps: M3Deps): M3Handle {
  if (deps.store === undefined && deps.dataDir === undefined) {
    throw new Error('registerM3Meta: dataDir or store is required')
  }
  const store = deps.store ?? new BotsMetaStore(deps.dataDir as string)
  const init = store.init()
  const failed = deps.failed ?? new Set<string>()

  const liveView = async (): Promise<M3Result> => {
    // U-28 R6：restore 未 settle → pending 结构化错误（不查 #1，不给 boot 期误导 live）。
    if (deps.restoreSettled !== undefined && !deps.restoreSettled()) {
      return { ok: false, error: { code: 'pbots/restore-pending', message: 'preset restore in progress', details: {} } }
    }
    let meta: BotsMeta
    try {
      meta = store.read()
    } catch (error) {
      return { ok: false, error: { code: 'pbots/storage', message: `bots.json unreadable: ${String(error)}`, details: {} } }
    }
    if (deps.dsh === undefined) {
      return { ok: false, error: { code: 'pbots/unavailable', message: 'dsh connection not ready', details: {} } }
    }
    const roster = await safeRpc(deps.dsh, 'agentPresets/list', {})
    if (!roster.ok) return stepFailed('agentPresets/list', roster.error)
    const ids = new Set(roster.value.presets.map((p: { id: string }) => p.id))
    const recipes: BotsMetaView['recipes'] = {}
    for (const [id, recipe] of Object.entries(meta.recipes)) {
      recipes[id] = { ...recipe, live: ids.has(id) && !failed.has(id) }
    }
    // P6-15：可选 bots（createdBy）原样带给 renderer（worker 分组推导；无 worker 不带键）
    return { ok: true, value: { version: 1, mainBotId: meta.mainBotId, recipes, ...(meta.bots === undefined ? {} : { bots: meta.bots }) } }
  }

  const handler = async (req: unknown): Promise<M3Result> => {
    await init
    if (typeof req !== 'object' || req === null) return invalidArgs('M3 request must be {op:"get"} or {op:"patch", mainBotId}')
    const { op } = req as { op?: unknown }
    if (op === 'get') return liveView()
    if (op !== 'patch') return invalidArgs('M3 op must be "get" or "patch"')
    const keys = Object.keys(req).filter((key) => key !== 'op')
    const mainBotId = (req as { mainBotId?: unknown }).mainBotId
    if (keys.length !== 1 || keys[0] !== 'mainBotId' || typeof mainBotId !== 'string') {
      return invalidArgs('patch accepts only {op:"patch", mainBotId:string}')
    }
    if (deps.dsh === undefined) {
      return { ok: false, error: { code: 'pbots/unavailable', message: 'dsh connection not ready', details: {} } }
    }
    // W1 R4：上游 list(_request, signal) 的参数名是 _request——壳形态 {_request:{}}（VERIFY-U-15 终裁）
    const list = await safeRpc(deps.dsh, 'session/list', { _request: {} })
    if (!list.ok) return stepFailed('session/list', list.error)
    const items = (list.value as { items?: Array<{ sessionId: string, origin?: string, parentSessionId?: string }> }).items ?? []
    const target = items.find((item) => item.sessionId === mainBotId)
    if (target === undefined) {
      return invalidArgs(`mainBotId ${JSON.stringify(mainBotId)} is not in session/list`)
    }
    // T36 防提升（helper 进侧栏后的新攻击面）：subagent helper 不得被设为主 bot——它是权限
    // 收窄、审批自动拒的会话，设为主后主 bot 从此不可用。worker 拒绝见下（CONTRACT #20 同口径）。
    if (target.origin === 'subagent' || target.parentSessionId !== undefined) {
      return invalidArgs(`mainBotId ${JSON.stringify(mainBotId)} is a subagent helper (origin/parentSessionId set); helpers cannot be promoted to main (T36)`)
    }
    // P6-10 验收 ④（#20 防提升，CONTRACT v1.5）：worker（带 createdBy）不得被设为主
    // bot——只收紧、不放宽。
    try {
      if (store.read().bots?.[mainBotId] !== undefined) {
        return invalidArgs(`mainBotId ${JSON.stringify(mainBotId)} is a worker (createdBy set); workers cannot be promoted to main (CONTRACT #20)`)
      }
    } catch (error) {
      return { ok: false, error: { code: 'pbots/storage', message: `bots.json unreadable: ${String(error)}`, details: {} } }
    }
    try {
      await store.patchMainBotId(mainBotId)
    } catch (error) {
      return { ok: false, error: { code: 'pbots/storage', message: `bots.json write failed: ${String(error)}`, details: {} } }
    }
    return liveView()
  }

  return { handler, store, failed, init }
}
