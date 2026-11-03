// R7（REVIEW-P4终审）renderer 侧：window.pbots.botsMeta 是裸 ipcRenderer.invoke —— main 侧
// m3.handler 抛错时它 reject。loadRoster/refreshMeta/start/setMainBot 不得裸抛（boot 卡 starting、
// busy 永不复位），统一兜成结构化 !ok（与 U-22 [GU-1] api() 同模式）。
import { afterEach, describe, expect, it } from 'vitest'
import { getState, refreshMeta, setMainBot } from '../../../renderer/shell/store'

const stubWindow = (pbots: unknown): void => {
  ;(globalThis as { window?: unknown }).window = { pbots }
}
afterEach(() => { delete (globalThis as { window?: unknown }).window })

describe('R7：botsMeta rejection → 结构化 !ok，不逃出', () => {
  it('refreshMeta：rejection 被 resolve（不抛），state.meta 不变', async () => {
    stubWindow({ botsMeta: () => Promise.reject(new TypeError('fetch failed')) })
    await expect(refreshMeta()).resolves.toBeUndefined() // 修复前：rejection 裸抛（红）
    expect(getState().meta).toEqual({ mainBotId: null, recipes: {} })
  })

  it('setMainBot：rejection → {ok:false, pbots/unavailable}（调用方可复位 busy），不置顶', async () => {
    stubWindow({ botsMeta: () => Promise.reject(new TypeError('fetch failed')) })
    const res = await setMainBot('s-1')
    expect(res.ok).toBe(false)
    expect(res.error?.code).toBe('pbots/unavailable')
    expect(res.error?.message).toContain('fetch failed')
    expect(getState().meta.mainBotId).toBeNull()
    expect(getState().order).toEqual([])
  })

  it('无 preload 桥（window.pbots undefined）→ NO_BRIDGE 结构化 !ok（现状保持）', async () => {
    stubWindow(undefined)
    const res = await setMainBot('s-1')
    expect(res).toEqual({ ok: false, error: { code: 'pbots/unavailable', message: 'preload bridge missing' } })
  })
})
