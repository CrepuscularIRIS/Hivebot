// T21 先红：outline.ts 不存在 → import 失败。
import { toOutlineItems } from '../../../../renderer-grok/shim/src/outline'

describe('T21 toOutlineItems', () => {
  it('映射表逐行（user/ack/result/中间轮/reasoning/tool 三态/notice 不进/流式尾）', () => {
    expect(typeof toOutlineItems).toBe('function')
  })
})
