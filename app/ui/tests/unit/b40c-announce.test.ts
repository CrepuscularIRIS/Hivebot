// B40-C：全局 announce store（0.78.1 fS/pS 语义复刻）——polite/assertive 双 channel + tick 递增 + 清理重置。
import { expect, it } from 'vitest'
import { createAnnounceStore } from '../../renderer-grok/frontend/src/recovered/features/window-chrome/announce'

it('announce：双 channel 隔离 + tick 递增 + 清理函数重置', () => {
  const store = createAnnounceStore()
  // 初始态
  expect(store.get('polite')).toEqual({ message: '', tick: 0 })
  expect(store.get('assertive')).toEqual({ message: '', tick: 0 })

  // polite 发布 → message+tick
  const clear1 = store.announce('Copied')
  expect(store.get('polite')).toEqual({ message: 'Copied', tick: 1 })
  expect(store.get('assertive')).toEqual({ message: '', tick: 0 }) // 隔离

  // 同 channel 再次发布 → tick 递增（同文案也重宣，live region 靠 tick 变化重触发）
  store.announce('Copied')
  expect(store.get('polite')).toEqual({ message: 'Copied', tick: 2 })

  // assertive 发布走独立 channel
  store.announce('Failed to copy', { assertive: true })
  expect(store.get('assertive')).toEqual({ message: 'Failed to copy', tick: 1 })

  // 清理函数把对应 channel 重置为空（0.78.1 pS 返回的清理语义）
  clear1()
  expect(store.get('polite')).toEqual({ message: '', tick: 2 }) // tick 不回退（只清文案）
  expect(store.get('assertive')).toEqual({ message: 'Failed to copy', tick: 1 })

  // subscribe：发布时通知
  let notified = 0
  const stop = store.subscribe(() => { notified += 1 })
  store.announce('Again')
  expect(notified).toBe(1)
  stop()
  store.announce('No notify')
  expect(notified).toBe(1)
})
