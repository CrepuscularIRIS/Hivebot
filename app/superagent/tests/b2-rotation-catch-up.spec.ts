// UI 验收 B2 残余 / 顾问复核 F1：DS-Bot 换段后，监听切到新段之前到达新段的用户消息不能丢。
// 实测（旧实现，按会话挂/摘，只靠 60s 巡检）：换段落盘后 0.28s 发到新段的真人消息，插件约 60s 后才切过去，
// trigger 表里永久没有这一行（/tmp/dsbot-trial/rotate-before-aftermath.log）。
import { describe, expect, test, vi } from 'vitest'
import { watchLocalMaster } from '../src/sources/local.ts'

type Handler = (session: { id: string }, event: unknown) => void
const mkCtx = () => {
  const handlers: Handler[] = []
  const dispose = vi.fn()
  const ctx = { on: (_type: string, handler: Handler) => { handlers.push(handler); return dispose } }
  return { ctx, dispose, emit: (sessionId: string, data: unknown) => handlers.forEach(h => h({ id: sessionId }, { type: 'user/message', data })) }
}
const human = (id: string, text: string) => ({ id, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user', rpcId: 'rpc-' + id } })

const setup = (windowMs = 120_000) => {
  const { ctx, dispose, emit } = mkCtx()
  const receive = vi.fn()
  let clock = 1_000_000
  const watch = watchLocalMaster(ctx as never, { receive, windowMs, now: () => clock })
  return { receive, dispose, emit, watch, tick: (ms: number) => { clock += ms } }
}

describe('UI 验收 B2 残余：换段窗口内先到新段的用户消息，监听切过去时补记', () => {
  test('消息先到新段（当时主会话还是旧段）→ 先不入账；retarget 到新段后按到达顺序补交，trigger 保持到达时的形状', () => {
    const { receive, emit, watch } = setup()
    watch.retarget('session-old')
    emit('session-old', human('m0', 'old part message'))
    emit('session-new', human('m1', 'first into the new part'))
    emit('session-new', human('m2', 'second into the new part'))
    expect(receive).toHaveBeenCalledTimes(1) // 只有旧段那条是即时的
    watch.retarget('session-new')
    expect(receive).toHaveBeenCalledTimes(3)
    expect(receive.mock.calls[1]?.[0]).toMatchObject({
      id: 'local:session-new:m1', text: 'first into the new part', human: true, addressed: 'direct', channel: { address: { session: 'session-new' } },
    })
    expect(receive.mock.calls[2]?.[0]).toMatchObject({ id: 'local:session-new:m2' })
  })

  test('切过去之后新段的消息即时入账；重复 retarget 同一会话（ensure 失败后的下一轮）不重复入账', () => {
    const { receive, emit, watch } = setup()
    watch.retarget('session-old')
    watch.retarget('session-new')
    emit('session-new', human('m1', 'after the switch'))
    watch.retarget('session-new')
    expect(receive).toHaveBeenCalledTimes(1)
    expect(receive.mock.calls[0]?.[0]).toMatchObject({ id: 'local:session-new:m1' })
  })

  test('插件启动到首次绑定之间到达的消息同样补记（启动窗口）', () => {
    const { receive, emit, watch } = setup()
    emit('session-chief', human('m1', 'typed right after boot'))
    expect(receive).not.toHaveBeenCalled()
    watch.retarget('session-chief')
    expect(receive).toHaveBeenCalledTimes(1)
    expect(receive.mock.calls[0]?.[0]).toMatchObject({ id: 'local:session-chief:m1' })
  })

  test('离开的旧段再来的消息不投递（只缓冲）；窗口内切回去才补交', () => {
    const { receive, emit, watch } = setup()
    watch.retarget('session-old')
    watch.retarget('session-new')
    emit('session-old', human('m1', 'sent to the left part'))
    expect(receive).not.toHaveBeenCalled()
    watch.retarget('session-old')
    expect(receive).toHaveBeenCalledTimes(1)
    expect(receive.mock.calls[0]?.[0]).toMatchObject({ id: 'local:session-old:m1' })
  })

  test('超过补记窗口的不补：入缓冲时清过期项，retarget 时再清一次；窗口内的照常', () => {
    const { receive, emit, watch, tick } = setup(60_000)
    emit('session-new', human('m0', 'too old by push time'))
    tick(60_001)
    emit('session-new', human('m1', 'fresh'))
    watch.retarget('session-old')
    tick(59_999)
    watch.retarget('session-new')
    expect(receive).toHaveBeenCalledTimes(1)
    expect(receive.mock.calls[0]?.[0]).toMatchObject({ id: 'local:session-new:m1' })

    const other = setup(60_000)
    other.emit('session-new', human('m0', 'too old by retarget time'))
    other.tick(60_001)
    other.watch.retarget('session-new')
    expect(other.receive).not.toHaveBeenCalled()
  })

  test('缓冲封顶：超过上限时最旧的被挤掉，只补最近的', () => {
    const { receive, emit, watch } = setup()
    for (let i = 0; i < 201; i++) emit('session-new', human('m' + i, 'message ' + i))
    watch.retarget('session-new')
    expect(receive).toHaveBeenCalledTimes(200)
    expect(receive.mock.calls[0]?.[0]).toMatchObject({ id: 'local:session-new:m1' })
    expect(receive.mock.calls[199]?.[0]).toMatchObject({ id: 'local:session-new:m200' })
  })

  test('补记前先过来源守卫：引擎注入、定时变更通知、本插件卡片永不补交', () => {
    const { receive, emit, watch } = setup()
    const injected = (text: string, source: unknown) => ({ id: 'm' + text.length, role: 'user', content: [{ type: 'text', text }], source })
    emit('session-new', injected('Current runtime context.', { kind: 'runtime-context', form: 'snapshot' }))
    emit('session-new', injected('[Bot team setup] You were just set up', { kind: 'bot', form: 'relay', role: 'kickoff' }))
    emit('session-new', injected('[SCHEDULE CHANGE] A scheduled task involving this session was changed outside this session.', { kind: 'schedule' }))
    emit('session-new', injected('   ', { kind: 'user' }))
    emit('session-new', injected(JSON.stringify({ kind: 'candidate', trigger_id: 'local:session-new:m0', next_action: 'x' }), { kind: 'user' }))
    watch.retarget('session-new')
    expect(receive).not.toHaveBeenCalled()
    emit('session-new', human('m9', 'real one'))
    expect(receive).toHaveBeenCalledTimes(1)
  })

  test('stop 之后不再入账、不再补记，并退订', () => {
    const { receive, dispose, emit, watch } = setup()
    watch.retarget('session-old')
    watch.stop()
    emit('session-new', human('m1', 'after stop'))
    watch.retarget('session-new')
    expect(receive).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
