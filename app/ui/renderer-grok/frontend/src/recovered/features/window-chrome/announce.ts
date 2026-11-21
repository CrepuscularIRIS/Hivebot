// B40-C：全局 announce store——0.78.1 fS/pS 语义的最小复刻。
// 原版（index.eager-app pS）：双 channel {message,tick}，发布 tick+1（同文案重宣靠 tick 变化
// 重新触发 live region），返回清理函数把该条重置为空。视觉隐藏的 live region 由根组件挂载。
export type AnnounceChannel = 'polite' | 'assertive'

export interface AnnounceState { message: string; tick: number }

export interface AnnounceStore {
  get(channel: AnnounceChannel): AnnounceState
  /** 发布一条播报；返回清理函数（重置该条文案，tick 不回退）。 */
  announce(message: string, opts?: { assertive?: boolean }): () => void
  subscribe(listener: () => void): () => void
}

export function createAnnounceStore(): AnnounceStore {
  const state: Record<AnnounceChannel, AnnounceState> = {
    polite: { message: '', tick: 0 },
    assertive: { message: '', tick: 0 },
  }
  const listeners = new Set<() => void>()
  return {
    get: (channel) => state[channel],
    announce(message, opts) {
      const channel: AnnounceChannel = opts?.assertive === true ? 'assertive' : 'polite'
      state[channel] = { message, tick: state[channel].tick + 1 }
      for (const l of [...listeners]) l()
      return () => {
        if (state[channel].message === message) state[channel] = { message: '', tick: state[channel].tick }
        for (const l of [...listeners]) l()
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
