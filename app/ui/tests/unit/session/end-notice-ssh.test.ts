// T12a：ssh 断连专用 endNotice——真帧喂测（不喂自编形状）。
// 真帧来源：receipts/T12a.md 第 1 步，ssh-bash.test.ts T12a ⑦ 实测（web 组合 session/follow）。
import { describe, expect, it } from 'vitest'
import { initView, reduceFollow, type SessionView } from '../../../renderer/session/reduce'
import { SSH_LOST_NOTICE } from '../../../renderer/session/reduce'
import { foldTurns } from '../../../renderer/fold/turn-fold'

// [T12a-raw] turn/end 原样（仅去掉外层 seq/time 等非语义字段以外的部分保持原样）：
const TURN_END_SSH_RAW = { type: 'event', event: { type: 'turn/end', seq: 20, time: 1794103138266, data: { turn: 1, reason: { kind: 'error', error: { message: 'SSH connection is closed', code: 'UNKNOWN' } } } } }
const TOOL_RESULT_SSH_RAW = { type: 'event', event: { type: 'tool/result', seq: 18, time: 1794103138263, data: { turn: 1, step: 1, message: { role: 'tool', source: { kind: 'tool', callId: 't10-a229ef' }, toolCallId: 't10-a229ef', content: [{ type: 'text', text: 'Error: SSH helper disconnected; outcome is unknown' }], isError: true, id: 'c568c124-d77b-4579-bfdc-1d62603db2b1' } }, sourceEventSeqs: [15], surfaceOp: 'append' } }

const run = (frames: unknown[], v: SessionView = initView('s')): SessionView => frames.reduce<SessionView>((acc, f) => reduceFollow(acc, f), v)

describe('T12a ssh 断连 endNotice（真帧）', () => {
  it('真帧 turn/end → SSH_LOST_NOTICE；同帧 tool/result 的 outcome unknown 也在链上', () => {
    const v = run([TOOL_RESULT_SSH_RAW, TURN_END_SSH_RAW])
    // 真帧带 time → reduceEvent 附 at（非语义字段），toMatchObject
    expect(v.items.at(-1)).toMatchObject({ kind: 'notice', id: 'end-1', tone: 'danger', text: SSH_LOST_NOTICE })
  })
  it('普通错误正对照：仍是 回复失败：boom', () => {
    const v = run([{ type: 'event', event: { type: 'turn/end', data: { turn: 3, reason: { kind: 'error', message: 'boom' } } } }])
    expect(v.items.at(-1)).toEqual({ kind: 'notice', id: 'end-3', tone: 'danger', text: '回复失败：boom' })
  })
  it('foldTurns：ssh 断连回合仍判 error（文案改动不绕过 turn-fold.ts:73-76）', () => {
    const v = run([TOOL_RESULT_SSH_RAW, TURN_END_SSH_RAW])
    const folded = foldTurns(v.items, { hasMore: false })
    const seg = folded.entries.at(-1)
    expect(seg?.source).toBe('reduce')
    expect((seg as { tone?: string }).tone).toBe('danger') // turn-fold.ts:73-76 判回合 error 的判据
  })
})
