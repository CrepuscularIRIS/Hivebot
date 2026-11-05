/**
 * 壳就绪闸门（U-00；U-14 加 restore 屏障）：窗口加载完成 + （若配置了 dsh）socket
 * generation ≥1 + （同条件）#21 恢复编排全部 settle（CONTRACT #21：全部 settle 前
 * M1/M2 不就绪）。失败配方不阻断就绪，failed preset ids 进 status 载荷供 UI 显示（§8-1）。
 */
export interface ReadyGateOptions {
  /** 是否配置了 dsh（默认按 PBOTS_DSH_HANDOFF 判定；测试注入）。 */
  dshConfigured?: boolean
}

export interface ReadyStatus {
  window: boolean
  dsh: boolean | null
  /** #21 恢复是否 settle（null = 未配置 dsh，无恢复可言）。 */
  restore: boolean | null
  /** restore 失败的 preset ids（live=false 的数据源之一，U-23 ③）。 */
  failedPresets: string[]
}

export interface ReadyGate {
  setWindowReady(): void
  setDshReady(generation?: number): void
  /** #21 恢复全部 settle（含失败）后调用；failed 进载荷，不阻断就绪。 */
  setRestoreSettled(failed: string[], generation?: number): void
  /** 全部已配置条件就绪后 resolve（dsh 未配置时只等窗口）。 */
  wait(): Promise<void>
  /** 只等 #21 恢复 settle（M1/M2 入口闸门用；dsh 连不上时不挂死 —— M2 自带 10s 超时兜底）。 */
  waitRestore(): Promise<void>
  status(): ReadyStatus
}

export function createReadyGate(opts: ReadyGateOptions = {}): ReadyGate {
  const dshConfigured = opts.dshConfigured ?? Boolean(process.env.PBOTS_DSH_HANDOFF)
  let generation = 0
  let windowReady = false
  let dshReady: boolean | null = dshConfigured ? false : null
  let restoreReady: boolean | null = dshConfigured ? false : null
  let failedPresets: string[] = []
  const waiters: Array<() => void> = []
  const restoreWaiters: Array<() => void> = []
  const done = (): boolean => windowReady && dshReady !== false && restoreReady !== false
  const restoreDone = (): boolean => restoreReady !== false
  const flush = (): void => {
    if (restoreDone()) for (const w of restoreWaiters.splice(0)) w()
    if (done()) for (const w of waiters.splice(0)) w()
  }
  return {
    setWindowReady() { windowReady = true; flush() },
    setDshReady(next?: number) {
      if (next !== undefined) {
        if (next < generation) return
        if (next !== generation) restoreReady = false
        generation = next
      }
      dshReady = true
      flush()
    },
    setRestoreSettled(failed: string[], restoredGeneration?: number) {
      if (generation !== (restoredGeneration ?? 0)) return
      restoreReady = true
      failedPresets = [...failed]
      flush()
    },
    wait() { if (done()) return Promise.resolve(); return new Promise((r) => waiters.push(r)) },
    waitRestore() { if (restoreDone()) return Promise.resolve(); return new Promise((r) => restoreWaiters.push(r)) },
    status() { return { window: windowReady, dsh: dshReady, restore: restoreReady, failedPresets: [...failedPresets] } },
  }
}
