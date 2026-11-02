/** 壳就绪闸门：窗口加载完成 + （若配置了 dsh）socket generation ≥1 就绪。U-14 在此上加 ensure 屏障。 */
export interface ReadyGate {
  setWindowReady(): void
  setDshReady(): void
  /** 全部已配置条件就绪后 resolve（dsh 未配置时只等窗口）。 */
  wait(): Promise<void>
  status(): { window: boolean; dsh: boolean | null }
}

export function createReadyGate(): ReadyGate {
  let windowReady = false
  let dshReady: boolean | null = process.env.PBOTS_DSH_HANDOFF ? false : null
  const waiters: Array<() => void> = []
  const done = (): boolean => windowReady && dshReady !== false
  const flush = (): void => { if (done()) for (const w of waiters.splice(0)) w() }
  return {
    setWindowReady() { windowReady = true; flush() },
    setDshReady() { dshReady = true; flush() },
    wait() { if (done()) return Promise.resolve(); return new Promise((r) => waiters.push(r)) },
    status() { return { window: windowReady, dsh: dshReady } },
  }
}
