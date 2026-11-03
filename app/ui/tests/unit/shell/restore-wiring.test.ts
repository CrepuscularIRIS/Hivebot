// U-28 R3/R4/R5 接线级：恢复编排挂「连接成功」事件（onConnected）而非一次性的
// dshStart —— 首连超时 reject 后后台重连成功时补跑 preset.ensure，restore 成功清
// failed，M3 get 的 live 由 false 翻回 true。wireRestoreOnReconnect 是 main() 的
// 接线纯函数面（DshConnection 满足最小依赖形状）。
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {},
  BrowserWindow: { getAllWindows: () => [] },
  dialog: {},
  ipcMain: { handle: () => {}, on: () => {} },
  MessageChannelMain: {},
  protocol: { handle: () => {}, registerSchemesAsPrivileged: () => {} },
}))

import { wireRestoreOnReconnect } from '../../../main/index'
import { registerM3Meta, type M3Handle } from '../../../main/m3-meta'
import { BotsMetaStore } from '../../../main/m3-meta/store'
import { presetIdOf } from '../../../main/m3-meta/preset-id'
import { createReadyGate } from '../../../main/ready'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

interface FakeDsh {
  calls: Array<{ method: string; args: unknown }>
  onConnected(cb: (g: number) => void): void
  emitConnected(g: number): void
  rpc(method: string, args: unknown): Promise<unknown>
}

function fakeDsh(handlers: Record<string, () => unknown>): FakeDsh {
  const listeners: Array<(g: number) => void> = []
  const calls: Array<{ method: string; args: unknown }> = []
  return {
    calls,
    onConnected(cb) { listeners.push(cb) },
    emitConnected(g) { for (const l of [...listeners]) l(g) },
    async rpc(method) {
      calls.push({ method, args: null })
      const h = handlers[method]
      if (h === undefined) return { ok: false, error: { code: 'gateway/internal', message: `no mock for ${method}`, details: {} } }
      return h()
    },
  }
}

const until = async (cond: () => boolean, ms = 2_000): Promise<void> => {
  const deadline = Date.now() + ms
  while (!cond()) {
    if (Date.now() > deadline) throw new Error('condition not met in time')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('wireRestoreOnReconnect（U-28 R3/R4/R5）', () => {
  it('首连 ensure 失败 → failed/live=false；重连成功补跑 restore → failed 清空、live=true', async () => {
    const presetId = presetIdOf('p2-alpha', ['a'])
    const store = new BotsMetaStore(mkdtempSync(join(tmpdir(), 'bot-U-28-wire-')))
    await store.init()
    await store.putRecipe(presetId, { agentPreset: 'p2-alpha', connectors: ['a'] })

    let installed = false
    const dsh = fakeDsh({
      'p2temp/preset.ensure': () => (installed
        ? { ok: true, value: { presetId } }
        : { ok: false, error: { code: 'p2temp/connector-unavailable', message: 'not installed', details: {} } }),
      'agentPresets/list': () => ({ ok: true, value: { presets: [{ id: 'p2-alpha', isDefault: true }, { id: presetId }] } }),
    })
    const ready = createReadyGate({ dshConfigured: true })
    ready.setWindowReady()
    const m3: M3Handle = registerM3Meta({
      dsh: dsh as never,
      store,
      failed: new Set<string>(),
      restoreSettled: () => ready.status().restore !== false,
    })
    const log = vi.fn()
    wireRestoreOnReconnect(dsh, m3, ready, log)

    // 首连（等价 boot 首次成功路径）：ensure 失败 → failed 有 id；registry 含 id 也 live=false
    dsh.emitConnected(1)
    await until(() => ready.status().restore === true)
    expect(ready.status().dsh).toBe(true) // setDshReady 也在连接成功时补调（超时场景不再漏）
    expect([...m3.failed]).toEqual([presetId])
    let view = await m3.handler({ op: 'get' })
    expect(view.ok && view.value.recipes[presetId].live).toBe(false)

    // 引擎重启后重连（R3/R4：一次性 dshStart 之外的路径）→ 补跑 restore 成功 → live 翻回
    installed = true
    dsh.emitConnected(2)
    await until(() => m3.failed.size === 0)
    view = await m3.handler({ op: 'get' })
    expect(view.ok && view.value.recipes[presetId].live).toBe(true)
    // 补跑确实发生了（两次 ensure 批次）
    expect(dsh.calls.filter((c) => c.method === 'p2temp/preset.ensure').length).toBe(2)
  })

  it('两次连接事件不叠跑：restore 串行（第二次等第一次 settle 后才发下一批 ensure）', async () => {
    const presetId = presetIdOf('p2-alpha', ['b'])
    const store = new BotsMetaStore(mkdtempSync(join(tmpdir(), 'bot-U-28-wire2-')))
    await store.init()
    await store.putRecipe(presetId, { agentPreset: 'p2-alpha', connectors: ['b'] })
    let inFlight = 0
    let maxInFlight = 0
    let done = 0
    const dsh = fakeDsh({
      'p2temp/preset.ensure': () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        return new Promise((resolve) => {
          setTimeout(() => { inFlight -= 1; done += 1; resolve({ ok: true, value: { presetId } }) }, 30)
        })
      },
      'agentPresets/list': () => ({ ok: true, value: { presets: [{ id: 'p2-alpha', isDefault: true }] } }),
    })
    const ready = createReadyGate({ dshConfigured: true })
    ready.setWindowReady()
    const m3 = registerM3Meta({ dsh: dsh as never, store, failed: new Set<string>() })
    wireRestoreOnReconnect(dsh, m3, ready, () => {})
    dsh.emitConnected(1)
    dsh.emitConnected(2) // 紧接着的第二代：必须排在第一代 restore 之后
    await until(() => done === 2, 3_000)
    expect(maxInFlight).toBe(1) // 两批 ensure 不并发叠跑
  })
})
