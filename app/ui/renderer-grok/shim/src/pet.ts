// T45a：桌宠状态纯函数——roster 全部 bot 取 rankOf(factsOf(id)) 最小者为「领头 bot」，
// 档位映射 dsh-pet 六态（assets/…/work-status.ts 同源语义；「整理」档本单不做）。
import { rankOf, type WorkerFacts } from './workers'

export type PetState = 'idle' | 'waiting' | 'working' | 'thinking' | 'error' | 'success'
export const PET_STATES: readonly PetState[] = ['idle', 'waiting', 'working', 'thinking', 'error', 'success']

/** 视图加载态的最小面（pet 只需这两件事）。 */
export interface PetViewInfo { loaded: boolean; runningTool: boolean }

/**
 * 由「rank 最小的 bot」定宠物状态。
 * @param roster Array<{id, facts, view?}>——facts=factsOf(id)，view=该 bot 的视图信息（未 follow 则缺省）。
 * @returns {state, botId}（全闲 roster 空 → idle/null）
 */
export function petStateOf(roster: ReadonlyArray<{ id: string; facts: WorkerFacts; view?: PetViewInfo }>): { state: PetState; botId: string | null } {
  let best: { id: string; facts: WorkerFacts; view?: PetViewInfo } | null = null
  for (const item of roster) if (best === null || rankOf(item.facts) < rankOf(best.facts)) best = item
  if (best === null || rankOf(best.facts) >= 4) return { state: 'idle', botId: null }
  const rank = rankOf(best.facts)
  if (rank === 0) return { state: 'waiting', botId: best.id }
  if (rank === 1) {
    const view = best.view
    // 视图未加载也算 working（保守：在跑的回合无法区分思考/干活）；已加载按「本回合有无在跑工具」分
    if (view === undefined || !view.loaded) return { state: 'working', botId: best.id }
    return view.runningTool ? { state: 'working', botId: best.id } : { state: 'thinking', botId: best.id }
  }
  if (rank === 2) return best.facts.end === 'failed' ? { state: 'error', botId: best.id } : { state: 'idle', botId: null }
  // rank 3（新结果）
  return best.facts.end === 'ok' ? { state: 'success', botId: best.id } : { state: 'idle', botId: null }
}
