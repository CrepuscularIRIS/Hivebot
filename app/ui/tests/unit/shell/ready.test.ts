// U-14 ready 闸门：在 U-00 的 window + dsh 之上加 restore（#21 全部 settle）条件，
// failed preset ids 进 status 载荷（供 UI 显示，CONTRACT #21 / §8-1）。
import { describe, expect, it } from 'vitest'
import { createReadyGate } from '../../../main/ready'

const waited = (p: Promise<void>, ms: number): Promise<'settled' | 'pending'> =>
  Promise.race([p.then(() => 'settled' as const), new Promise<'pending'>((r) => setTimeout(() => r('pending'), ms))])

describe('createReadyGate（U-14 restore 屏障）', () => {
  it('未配置 dsh：restore 为 null，只等 window（U-00 行为不破）', async () => {
    const gate = createReadyGate({ dshConfigured: false })
    expect(gate.status()).toEqual({ window: false, dsh: null, restore: null, failedPresets: [] })
    expect(await waited(gate.wait(), 20)).toBe('pending')
    gate.setWindowReady()
    expect(await waited(gate.wait(), 20)).toBe('settled')
  })

  it('配置了 dsh：window + dsh 就绪但 restore 未 settle → wait 挂起；settle（含失败）后 resolve，failed 进载荷', async () => {
    const gate = createReadyGate({ dshConfigured: true })
    gate.setWindowReady()
    gate.setDshReady()
    expect(await waited(gate.wait(), 20)).toBe('pending')
    // §8-1：restore 有失败配方也照样 settle —— 单失败不阻断 M1/M2 就绪
    gate.setRestoreSettled(['p2temp-bad0000000'])
    expect(await waited(gate.wait(), 20)).toBe('settled')
    expect(gate.status()).toEqual({ window: true, dsh: true, restore: true, failedPresets: ['p2temp-bad0000000'] })
  })

  it('restore + dsh 都 settle 但 window 未就绪 → 仍挂起（三条件缺一不可）', async () => {
    const gate = createReadyGate({ dshConfigured: true })
    gate.setDshReady()
    gate.setRestoreSettled([])
    expect(await waited(gate.wait(), 20)).toBe('pending')
    gate.setWindowReady()
    expect(await waited(gate.wait(), 20)).toBe('settled')
  })
})
