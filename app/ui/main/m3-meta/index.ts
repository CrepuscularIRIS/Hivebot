// M3 `pbots:bots-meta`（U-13）：get 返回 BotsMetaView（live = 未过滤 #1 含该 id，
// C:92，不写盘）；patch 只接受 mainBotId 且须在 #9 列表（其余 invalid-args）。
// 存储与队列见 store.ts；#4 编排/恢复编排见 orchestrate.ts / restore.ts（U-11/U-14 消费）。
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
}

/** 注册句柄：main/index.ts 用 handler 注册 IPC；U-11/U-14 消费 store 与 failed。 */
export interface M3Handle {
  handler: (req: unknown) => Promise<M3Result>
  store: BotsMetaStore
  failed: Set<string>
}

const invalidArgs = (message: string): M3Result => ({ ok: false, error: { code: 'pbots/invalid-args', message, details: {} } })

const stepFailed = (step: string, error: { code: string; message: string }): M3Result => ({
  ok: false,
  error: { code: 'pbots/unavailable', message: `${step} failed: ${error.code} ${error.message}`, details: {} },
})

export function registerM3Meta(deps: M3Deps): M3Handle {
  if (deps.store === undefined && deps.dataDir === undefined) {
    throw new Error('registerM3Meta: dataDir or store is required')
  }
  const store = deps.store ?? new BotsMetaStore(deps.dataDir as string)
  const init = store.init()
  const failed = deps.failed ?? new Set<string>()

  const liveView = async (): Promise<M3Result> => {
    let meta: BotsMeta
    try {
      meta = store.read()
    } catch (error) {
      return { ok: false, error: { code: 'pbots/storage', message: `bots.json unreadable: ${String(error)}`, details: {} } }
    }
    if (deps.dsh === undefined) {
      return { ok: false, error: { code: 'pbots/unavailable', message: 'dsh connection not ready', details: {} } }
    }
    const roster = await deps.dsh.rpc('agentPresets/list', {})
    if (!roster.ok) return stepFailed('agentPresets/list', roster.error)
    const ids = new Set(roster.value.presets.map((p: { id: string }) => p.id))
    const recipes: BotsMetaView['recipes'] = {}
    for (const [id, recipe] of Object.entries(meta.recipes)) {
      recipes[id] = { ...recipe, live: ids.has(id) && !failed.has(id) }
    }
    return { ok: true, value: { version: 1, mainBotId: meta.mainBotId, recipes } }
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
    const list = await deps.dsh.rpc('session/list', { cursor: null })
    if (!list.ok) return stepFailed('session/list', list.error)
    const items = (list.value as { items?: Array<{ sessionId: string }> }).items ?? []
    if (!items.some((item) => item.sessionId === mainBotId)) {
      return invalidArgs(`mainBotId ${JSON.stringify(mainBotId)} is not in session/list`)
    }
    try {
      await store.patchMainBotId(mainBotId)
    } catch (error) {
      return { ok: false, error: { code: 'pbots/storage', message: `bots.json write failed: ${String(error)}`, details: {} } }
    }
    return liveView()
  }

  return { handler, store, failed }
}
