// U-00.fN ②：loadURL 的 ERR_ABORTED（首屏加载期被 renderer 导航抢占取消）不触发
// app.exit(1)。判定口径照上游 deepseek-harness main.ts:506-512（promise reject 的
// code 是字符串形式；did-fail-load 事件回调的数字 code 是另一条路径，不在此判）。
import { describe, expect, it } from 'vitest'
import { isTolerableLoadError } from '../../../main/index'

describe('isTolerableLoadError', () => {
  it('ERR_ABORTED（导航取消）容忍', () => {
    const error = Object.assign(new Error('ERR_ABORTED: navigation interrupted'), { code: 'ERR_ABORTED' })
    expect(isTolerableLoadError(error)).toBe(true)
  })

  it('其他 net 错误不容忍（保持退出现行为）', () => {
    expect(isTolerableLoadError(Object.assign(new Error('x'), { code: 'ERR_FILE_NOT_FOUND' }))).toBe(false)
    // 只认 Electron promise reject 的字符串形式；数字 -3 是 did-fail-load 事件参数形状。
    expect(isTolerableLoadError(Object.assign(new Error('x'), { code: -3 }))).toBe(false)
  })

  it('非 Error / 无 code 的抛出物不容忍', () => {
    expect(isTolerableLoadError(new Error('plain'))).toBe(false)
    expect(isTolerableLoadError('ERR_ABORTED')).toBe(false)
    expect(isTolerableLoadError(undefined)).toBe(false)
  })
})
