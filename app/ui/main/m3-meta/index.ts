// M3 `pbots:bots-meta`（U-13 实现；U-00 交付最小桩：get 返回空视图，patch 拒绝）。
export interface BotsMetaView {
  version: 1
  mainBotId: string | null
  recipes: Record<string, { agentPreset: string; connectors: string[]; live: boolean }>
}

export type M3Result = { ok: true; value: BotsMetaView } | { ok: false; error: { code: string; message: string; details: {} } }

/** 空 register：无盘、无写。 */
export function registerM3Meta(): (req: { op: 'get' } | { op: 'patch'; mainBotId: unknown }) => Promise<M3Result> {
  const empty: BotsMetaView = { version: 1, mainBotId: null, recipes: {} }
  return async (req) => {
    if (req.op === 'get') return { ok: true, value: empty }
    return { ok: false, error: { code: 'pbots/invalid-args', message: 'M3 meta bridge not installed (U-13); mainBotId cannot be set', details: {} } }
  }
}
